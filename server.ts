import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import type { AttendanceRecord, CampusSettings, DatabaseSnapshot, Student } from './src/types/attendance.ts';
import { evaluateDeviceLock } from './src/utils/attendanceLogic.ts';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'attendance-db.json');

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function createInitialSeed(): DatabaseSnapshot {
  const now = new Date().toISOString();
  const today = getTodayStr();
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

function readDb(): DatabaseSnapshot {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const seed = createInitialSeed();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw) as DatabaseSnapshot;
  } catch {
    const seed = createInitialSeed();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
}

function writeDb(db: DatabaseSnapshot): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/bootstrap', (_req, res) => {
    const db = readDb();
    res.json(db);
  });

  app.post('/api/students/login', (req, res) => {
    const { login, password, deviceId } = req.body as {
      login?: string;
      password?: string;
      deviceId?: string;
    };

    if (!login || !password || !deviceId) {
      res.status(400).json({ error: 'Login, parol va qurilma identifikatori majburiy.' });
      return;
    }

    const db = readDb();
    const normalizedLogin = login.trim().toLowerCase();
    const student = db.students.find((s) => s.login.toLowerCase() === normalizedLogin);

    if (!student || student.password !== password) {
      res.status(401).json({ error: 'Login yoki parol noto‘g‘ri!' });
      return;
    }

    const otherBound = db.students.find((s) => s.deviceId === deviceId && s.id !== student.id) || null;
    const lockResult = evaluateDeviceLock(student.id, student.deviceId, deviceId, otherBound);

    if (!lockResult.allowed) {
      res.status(403).json({
        error: lockResult.message,
        reason: lockResult.reason,
      });
      return;
    }

    if (lockResult.shouldBind) {
      student.deviceId = deviceId;
      student.updatedAt = new Date().toISOString();
      writeDb(db);
    }

    res.json({
      student,
      boundNow: lockResult.shouldBind,
    });
  });

  app.post('/api/students', (req, res) => {
    const body = req.body as Partial<Student>;
    if (!body.fullName || !body.groupName || !body.login || !body.password) {
      res.status(400).json({ error: 'Ism-familiya, guruh, login va parol to‘ldirilishi shart.' });
      return;
    }
    const db = readDb();
    const exists = db.students.some(
      (s) => s.login.toLowerCase() === body.login!.trim().toLowerCase()
    );
    if (exists) {
      res.status(409).json({ error: 'Bunday login allaqachon mavjud.' });
      return;
    }

    const now = new Date().toISOString();
    const newStudent: Student = {
      id: `stu-${Date.now().toString(36)}`,
      fullName: body.fullName.trim(),
      groupName: body.groupName.trim(),
      login: body.login.trim().toLowerCase(),
      password: body.password,
      photoUrl: body.photoUrl || '/src/assets/images/student_azizbek_1794818865017.jpg',
      deviceId: null,
      createdAt: now,
      updatedAt: now,
    };
    db.students.unshift(newStudent);
    writeDb(db);
    res.status(201).json(newStudent);
  });

  app.patch('/api/students/:id/unlock', (req, res) => {
    const db = readDb();
    const student = db.students.find((s) => s.id === req.params.id);
    if (!student) {
      res.status(404).json({ error: 'Talaba topilmadi.' });
      return;
    }
    student.deviceId = null;
    student.updatedAt = new Date().toISOString();
    writeDb(db);
    res.json(student);
  });

  app.delete('/api/students/:id', (req, res) => {
    const db = readDb();
    const before = db.students.length;
    db.students = db.students.filter((s) => s.id !== req.params.id);
    if (db.students.length === before) {
      res.status(404).json({ error: 'Talaba topilmadi.' });
      return;
    }
    writeDb(db);
    res.json({ ok: true });
  });

  app.post('/api/attendance', async (req, res) => {
    const body = req.body as Partial<AttendanceRecord>;
    if (!body.studentId || !body.studentName || !body.status || !body.deviceId) {
      res.status(400).json({ error: 'Davomat ma’lumotlari to‘liq emas.' });
      return;
    }

    const db = readDb();
    const now = new Date().toISOString();
    let syncedToSheets = false;

    if (db.settings.googleSheetsWebhookUrl) {
      try {
        const resp = await fetch(db.settings.googleSheetsWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dateStr: body.dateStr,
            timeStr: body.timeStr,
            studentName: body.studentName,
            groupName: body.groupName,
            status: body.status,
            distanceMeters: body.distanceMeters ?? 0,
            faceScore: body.faceScore ?? 0,
            deviceId: body.deviceId,
          }),
        });
        if (resp.ok) {
          syncedToSheets = true;
        }
      } catch {
        syncedToSheets = false;
      }
    }

    const record: AttendanceRecord = {
      id: `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      studentId: body.studentId,
      studentName: body.studentName,
      groupName: body.groupName || '',
      dateStr: body.dateStr || getTodayStr(),
      timeStr: body.timeStr || new Date().toTimeString().slice(0, 5),
      status: body.status,
      distanceMeters: body.distanceMeters ?? 0,
      faceScore: body.faceScore ?? 0,
      deviceId: body.deviceId,
      lat: body.lat ?? db.settings.lat,
      lng: body.lng ?? db.settings.lng,
      syncedToSheets,
      createdAt: now,
    };

    db.attendance.unshift(record);
    writeDb(db);
    res.status(201).json(record);
  });

  app.patch('/api/attendance/:id', (req, res) => {
    const db = readDb();
    const record = db.attendance.find((r) => r.id === req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Davomat yozuvi topilmadi.' });
      return;
    }
    if (req.body.status) {
      record.status = req.body.status;
    }
    writeDb(db);
    res.json(record);
  });

  app.put('/api/settings', (req, res) => {
    const body = req.body as Partial<CampusSettings>;
    const db = readDb();
    db.settings = {
      ...db.settings,
      campusName: body.campusName ?? db.settings.campusName,
      lat: typeof body.lat === 'number' ? body.lat : db.settings.lat,
      lng: typeof body.lng === 'number' ? body.lng : db.settings.lng,
      allowedRadiusMeters:
        typeof body.allowedRadiusMeters === 'number'
          ? body.allowedRadiusMeters
          : db.settings.allowedRadiusMeters,
      lateAfterTime: body.lateAfterTime ?? db.settings.lateAfterTime,
      googleSheetsWebhookUrl:
        typeof body.googleSheetsWebhookUrl === 'string'
          ? body.googleSheetsWebhookUrl.trim()
          : db.settings.googleSheetsWebhookUrl,
      updatedAt: new Date().toISOString(),
    };
    writeDb(db);
    res.json(db.settings);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

startServer();
