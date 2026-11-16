import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import { Cloud, Copy, Check, LocateFixed, Save } from 'lucide-react';
import type { AttendanceRecord, CampusSettings, Student } from '../types/attendance';
import { generateGoogleAppsScriptCode } from '../utils/attendanceLogic';
import { saveCampusSettings } from '../services/dataService';
import {
  firebaseConfig,
  signInTeacherWithGoogle,
  signOutTeacher,
  syncSnapshotToFirestore,
} from '../services/firebaseClient';

interface SettingsAndCloudHubProps {
  settings: CampusSettings;
  students: Student[];
  attendance: AttendanceRecord[];
  firebaseUser: User | null;
  onSettingsSaved: (updated: CampusSettings) => void;
}

export const SettingsAndCloudHub: React.FC<SettingsAndCloudHubProps> = ({
  settings,
  students,
  attendance,
  firebaseUser,
  onSettingsSaved,
}) => {
  const [form, setForm] = useState<CampusSettings>(settings);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [cloudStatus, setCloudStatus] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  const appsScriptCode = generateGoogleAppsScriptCode();

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setForm((prev) => ({
        ...prev,
        lat: Number(pos.coords.latitude.toFixed(6)),
        lng: Number(pos.coords.longitude.toFixed(6)),
      }));
    });
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const updated = await saveCampusSettings(form);
      onSettingsSaved(updated);
      setSaveMessage('Sozlamalar muvaffaqiyatli saqlandi.');
    } catch {
      setSaveMessage('Saqlashda xatolik yuz berdi.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setCloudStatus(null);
    try {
      await signInTeacherWithGoogle();
      setCloudStatus('Google hisob muvaffaqiyatli ulandi.');
    } catch (err) {
      setCloudStatus(
        err instanceof Error ? err.message : 'Google orqali kirishda xatolik.'
      );
    }
  };

  const handleSyncToFirestore = async () => {
    setIsSyncing(true);
    setCloudStatus(null);
    try {
      const res = await syncSnapshotToFirestore(students, attendance, form);
      setCloudStatus(
        `Cloud Firestore (${firebaseConfig.projectId}) bazasiga ${res.syncedCount} ta yozuv sinxronlandi.`
      );
    } catch (err) {
      setCloudStatus(err instanceof Error ? err.message : 'Sinxronlashda xatolik.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCopyScript = async () => {
    await navigator.clipboard.writeText(appsScriptCode);
    setCopiedScript(true);
    window.setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8 space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        {/* Campus GPS & Webhook Settings */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Texnikum GPS va Google Sheets
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Geofence radiusi va kechikish vaqtini belgilang.
              </p>
            </div>
            <button
              type="button"
              onClick={handleUseCurrentGps}
              className="h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <LocateFixed className="w-3.5 h-3.5" />
              <span>Joriy GPSni olish</span>
            </button>
          </div>

          <form onSubmit={handleSaveSettings} className="mt-5 space-y-4">
            <div>
              <label htmlFor="set-campus-name" className="block text-xs font-medium text-slate-700 mb-1">
                Texnikum nomi
              </label>
              <input
                id="set-campus-name"
                type="text"
                value={form.campusName}
                onChange={(e) => setForm({ ...form, campusName: e.target.value })}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="set-lat" className="block text-xs font-medium text-slate-700 mb-1">
                  Latitude (Kenglik)
                </label>
                <input
                  id="set-lat"
                  type="number"
                  step="any"
                  value={form.lat}
                  onChange={(e) => setForm({ ...form, lat: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label htmlFor="set-lng" className="block text-xs font-medium text-slate-700 mb-1">
                  Longitude (Uzunlik)
                </label>
                <input
                  id="set-lng"
                  type="number"
                  step="any"
                  value={form.lng}
                  onChange={(e) => setForm({ ...form, lng: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="set-radius" className="block text-xs font-medium text-slate-700 mb-1">
                  Ruxsat etilgan radius (metr)
                </label>
                <input
                  id="set-radius"
                  type="number"
                  min={10}
                  max={10000}
                  value={form.allowedRadiusMeters}
                  onChange={(e) =>
                    setForm({ ...form, allowedRadiusMeters: Number(e.target.value) })
                  }
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label htmlFor="set-late" className="block text-xs font-medium text-slate-700 mb-1">
                  Kechikish vaqti (HH:MM)
                </label>
                <input
                  id="set-late"
                  type="time"
                  value={form.lateAfterTime}
                  onChange={(e) => setForm({ ...form, lateAfterTime: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div>
              <label htmlFor="set-webhook" className="block text-xs font-medium text-slate-700 mb-1">
                Google Apps Script Web App URL (ixtiyoriy)
              </label>
              <input
                id="set-webhook"
                type="url"
                value={form.googleSheetsWebhookUrl}
                onChange={(e) =>
                  setForm({ ...form, googleSheetsWebhookUrl: e.target.value })
                }
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {saveMessage && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
                {saveMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="w-full h-11 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saqlanmoqda...' : 'Sozlamalarni saqlash'}</span>
            </button>
          </form>
        </section>

        {/* Firebase Cloud & Netlify Guide */}
        <section className="lg:col-span-6 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Firebase Cloud Firestore Sinxronizatsiyasi
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  Loyiha: {firebaseConfig.projectId}
                </p>
              </div>
              <Cloud className="w-5 h-5 text-blue-700 shrink-0" />
            </div>

            <div className="mt-4 space-y-3">
              {firebaseUser ? (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-sm">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {firebaseUser.displayName || 'Ustoz'}
                    </div>
                    <div className="text-xs text-slate-500">{firebaseUser.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void signOutTeacher()}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-white cursor-pointer"
                  >
                    Chiqish
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-sm font-semibold cursor-pointer transition-colors"
                >
                  Google orqali Firebase Admin sifatida kirish
                </button>
              )}

              <button
                type="button"
                disabled={!firebaseUser || isSyncing}
                onClick={handleSyncToFirestore}
                className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer transition-colors"
              >
                {isSyncing
                  ? 'Firestorega yuklanmoqda...'
                  : 'Talabalar va davomatni Firestorega sinxronlash'}
              </button>

              {cloudStatus && (
                <p className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  {cloudStatus}
                </p>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <h2 className="text-base font-bold text-slate-900">
              Netlifyga 100% bepul joylash (0 so‘m)
            </h2>
            <ol className="mt-3 space-y-2 text-xs text-slate-600 list-decimal list-inside">
              <li>
                Loyiha ildizida <code className="font-mono text-slate-900">npm run build</code>{' '}
                buyrug‘ini bajaring — tayyor statik sayt{' '}
                <code className="font-mono text-slate-900">dist/</code> papkasida yig‘iladi
                (ichida <code className="font-mono text-slate-900">face-api.js</code> modellari va{' '}
                <code className="font-mono text-slate-900">netlify.toml</code> mavjud).
              </li>
              <li>
                Netlify Drop yoki GitHub orqali <code className="font-mono text-slate-900">dist</code>{' '}
                papkani yuklang (oyiga 100 GB bepul trafik).
              </li>
              <li>
                Firebase Console → Authentication → Authorized domains bo‘limiga Netlify domeningizni qo‘shing.
              </li>
            </ol>
          </div>
        </section>
      </div>

      {/* Google Apps Script Code Panel */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Google Sheets Apps Script kodi (1-usul — to‘g‘ridan-to‘g‘ri jadvalga tushirish)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Google Sheets → Extensions → Apps Script bo‘limiga nusxalab joylang va Web App sifatida deploy qiling.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopyScript}
            className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
          >
            {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedScript ? 'Nusxalandi' : 'Kodni nusxalash'}</span>
          </button>
        </div>

        <pre className="mt-4 p-4 rounded-xl bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed">
          <code>{appsScriptCode}</code>
        </pre>
      </section>
    </div>
  );
};
