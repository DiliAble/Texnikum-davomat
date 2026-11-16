import type { AttendanceRecord, CampusSettings, DatabaseSnapshot, Student } from '../types/attendance';
import { evaluateDeviceLock } from '../utils/attendanceLogic';

const DEVICE_STORAGE_KEY = 'texnikum_davomat_device_id';
const LOCAL_DB_KEY = 'texnikum_davomat_local_snapshot_v1';

export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_STORAGE_KEY);
  if (!id) {
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    id = `DEV-${rand}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    localStorage.setItem(DEVICE_STORAGE_KEY, id);
  }
  return id;
}

function getDefaultSnapshot(): DatabaseSnapshot {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  return {
    students: [
      {
        id: 'stu-azizbek',
        fullName: 'Azizbek Karimov',
        groupName: 'AT-21',
        login: 'azizbek',
        password: '12345',
        photoUrl: '/src/assets/images/student_azizbek_1794818865017.jpg',
        deviceId: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'stu-madina',
        fullName: 'Madina Rasulova',
        groupName: 'AT-21',
        login: 'madina',
        password: '12345',
        photoUrl: '/src/assets/images/student_madina_1794818865893.jpg',
        deviceId: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'stu-jasur',
        fullName: 'Jasur Toshmatov',
        groupName: 'KI-22',
        login: 'jasur',
        password: '12345',
        photoUrl: '/src/assets/images/student_jasur_1794818866872.jpg',
        deviceId: 'DEV-JASUR-7741',
        createdAt: now,
        updatedAt: now,
      },
    ],
    attendance: [
      {
        id: 'att-seed-1',
        studentId: 'stu-jasur',
        studentName: 'Jasur Toshmatov',
        groupName: 'KI-22',
        dateStr: today,
        timeStr: '08:22',
        status: 'Bor',
        distanceMeters: 38,
        faceScore: 91,
        deviceId: 'DEV-JASUR-7741',
        lat: 41.3112,
        lng: 69.2407,
        syncedToSheets: false,
        createdAt: now,
      },
    ],
    settings: {
      campusName: 'Toshkent Axborot Texnologiyalari Texnikumi',
      lat: 41.311081,
      lng: 69.240562,
      allowedRadiusMeters: 250,
      lateAfterTime: '08:45',
      googleSheetsWebhookUrl: '',
      updatedAt: now,
    },
  };
}

function readLocalSnapshot(): DatabaseSnapshot {
  try {
    const raw = localStorage.getItem(LOCAL_DB_KEY);
    if (raw) {
      return JSON.parse(raw) as DatabaseSnapshot;
    }
  } catch {
    // ignore storage errors
  }
  const def = getDefaultSnapshot();
  localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(def));
  return def;
}

function writeLocalSnapshot(snapshot: DatabaseSnapshot): void {
  try {
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore storage quota errors
  }
}

export async function fetchBootstrap(): Promise<DatabaseSnapshot> {
  try {
    const res = await fetch('/api/bootstrap');
    if (res.ok) {
      const data = (await res.json()) as DatabaseSnapshot;
      writeLocalSnapshot(data);
      return data;
    }
  } catch {
    // Static hosting fallback (e.g. Netlify)
  }
  return readLocalSnapshot();
}

export async function loginStudentWithDeviceLock(
  login: string,
  password: string,
  deviceId: string
): Promise<{ student: Student; boundNow: boolean }> {
  try {
    const res = await fetch('/api/students/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password, deviceId }),
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Kirishda xatolik yuz berdi.');
    }
    return payload as { student: Student; boundNow: boolean };
  } catch (err) {
    if (err instanceof TypeError) {
      const db = readLocalSnapshot();
      const stu = db.students.find((s) => s.login.toLowerCase() === login.trim().toLowerCase());
      if (!stu || stu.password !== password) {
        throw new Error('Login yoki parol noto‘g‘ri!');
      }
      const otherBound = db.students.find((s) => s.deviceId === deviceId && s.id !== stu.id) || null;
      const lock = evaluateDeviceLock(stu.id, stu.deviceId, deviceId, otherBound);
      if (!lock.allowed) {
        throw new Error(lock.message);
      }
      if (lock.shouldBind) {
        stu.deviceId = deviceId;
        stu.updatedAt = new Date().toISOString();
        writeLocalSnapshot(db);
      }
      return { student: stu, boundNow: lock.shouldBind };
    }
    throw err;
  }
}

export async function submitAttendanceRecord(
  record: Omit<AttendanceRecord, 'id' | 'createdAt' | 'syncedToSheets'>,
  webhookUrl?: string
): Promise<AttendanceRecord> {
  try {
    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (res.ok) {
      return (await res.json()) as AttendanceRecord;
    }
  } catch {
    // Static Netlify fallback below
  }

  let synced = false;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      synced = true;
    } catch {
      synced = false;
    }
  }

  const db = readLocalSnapshot();
  const created: AttendanceRecord = {
    ...record,
    id: `att-${Date.now().toString(36)}`,
    syncedToSheets: synced,
    createdAt: new Date().toISOString(),
  };
  db.attendance.unshift(created);
  writeLocalSnapshot(db);
  return created;
}

export async function createStudent(input: {
  fullName: string;
  groupName: string;
  login: string;
  password: string;
  photoUrl: string;
}): Promise<Student> {
  try {
    const res = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Talaba qo‘shishda xatolik.');
    }
    return data as Student;
  } catch (err) {
    if (err instanceof TypeError) {
      const db = readLocalSnapshot();
      const now = new Date().toISOString();
      const created: Student = {
        id: `stu-${Date.now().toString(36)}`,
        ...input,
        login: input.login.trim().toLowerCase(),
        deviceId: null,
        createdAt: now,
        updatedAt: now,
      };
      db.students.unshift(created);
      writeLocalSnapshot(db);
      return created;
    }
    throw err;
  }
}

export async function unlockStudentDevice(studentId: string): Promise<Student> {
  try {
    const res = await fetch(`/api/students/${encodeURIComponent(studentId)}/unlock`, {
      method: 'PATCH',
    });
    if (res.ok) {
      return (await res.json()) as Student;
    }
  } catch {
    // Static fallback
  }
  const db = readLocalSnapshot();
  const stu = db.students.find((s) => s.id === studentId);
  if (!stu) throw new Error('Talaba topilmadi.');
  stu.deviceId = null;
  stu.updatedAt = new Date().toISOString();
  writeLocalSnapshot(db);
  return stu;
}

export async function removeStudent(studentId: string): Promise<void> {
  try {
    const res = await fetch(`/api/students/${encodeURIComponent(studentId)}`, {
      method: 'DELETE',
    });
    if (res.ok) return;
  } catch {
    // Static fallback
  }
  const db = readLocalSnapshot();
  db.students = db.students.filter((s) => s.id !== studentId);
  writeLocalSnapshot(db);
}

export async function saveCampusSettings(settings: CampusSettings): Promise<CampusSettings> {
  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      return (await res.json()) as CampusSettings;
    }
  } catch {
    // Static fallback
  }
  const db = readLocalSnapshot();
  db.settings = { ...settings, updatedAt: new Date().toISOString() };
  writeLocalSnapshot(db);
  return db.settings;
}
