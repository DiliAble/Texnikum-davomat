export type AttendanceStatus = 'Bor' | 'Kechikdi' | 'Hududdan tashqari' | "Yo'q";

export interface Student {
  id: string;
  fullName: string;
  groupName: string;
  login: string;
  password: string;
  photoUrl: string;
  deviceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName: string;
  groupName: string;
  dateStr: string;
  timeStr: string;
  status: AttendanceStatus;
  distanceMeters: number;
  faceScore: number;
  deviceId: string;
  lat: number;
  lng: number;
  syncedToSheets: boolean;
  createdAt: string;
}

export interface CampusSettings {
  campusName: string;
  lat: number;
  lng: number;
  allowedRadiusMeters: number;
  lateAfterTime: string;
  googleSheetsWebhookUrl: string;
  updatedAt: string;
}

export interface DatabaseSnapshot {
  students: Student[];
  attendance: AttendanceRecord[];
  settings: CampusSettings;
}
