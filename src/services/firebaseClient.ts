import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDocFromServer,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { AttendanceRecord, CampusSettings, Student } from '../types/attendance';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
    return false;
  }
}

void testFirestoreConnection();

export function subscribeAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export async function signInTeacherWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutTeacher(): Promise<void> {
  await signOut(auth);
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function syncSnapshotToFirestore(
  students: Student[],
  attendance: AttendanceRecord[],
  settings: CampusSettings
): Promise<{ syncedCount: number }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Firebase bilan sinxronlash uchun avval Google orqali kiring.');
  }

  let syncedCount = 0;

  try {
    const settingsPath = 'settings/campus';
    await setDoc(
      doc(db, 'settings', 'campus'),
      {
        campusName: settings.campusName.slice(0, 120),
        lat: settings.lat,
        lng: settings.lng,
        allowedRadiusMeters: settings.allowedRadiusMeters,
        lateAfterTime: settings.lateAfterTime,
        googleSheetsWebhookUrl: (settings.googleSheetsWebhookUrl || '').slice(0, 500),
        ownerUid: user.uid,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    syncedCount += 1;
    void settingsPath;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/campus');
  }

  for (const s of students) {
    const safeId = s.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
    const path = `students/${safeId}`;
    try {
      const passwordHash = await sha256Hex(s.password || '12345');
      await setDoc(doc(db, 'students', safeId), {
        fullName: s.fullName.slice(0, 120),
        groupName: s.groupName.slice(0, 40),
        login: s.login.slice(0, 40),
        passwordHash,
        photoUrl: s.photoUrl.startsWith('data:') && s.photoUrl.length > 450000 ? '' : s.photoUrl,
        deviceId: s.deviceId || '',
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      syncedCount += 1;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  for (const r of attendance.slice(0, 50)) {
    const safeRecId = r.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
    const safeStudentId = r.studentId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
    const path = `attendance/${safeRecId}`;
    try {
      await setDoc(doc(db, 'attendance', safeRecId), {
        studentId: safeStudentId,
        studentName: r.studentName.slice(0, 120),
        groupName: r.groupName.slice(0, 40),
        dateStr: r.dateStr.slice(0, 10),
        timeStr: r.timeStr.slice(0, 8),
        status: r.status,
        distanceMeters: r.distanceMeters,
        faceScore: r.faceScore,
        deviceId: r.deviceId.slice(0, 128),
        lat: r.lat,
        lng: r.lng,
        syncedToSheets: Boolean(r.syncedToSheets),
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
      });
      syncedCount += 1;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  return { syncedCount };
}

export async function fetchFirestoreCounts(): Promise<{
  studentsCount: number;
  attendanceCount: number;
}> {
  if (!auth.currentUser) {
    return { studentsCount: 0, attendanceCount: 0 };
  }
  try {
    const stuSnap = await getDocs(collection(db, 'students'));
    const attSnap = await getDocs(collection(db, 'attendance'));
    return {
      studentsCount: stuSnap.size,
      attendanceCount: attSnap.size,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'students');
  }
}

export async function deleteFirestoreStudent(studentId: string): Promise<void> {
  if (!auth.currentUser) return;
  const safeId = studentId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  try {
    await deleteDoc(doc(db, 'students', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `students/${safeId}`);
  }
}

export { firebaseConfig };
