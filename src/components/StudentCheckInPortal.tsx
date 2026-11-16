import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Lock,
  LogOut,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Upload,
  UserCheck,
} from 'lucide-react';
import type { AttendanceRecord, CampusSettings, Student } from '../types/attendance';
import {
  calculateDistanceMeters,
  determineAttendanceStatus,
  evaluateGeofence,
} from '../utils/attendanceLogic';
import {
  getOrCreateDeviceId,
  loginStudentWithDeviceLock,
  submitAttendanceRecord,
} from '../services/dataService';
import { ensureFaceModelsLoaded, verifyFaceFrameAgainstPhoto } from '../services/faceService';

interface StudentCheckInPortalProps {
  students: Student[];
  settings: CampusSettings;
  onAttendanceRecorded: (record: AttendanceRecord) => void;
  onStudentBound: (student: Student) => void;
}

type CheckStep = 'login' | 'face' | 'gps' | 'done';

export const StudentCheckInPortal: React.FC<StudentCheckInPortalProps> = ({
  students,
  settings,
  onAttendanceRecorded,
  onStudentBound,
}) => {
  const [deviceId] = useState<string>(() => getOrCreateDeviceId());
  const [step, setStep] = useState<CheckStep>('login');
  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [activeStudent, setActiveStudent] = useState<Student | null>(null);
  const [boundNowNotice, setBoundNowNotice] = useState(false);

  // Face verification state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [modelsReady, setModelsReady] = useState(false);
  const [cameraState, setCameraState] = useState<'starting' | 'active' | 'unavailable'>('starting');
  const [faceMessage, setFaceMessage] = useState<string>('Yuzni aniqlash moduli tayyorlanmoqda...');
  const [faceScore, setFaceScore] = useState<number | null>(null);
  const [faceBox, setFaceBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isScanningFace, setIsScanningFace] = useState(false);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(null);

  // GPS & Completion state
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [finalRecord, setFinalRecord] = useState<AttendanceRecord | null>(null);

  const boundStudentOnThisDevice = students.find((s) => s.deviceId === deviceId) || null;

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Preload face-api models and start front camera when entering 'face' step
  useEffect(() => {
    if (step !== 'face' || !activeStudent) return;

    let cancelled = false;
    let scanTimer: number | null = null;

    const initCameraAndModels = async () => {
      setCameraState('starting');
      setFaceMessage('face-api.js modellari yuklanmoqda...');
      try {
        await ensureFaceModelsLoaded();
        if (cancelled) return;
        setModelsReady(true);
      } catch {
        if (cancelled) return;
        setFaceMessage('Yuz modellari yuklanishida xatolik.');
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (!cancelled) {
          setCameraState('unavailable');
          setFaceMessage('Brauzerda kamera API mavjud emas. Quyidan rasm yuklab tekshiring.');
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraState('active');
        setFaceMessage('Kameraga to‘g‘ri qarang — yuz avtomatik solishtirilmoqda...');

        const runLoop = async () => {
          if (cancelled || !videoRef.current || videoRef.current.readyState < 2) {
            if (!cancelled) {
              scanTimer = window.setTimeout(runLoop, 500);
            }
            return;
          }
          setIsScanningFace(true);
          try {
            const outcome = await verifyFaceFrameAgainstPhoto(
              videoRef.current,
              activeStudent.photoUrl
            );
            if (cancelled) return;
            setFaceBox(outcome.box || null);
            if (outcome.detected) {
              setFaceScore(outcome.similarityPercent);
              if (outcome.matched) {
                setFaceMessage(
                  `Yuz tasdiqlandi (${outcome.similarityPercent}% moslik). GPS koordinata olinmoqda...`
                );
                stopCamera();
                triggerAutoGpsCheck(activeStudent, outcome.similarityPercent);
                return;
              } else {
                setFaceMessage(
                  `Yuz mos kelmadi (${outcome.similarityPercent}%). Yaxshiroq yorug‘likda qarang.`
                );
              }
            } else if (outcome.error) {
              setFaceMessage(outcome.error);
            }
          } catch (err) {
            if (!cancelled) {
              setFaceMessage(err instanceof Error ? err.message : 'Yuzni tekshirishda xatolik');
            }
          } finally {
            if (!cancelled) {
              setIsScanningFace(false);
              scanTimer = window.setTimeout(runLoop, 700);
            }
          }
        };

        scanTimer = window.setTimeout(runLoop, 600);
      } catch {
        if (!cancelled) {
          setCameraState('unavailable');
          setFaceMessage('Kamera topilmadi yoki ruxsat rad etildi. Rasm fayl orqali tasdiqlashingiz mumkin.');
        }
      }
    };

    void initCameraAndModels();

    return () => {
      cancelled = true;
      if (scanTimer) window.clearTimeout(scanTimer);
      stopCamera();
    };
  }, [step, activeStudent]);

  const triggerAutoGpsCheck = (student: Student, verifiedFaceScore: number) => {
    setStep('gps');
    setGpsError(null);
    setIsLocating(true);

    if (!navigator.geolocation) {
      setIsLocating(false);
      setGpsError('Qurilmada Geolocation (GPS) qo‘llab-quvvatlanmaydi.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const distanceMeters = calculateDistanceMeters(lat, lng, settings.lat, settings.lng);
        const geo = evaluateGeofence(distanceMeters, settings.allowedRadiusMeters);
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
          now.getMinutes()
        ).padStart(2, '0')}`;
        const status = determineAttendanceStatus(
          geo.withinRadius,
          timeStr,
          settings.lateAfterTime
        );

        try {
          const saved = await submitAttendanceRecord(
            {
              studentId: student.id,
              studentName: student.fullName,
              groupName: student.groupName,
              dateStr,
              timeStr,
              status,
              distanceMeters,
              faceScore: verifiedFaceScore,
              deviceId,
              lat,
              lng,
            },
            settings.googleSheetsWebhookUrl
          );
          onAttendanceRecorded(saved);
          setFinalRecord(saved);
          setStep('done');
        } catch (err) {
          setGpsError(err instanceof Error ? err.message : 'Davomatni saqlashda xatolik.');
        } finally {
          setIsLocating(false);
        }
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError(
            'GPS ruxsati rad etildi. Brauzer sozlamasidan joylashuvga ruxsat bering va qayta urinib ko‘ring.'
          );
        } else {
          setGpsError('GPS koordinatasini aniqlab bo‘lmadi. Qayta urinib ko‘ring.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const trimmedLogin = loginInput.trim();
    if (!trimmedLogin || !passwordInput) {
      setAuthError('Iltimos, login va parolni kiriting.');
      return;
    }

    setIsLoggingIn(true);
    try {
      const { student, boundNow } = await loginStudentWithDeviceLock(
        trimmedLogin,
        passwordInput,
        deviceId
      );
      setActiveStudent(student);
      setBoundNowNotice(boundNow);
      if (boundNow) {
        onStudentBound(student);
      }
      setFaceScore(null);
      setUploadedPreviewUrl(null);
      setStep('face');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Tizimga kirishda xatolik.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handlePhotoUploadCheck = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeStudent) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      setUploadedPreviewUrl(dataUrl);
      setIsScanningFace(true);
      setFaceMessage('Yuklangan rasm yuz bazasi bilan solishtirilmoqda...');
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Rasmni o‘qib bo‘lmadi'));
          img.src = dataUrl;
        });
        const outcome = await verifyFaceFrameAgainstPhoto(img, activeStudent.photoUrl);
        if (!outcome.detected) {
          setFaceScore(0);
          setFaceMessage(outcome.error || 'Rasmda yuz aniqlanmadi.');
          return;
        }
        setFaceScore(outcome.similarityPercent);
        if (outcome.matched) {
          setFaceMessage(
            `Yuz tasdiqlandi (${outcome.similarityPercent}% moslik). Avtomatik GPS ishga tushmoqda...`
          );
          stopCamera();
          triggerAutoGpsCheck(activeStudent, outcome.similarityPercent);
        } else {
          setFaceMessage(
            `Yuz mos kelmadi (${outcome.similarityPercent}%). Bu rasm ${activeStudent.fullName} ga tegishli emas.`
          );
        }
      } catch (err) {
        setFaceMessage(err instanceof Error ? err.message : 'Yuzni solishtirishda xatolik.');
      } finally {
        setIsScanningFace(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetFlow = () => {
    stopCamera();
    setStep('login');
    setActiveStudent(null);
    setFinalRecord(null);
    setAuthError(null);
    setGpsError(null);
    setFaceScore(null);
    setUploadedPreviewUrl(null);
    setLoginInput('');
    setPasswordInput('');
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        {/* Main Interactive Check-in Column */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-100">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Talaba davomat tekshiruvi
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Login · Yuzni aniqlash (face-api.js) · Avtomatik GPS
              </p>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-xs text-slate-500">Qurilma identifikatori</div>
              <div
                data-testid="current-device-id"
                className="font-mono text-xs font-medium text-slate-800 tabular-nums"
              >
                {deviceId}
              </div>
            </div>
          </div>

          {/* Stepper Indicator */}
          <div className="grid grid-cols-3 gap-2 py-4 border-b border-slate-100 text-xs font-medium">
            <div
              className={`py-2 px-2.5 sm:px-3 rounded-lg flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 ${
                step === 'login'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 bg-slate-50'
              }`}
            >
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span className="sm:hidden whitespace-nowrap">1. Login</span>
              <span className="hidden sm:inline whitespace-nowrap">1. Login va Qurilma</span>
            </div>
            <div
              className={`py-2 px-2.5 sm:px-3 rounded-lg flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 ${
                step === 'face'
                  ? 'bg-blue-50 text-blue-700'
                  : step === 'gps' || step === 'done'
                  ? 'text-emerald-700 bg-emerald-50'
                  : 'text-slate-400 bg-slate-50'
              }`}
            >
              <Camera className="w-3.5 h-3.5 shrink-0" />
              <span className="sm:hidden whitespace-nowrap">2. Yuz</span>
              <span className="hidden sm:inline whitespace-nowrap">2. Yuzni tasdiqlash</span>
            </div>
            <div
              className={`py-2 px-2.5 sm:px-3 rounded-lg flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 ${
                step === 'gps'
                  ? 'bg-blue-50 text-blue-700'
                  : step === 'done'
                  ? 'text-emerald-700 bg-emerald-50'
                  : 'text-slate-400 bg-slate-50'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="sm:hidden whitespace-nowrap">3. GPS</span>
              <span className="hidden sm:inline whitespace-nowrap">3. Avto GPS</span>
            </div>
          </div>

          {/* STEP 1: LOGIN */}
          {step === 'login' && (
            <form onSubmit={handleLoginSubmit} className="mt-6 space-y-5">
              {boundStudentOnThisDevice && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 flex items-start gap-3">
                  <Smartphone className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-slate-900">
                      Ushbu telefon biriktirilgan: {boundStudentOnThisDevice.fullName}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Device Lock qoidasiga ko‘ra boshqa talaba ushbu qurilmadan kira olmaydi.
                    </p>
                  </div>
                </div>
              )}

              {authError && (
                <div
                  role="alert"
                  className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-3"
                >
                  <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">Kirish rad etildi</div>
                    <p className="mt-0.5">{authError}</p>
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="student-login"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Talaba logini
                </label>
                <input
                  id="student-login"
                  type="text"
                  autoComplete="username"
                  value={loginInput}
                  onChange={(e) => setLoginInput(e.target.value)}
                  placeholder="Masalan: azizbek"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>

              <div>
                <label
                  htmlFor="student-password"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Parol
                </label>
                <input
                  id="student-password"
                  type="password"
                  autoComplete="current-password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="•••••"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full h-12 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoggingIn ? 'Tekshirilmoqda...' : 'Kirish va kamerani yoqish'}
              </button>
            </form>
          )}

          {/* STEP 2: FACE VERIFICATION */}
          {step === 'face' && activeStudent && (
            <div className="mt-6 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <img
                    src={activeStudent.photoUrl}
                    alt={activeStudent.fullName}
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-xl object-cover border border-slate-200"
                  />
                  <div>
                    <div className="font-semibold text-slate-900">{activeStudent.fullName}</div>
                    <div className="text-xs text-slate-500">
                      {activeStudent.groupName} · {boundNowNotice ? 'Telefon yangi biriktirildi' : 'Tasdiqlangan qurilma'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleResetFlow}
                  className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Chiqish</span>
                </button>
              </div>

              {/* Camera Viewport */}
              <div className="relative overflow-hidden rounded-2xl bg-slate-900 aspect-[4/3] flex items-center justify-center border border-slate-200">
                {cameraState !== 'unavailable' ? (
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                ) : uploadedPreviewUrl ? (
                  <img
                    src={uploadedPreviewUrl}
                    alt="Tekshirish uchun rasm"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain bg-slate-950"
                  />
                ) : (
                  <div className="p-6 text-center text-slate-300 max-w-sm">
                    <Camera className="w-10 h-10 mx-auto mb-3 text-slate-400" />
                    <p className="text-sm font-medium text-white">
                      Old kamera faol emas
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Telefonda brauzerga kamera ruxsatini bering yoki quyidan tekshirish rasmini yuklang.
                    </p>
                  </div>
                )}

                {faceBox && cameraState === 'active' && (
                  <div
                    className="absolute border-2 border-emerald-400 rounded-xl pointer-events-none"
                    style={{
                      left: '25%',
                      top: '15%',
                      width: '50%',
                      height: '70%',
                    }}
                  />
                )}
              </div>

              {/* Status Readout */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
                <div className="text-sm text-slate-700">
                  <div className="font-medium text-slate-900">{faceMessage}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {modelsReady ? 'face-api.js neyron tarmog‘i faol' : 'Modellar yuklanmoqda...'}
                    {isScanningFace ? ' · Tahlil qilinmoqda...' : ''}
                  </div>
                </div>
                {faceScore !== null && (
                  <div className="text-right shrink-0">
                    <div className="text-xs text-slate-500">Moslik</div>
                    <div className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                      {faceScore}%
                    </div>
                  </div>
                )}
              </div>

              {/* Photo Upload Fallback for Devices Without Webcam */}
              <div className="pt-2 border-t border-slate-100">
                <label
                  htmlFor="face-upload-input"
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span>Rasm fayl orqali yuzni tekshirish (face-api.js)</span>
                </label>
                <input
                  id="face-upload-input"
                  data-testid="face-upload-input"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUploadCheck}
                  className="sr-only"
                />
              </div>
            </div>
          )}

          {/* STEP 3: AUTOMATIC GPS */}
          {step === 'gps' && activeStudent && (
            <div className="mt-6 py-8 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <MapPin className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {isLocating ? 'GPS koordinata avtomatik olinmoqda...' : 'GPS tekshiruvi'}
                </h2>
                <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
                  Yuzingiz tasdiqlandi ({faceScore}%). Texnikum hududidan masofa o‘lchanib, davomat bazaga yuborilmoqda.
                </p>
              </div>

              {gpsError && (
                <div className="max-w-md mx-auto p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 space-y-3">
                  <p>{gpsError}</p>
                  <button
                    type="button"
                    onClick={() => triggerAutoGpsCheck(activeStudent, faceScore ?? 85)}
                    className="px-4 py-2 rounded-lg bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>GPSni qayta tekshirish</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: DONE RECEIPT */}
          {step === 'done' && finalRecord && (
            <div className="mt-6 space-y-5" data-testid="attendance-receipt">
              <div
                className={`p-5 rounded-2xl border ${
                  finalRecord.status === 'Hududdan tashqari'
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-emerald-50 border-emerald-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    className={`w-6 h-6 shrink-0 mt-0.5 ${
                      finalRecord.status === 'Hududdan tashqari'
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                    }`}
                  />
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Davomat qayd etildi: {finalRecord.status}
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {finalRecord.status === 'Hududdan tashqari'
                        ? `Siz texnikum hududidan ${finalRecord.distanceMeters} metr uzoqdasiz (ruxsat etilgan radius: ${settings.allowedRadiusMeters} m).`
                        : `Sizning davomatingiz muvaffaqiyatli saqlandi va ustoz jadvaliga tushdi.`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Talaba</div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {finalRecord.studentName}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Sana va Vaqt</div>
                  <div className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">
                    {finalRecord.dateStr} · {finalRecord.timeStr}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">GPS Masofa</div>
                  <div className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">
                    {finalRecord.distanceMeters} m
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Yuz mosligi</div>
                  <div className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">
                    {finalRecord.faceScore}%
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetFlow}
                className="w-full h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold transition-colors cursor-pointer"
              >
                Boshqa hisob bilan kirish / Chiqish
              </button>
            </div>
          )}
        </section>

        {/* Right Info Column: Campus Rules & Quick Demo Roster */}
        <aside className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <h2 className="text-base font-bold text-slate-900">
              Texnikum hududi va qoidalar
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4 py-2 border-b border-slate-100">
                <dt className="text-slate-500">Muassasa</dt>
                <dd className="font-medium text-slate-900 text-right">{settings.campusName}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2 border-b border-slate-100">
                <dt className="text-slate-500">Markaz koordinata</dt>
                <dd className="font-mono text-xs font-medium text-slate-800 tabular-nums">
                  {settings.lat.toFixed(5)}, {settings.lng.toFixed(5)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2 border-b border-slate-100">
                <dt className="text-slate-500">Ruxsat etilgan radius</dt>
                <dd className="font-mono font-semibold text-blue-700 tabular-nums">
                  {settings.allowedRadiusMeters} metr
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-slate-500">Kechikish chegarasi</dt>
                <dd className="font-mono font-medium text-slate-900 tabular-nums">
                  {settings.lateAfterTime} dan keyin
                </dd>
              </div>
            </dl>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Sinov uchun talaba hisoblari
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {students.length} ta talaba
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Talaba ustiga bosib login-parolni tezkor to‘ldirishingiz mumkin.
            </p>
            <div className="mt-4 divide-y divide-slate-100">
              {students.slice(0, 5).map((stu) => (
                <button
                  key={stu.id}
                  type="button"
                  onClick={() => {
                    if (step === 'login') {
                      setLoginInput(stu.login);
                      setPasswordInput(stu.password);
                      setAuthError(null);
                    }
                  }}
                  className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 rounded-lg px-2 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={stu.photoUrl}
                      alt={stu.fullName}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {stu.fullName}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {stu.groupName} · login: {stu.login} / {stu.password}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-xs font-medium text-slate-600 flex items-center gap-1">
                    {stu.deviceId ? (
                      <>
                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Band</span>
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Bo‘sh</span>
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
