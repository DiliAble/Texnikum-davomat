import type { AttendanceRecord, AttendanceStatus, Student } from '../types/attendance';

export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function evaluateGeofence(
  distanceMeters: number,
  allowedRadiusMeters: number
): { withinRadius: boolean; distanceMeters: number } {
  return {
    withinRadius: distanceMeters <= allowedRadiusMeters,
    distanceMeters,
  };
}

export interface DeviceLockResult {
  allowed: boolean;
  shouldBind: boolean;
  reason?: 'DEVICE_BOUND_TO_OTHER' | 'ACCOUNT_BOUND_TO_OTHER';
  message?: string;
}

export function evaluateDeviceLock(
  studentId: string,
  studentBoundDeviceId: string | null | undefined,
  currentDeviceId: string,
  studentBoundToCurrentDevice: Pick<Student, 'id' | 'fullName'> | null
): DeviceLockResult {
  if (studentBoundToCurrentDevice && studentBoundToCurrentDevice.id !== studentId) {
    return {
      allowed: false,
      shouldBind: false,
      reason: 'DEVICE_BOUND_TO_OTHER',
      message: `Bu telefon boshqa talabaga biriktirilgan! (${studentBoundToCurrentDevice.fullName})`,
    };
  }

  if (studentBoundDeviceId && studentBoundDeviceId !== currentDeviceId) {
    return {
      allowed: false,
      shouldBind: false,
      reason: 'ACCOUNT_BOUND_TO_OTHER',
      message:
        'Sizning akkountingiz boshqa telefonga biriktirilgan! Ustozdan qurilmani yechishni so‘rang.',
    };
  }

  return {
    allowed: true,
    shouldBind: !studentBoundDeviceId,
  };
}

export function computeFaceMatchScore(
  euclideanDistance: number,
  threshold = 0.58
): { matched: boolean; similarityPercent: number; distance: number } {
  const clampedDist = Math.max(0, Math.min(1.5, euclideanDistance));
  const similarityPercent = Math.max(
    0,
    Math.min(100, Math.round((1 - clampedDist / 1.15) * 100))
  );
  return {
    matched: clampedDist <= threshold,
    similarityPercent,
    distance: Number(clampedDist.toFixed(3)),
  };
}

export function determineAttendanceStatus(
  withinRadius: boolean,
  checkTimeHHMM: string,
  lateAfterTimeHHMM: string
): AttendanceStatus {
  if (!withinRadius) {
    return 'Hududdan tashqari';
  }
  if (checkTimeHHMM > lateAfterTimeHHMM) {
    return 'Kechikdi';
  }
  return 'Bor';
}

export interface ExcelAttendanceRow {
  '№': number;
  'F.I.Sh.': string;
  Guruh: string;
  Sana: string;
  Vaqt: string;
  Holati: string;
  'Masofa (m)': number;
  'Yuz mosligi (%)': number;
  'Qurilma ID': string;
  'Google Sheets': string;
}

export function buildExcelRows(records: AttendanceRecord[]): ExcelAttendanceRow[] {
  return records.map((rec, index) => ({
    '№': index + 1,
    'F.I.Sh.': rec.studentName,
    Guruh: rec.groupName,
    Sana: rec.dateStr,
    Vaqt: rec.timeStr,
    Holati: rec.status,
    'Masofa (m)': rec.distanceMeters,
    'Yuz mosligi (%)': rec.faceScore,
    'Qurilma ID': rec.deviceId,
    'Google Sheets': rec.syncedToSheets ? 'Yuborilgan' : 'Mahalliy',
  }));
}

export function generateGoogleAppsScriptCode(): string {
  return `// Google Sheets -> Kengaytmalar (Extensions) -> Apps Script ichiga joylang
// So'ng: Deploy -> New deployment -> Web app (Who has access: Anyone)

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Sana',
        'Vaqt',
        'Ism-Familiya',
        'Guruh',
        'Status',
        'Masofa (metr)',
        'Yuz mosligi (%)',
        'Qurilma ID'
      ]);
      sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
    }

    var data = JSON.parse(e.postData.contents);
    sheet.appendRow([
      data.dateStr || '',
      data.timeStr || '',
      data.studentName || '',
      data.groupName || '',
      data.status || 'Bor',
      data.distanceMeters || 0,
      data.faceScore || 0,
      data.deviceId || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;
}
