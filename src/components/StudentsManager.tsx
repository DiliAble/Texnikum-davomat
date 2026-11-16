import React, { useState } from 'react';
import { Trash2, Unlock, Upload, UserPlus } from 'lucide-react';
import type { Student } from '../types/attendance';
import { getReferenceDescriptor } from '../services/faceService';
import { createStudent, removeStudent, unlockStudentDevice } from '../services/dataService';

interface StudentsManagerProps {
  students: Student[];
  onStudentAdded: (student: Student) => void;
  onStudentUpdated: (student: Student) => void;
  onStudentDeleted: (studentId: string) => void;
}

export const StudentsManager: React.FC<StudentsManagerProps> = ({
  students,
  onStudentAdded,
  onStudentUpdated,
  onStudentDeleted,
}) => {
  const [fullName, setFullName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoCheckNote, setPhotoCheckNote] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      setPhotoUrl(dataUrl);
      setPhotoCheckNote('Namuna rasmda yuz tekshirilmoqda...');
      try {
        await getReferenceDescriptor(dataUrl);
        setPhotoCheckNote('Yuz aniqlandi — tizim uchun yaroqli.');
      } catch (err) {
        setPhotoCheckNote(
          err instanceof Error ? err.message : 'Rasmda yuz aniqlanmadi, lekin saqlash mumkin.'
        );
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!fullName.trim() || !groupName.trim() || !login.trim() || !password.trim()) {
      setFormError('Barcha majburiy maydonlarni to‘ldiring.');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createStudent({
        fullName: fullName.trim(),
        groupName: groupName.trim(),
        login: login.trim(),
        password: password.trim(),
        photoUrl: photoUrl || '/src/assets/images/student_azizbek_1794818865017.jpg',
      });
      onStudentAdded(created);
      setFullName('');
      setGroupName('');
      setLogin('');
      setPassword('');
      setPhotoUrl('');
      setPhotoCheckNote(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Talaba qo‘shishda xatolik.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlock = async (stu: Student) => {
    try {
      const updated = await unlockStudentDevice(stu.id);
      onStudentUpdated(updated);
    } catch {
      // ignore
    }
  };

  const handleDelete = async (stu: Student) => {
    try {
      await removeStudent(stu.id);
      onStudentDeleted(stu.id);
    } catch {
      // ignore
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        {/* Add Student Form */}
        <section className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-slate-900">Yangi talaba qo‘shish</h2>
          <p className="mt-1 text-xs text-slate-500">
            Talabaga login-parol va yuzni solishtirish uchun namuna rasm biriktiring.
          </p>

          <form onSubmit={handleCreateStudent} className="mt-5 space-y-4">
            {formError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
              >
                {formError}
              </div>
            )}

            <div>
              <label htmlFor="new-fullname" className="block text-xs font-medium text-slate-700 mb-1">
                F.I.Sh.
              </label>
              <input
                id="new-fullname"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Sardor Alimov"
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label htmlFor="new-group" className="block text-xs font-medium text-slate-700 mb-1">
                Guruh
              </label>
              <input
                id="new-group"
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="AT-21"
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="new-login" className="block text-xs font-medium text-slate-700 mb-1">
                  Login
                </label>
                <input
                  id="new-login"
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="sardor"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label htmlFor="new-pass" className="block text-xs font-medium text-slate-700 mb-1">
                  Parol
                </label>
                <input
                  id="new-pass"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="12345"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="new-photo-upload"
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>{photoUrl ? 'Boshqa namuna rasm tanlash' : 'Namuna rasm yuklash'}</span>
              </label>
              <input
                id="new-photo-upload"
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="sr-only"
              />
              {photoCheckNote && (
                <p className="mt-1.5 text-xs text-slate-600">{photoCheckNote}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span>{isSubmitting ? 'Saqlanmoqda...' : 'Talabani qo‘shish'}</span>
            </button>
          </form>
        </section>

        {/* Students Roster Table */}
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Talabalar va Device Lock</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Talaba telefonini almashtirsa, «Qurilmani yechish» tugmasi orqali blokni oching.
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-slate-600 tabular-nums">
              {students.length} ta
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {students.map((stu) => (
              <div
                key={stu.id}
                className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <img
                    src={stu.photoUrl}
                    alt={stu.fullName}
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {stu.fullName}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      {stu.groupName} · login: {stu.login} · parol: {stu.password}
                    </div>
                    <div className="mt-1 text-xs font-mono text-slate-600 tabular-nums">
                      {stu.deviceId
                        ? `Biriktirilgan qurilma: ${stu.deviceId}`
                        : 'Qurilma holati: Biriktirilmagan'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {stu.deviceId && (
                    <button
                      type="button"
                      onClick={() => handleUnlock(stu)}
                      aria-label={`Qurilmani yechish: ${stu.fullName}`}
                      className="h-9 px-3 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Qurilmani yechish</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(stu)}
                    aria-label={`O‘chirish: ${stu.fullName}`}
                    className="h-9 w-9 rounded-lg border border-slate-200 hover:bg-red-50 hover:border-red-200 text-slate-500 hover:text-red-700 inline-flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
