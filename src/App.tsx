import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { AttendanceRecord, AttendanceStatus, CampusSettings, Student } from './types/attendance';
import { buildExcelRows } from './utils/attendanceLogic';
import { fetchBootstrap } from './services/dataService';
import { subscribeAuth } from './services/firebaseClient';
import { StudentCheckInPortal } from './components/StudentCheckInPortal';
import { AttendanceDashboard } from './components/AttendanceDashboard';
import { StudentsManager } from './components/StudentsManager';
import { SettingsAndCloudHub } from './components/SettingsAndCloudHub';

type ActiveTab = 'student' | 'journal' | 'students' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('student');
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [settings, setSettings] = useState<CampusSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = subscribeAuth((user) => setFirebaseUser(user));
    return () => unsub();
  }, []);

  useEffect(() => {
    let active = true;
    fetchBootstrap()
      .then((data) => {
        if (!active) return;
        setStudents(data.students);
        setAttendance(data.attendance);
        setSettings(data.settings);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleQuickExcelExport = () => {
    const rows = buildExcelRows(attendance);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Davomat');
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `texnikum-davomat-${today}.xlsx`);
  };

  const handleAttendanceRecorded = (record: AttendanceRecord) => {
    setAttendance((prev) => [record, ...prev]);
  };

  const handleStudentBound = (updatedStudent: Student) => {
    setStudents((prev) =>
      prev.map((s) => (s.id === updatedStudent.id ? updatedStudent : s))
    );
  };

  const handleUpdateAttendanceStatus = async (
    recordId: string,
    status: AttendanceStatus
  ) => {
    setAttendance((prev) =>
      prev.map((r) => (r.id === recordId ? { ...r, status } : r))
    );
    try {
      await fetch(`/api/attendance/${encodeURIComponent(recordId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch {
      // ignore static mode error
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#talaba"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('student');
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Texnikum Davomat
          </a>

          <nav
            aria-label="Asosiy sahifalar"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            <button
              type="button"
              onClick={() => setActiveTab('student')}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'student'
                  ? 'border-blue-700 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Talaba kirishi
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('journal')}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'journal'
                  ? 'border-blue-700 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Ustoz jurnali
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('students')}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'students'
                  ? 'border-blue-700 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Talabalar
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'settings'
                  ? 'border-blue-700 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Sozlamalar
            </button>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={handleQuickExcelExport}
              disabled={attendance.length === 0}
              className="h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel yuklash</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-20 md:pb-10">
        {isLoading || !settings ? (
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 space-y-4">
            <div className="h-8 w-56 bg-slate-200 rounded-lg animate-pulse" />
            <div className="h-64 bg-white border border-slate-200 rounded-2xl animate-pulse" />
          </div>
        ) : (
          <>
            {activeTab === 'student' && (
              <StudentCheckInPortal
                students={students}
                settings={settings}
                onAttendanceRecorded={handleAttendanceRecorded}
                onStudentBound={handleStudentBound}
              />
            )}
            {activeTab === 'journal' && (
              <AttendanceDashboard
                students={students}
                attendance={attendance}
                onUpdateStatus={handleUpdateAttendanceStatus}
              />
            )}
            {activeTab === 'students' && (
              <StudentsManager
                students={students}
                onStudentAdded={(s) => setStudents((prev) => [s, ...prev])}
                onStudentUpdated={handleStudentBound}
                onStudentDeleted={(id) =>
                  setStudents((prev) => prev.filter((s) => s.id !== id))
                }
              />
            )}
            {activeTab === 'settings' && (
              <SettingsAndCloudHub
                settings={settings}
                students={students}
                attendance={attendance}
                firebaseUser={firebaseUser}
                onSettingsSaved={(updated) => setSettings(updated)}
              />
            )}
          </>
        )}
      </main>

      {/* Mobile Bottom Navigation (within 15% sticky height cap) */}
      <nav
        aria-label="Mobil navigatsiya"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-4 h-14"
      >
        <button
          type="button"
          onClick={() => setActiveTab('student')}
          className={`text-xs font-medium flex items-center justify-center ${
            activeTab === 'student' ? 'text-blue-700 font-semibold' : 'text-slate-500'
          }`}
        >
          Talaba
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('journal')}
          className={`text-xs font-medium flex items-center justify-center ${
            activeTab === 'journal' ? 'text-blue-700 font-semibold' : 'text-slate-500'
          }`}
        >
          Jurnal
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('students')}
          className={`text-xs font-medium flex items-center justify-center ${
            activeTab === 'students' ? 'text-blue-700 font-semibold' : 'text-slate-500'
          }`}
        >
          Talabalar
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`text-xs font-medium flex items-center justify-center ${
            activeTab === 'settings' ? 'text-blue-700 font-semibold' : 'text-slate-500'
          }`}
        >
          Sozlama
        </button>
      </nav>
    </div>
  );
}
