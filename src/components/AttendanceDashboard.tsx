import React, { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { AttendanceRecord, AttendanceStatus, Student } from '../types/attendance';
import { buildExcelRows } from '../utils/attendanceLogic';

interface AttendanceDashboardProps {
  students: Student[];
  attendance: AttendanceRecord[];
  onUpdateStatus: (recordId: string, status: AttendanceStatus) => void;
}

export const AttendanceDashboard: React.FC<AttendanceDashboardProps> = ({
  students,
  attendance,
  onUpdateStatus,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState('');

  const groups = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => set.add(s.groupName));
    attendance.forEach((a) => {
      if (a.groupName) set.add(a.groupName);
    });
    return Array.from(set).sort();
  }, [students, attendance]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return attendance.filter((rec) => {
      if (selectedGroup !== 'ALL' && rec.groupName !== selectedGroup) return false;
      if (selectedStatus !== 'ALL' && rec.status !== selectedStatus) return false;
      if (selectedDate && rec.dateStr !== selectedDate) return false;
      if (q) {
        const hay = `${rec.studentName} ${rec.groupName} ${rec.deviceId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [attendance, searchQuery, selectedGroup, selectedStatus, selectedDate]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayRecords = attendance.filter((a) => a.dateStr === todayStr);
  const presentTodayIds = new Set(
    todayRecords
      .filter((a) => a.status === 'Bor' || a.status === 'Kechikdi')
      .map((a) => a.studentId)
  );
  const lateTodayCount = todayRecords.filter((a) => a.status === 'Kechikdi').length;
  const attendanceRate =
    students.length > 0 ? Math.round((presentTodayIds.size / students.length) * 100) : 0;

  const handleExportExcel = () => {
    const rows = buildExcelRows(filteredRecords);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 5 },
      { wch: 24 },
      { wch: 12 },
      { wch: 12 },
      { wch: 9 },
      { wch: 18 },
      { wch: 13 },
      { wch: 16 },
      { wch: 18 },
      { wch: 14 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Davomat');
    const dateTag = selectedDate || todayStr;
    XLSX.writeFile(workbook, `texnikum-davomat-${dateTag}.xlsx`);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8 space-y-6">
      {/* KPI Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Jami talabalar</div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {students.length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Bugun kelganlar</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700 font-mono tabular-nums">
            {presentTodayIds.size}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Bugun kechikkanlar</div>
          <div className="mt-2 text-2xl font-bold text-amber-600 font-mono tabular-nums">
            {lateTodayCount}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Bugungi davomat</div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {attendanceRate}%
          </div>
        </div>
      </div>

      {/* Attendance Table Container */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Davomat jurnali</h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                Jami ko‘rsatilmoqda: {filteredRecords.length} ta yozuv
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filteredRecords.length === 0}
              className="h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Excelga yuklash (.xlsx)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                aria-label="Talaba qidirish"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ism yoki qurilma..."
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              aria-label="Guruh bo‘yicha filtrlash"
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">Barcha guruhlar</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>

            <select
              aria-label="Holat bo‘yicha filtrlash"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">Barcha holatlar</option>
              <option value="Bor">Bor</option>
              <option value="Kechikdi">Kechikdi</option>
              <option value="Hududdan tashqari">Hududdan tashqari</option>
            </select>

            <input
              type="date"
              aria-label="Sana bo‘yicha filtrlash"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-900">
              Tanlangan filtrlar bo‘yicha davomat yozuvlari topilmadi
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Talaba tizimdan tekshiruvdan o‘tishi bilan natija shu jadvalga avtomatik tushadi.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Talaba</th>
                  <th className="py-3 px-4">Guruh</th>
                  <th className="py-3 px-4">Sana va Vaqt</th>
                  <th className="py-3 px-4">Holati</th>
                  <th className="py-3 px-4 text-right">Masofa</th>
                  <th className="py-3 px-4 text-right">Yuz mosligi</th>
                  <th className="py-3 px-4">Qurilma ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {rec.studentName}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{rec.groupName}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums">
                      {rec.dateStr} · {rec.timeStr}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        aria-label={`${rec.studentName} davomat holati`}
                        value={rec.status}
                        onChange={(e) =>
                          onUpdateStatus(rec.id, e.target.value as AttendanceStatus)
                        }
                        className={`h-8 px-2 rounded-md border text-xs font-semibold bg-white cursor-pointer ${
                          rec.status === 'Bor'
                            ? 'text-emerald-700 border-emerald-200'
                            : rec.status === 'Kechikdi'
                            ? 'text-amber-700 border-amber-200'
                            : 'text-red-700 border-red-200'
                        }`}
                      >
                        <option value="Bor">Bor</option>
                        <option value="Kechikdi">Kechikdi</option>
                        <option value="Hududdan tashqari">Hududdan tashqari</option>
                        <option value="Yo'q">Yo'q</option>
                      </select>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {rec.distanceMeters} m
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {rec.faceScore}%
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500 tabular-nums">
                      {rec.deviceId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
