import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDistanceMeters,
  evaluateGeofence,
  evaluateDeviceLock,
  computeFaceMatchScore,
  determineAttendanceStatus,
  buildExcelRows,
} from './attendanceLogic';

test('Haversine distance returns 0 for identical coordinates and accurate campus distance', () => {
  assert.equal(calculateDistanceMeters(41.311081, 69.240562, 41.311081, 69.240562), 0);
  const dist = calculateDistanceMeters(41.311081, 69.240562, 41.312081, 69.240562);
  assert.ok(dist >= 105 && dist <= 115, `Expected ~111m, got ${dist}m`);
});

test('evaluateGeofence strictly checks allowed radius', () => {
  assert.deepEqual(evaluateGeofence(120, 150), { withinRadius: true, distanceMeters: 120 });
  assert.deepEqual(evaluateGeofence(151, 150), { withinRadius: false, distanceMeters: 151 });
});

test('evaluateDeviceLock blocks second student on bound phone and same student on foreign phone', () => {
  const firstLogin = evaluateDeviceLock('s1', null, 'dev-abc', null);
  assert.equal(firstLogin.allowed, true);
  assert.equal(firstLogin.shouldBind, true);

  const sameDeviceRepeat = evaluateDeviceLock('s1', 'dev-abc', 'dev-abc', {
    id: 's1',
    fullName: 'Azizbek',
  });
  assert.equal(sameDeviceRepeat.allowed, true);
  assert.equal(sameDeviceRepeat.shouldBind, false);

  const secondStudentSamePhone = evaluateDeviceLock('s2', null, 'dev-abc', {
    id: 's1',
    fullName: 'Azizbek Karimov',
  });
  assert.equal(secondStudentSamePhone.allowed, false);
  assert.equal(secondStudentSamePhone.reason, 'DEVICE_BOUND_TO_OTHER');
  assert.ok(secondStudentSamePhone.message?.includes('Bu telefon boshqa talabaga biriktirilgan'));

  const studentDifferentPhone = evaluateDeviceLock('s1', 'dev-abc', 'dev-xyz', null);
  assert.equal(studentDifferentPhone.allowed, false);
  assert.equal(studentDifferentPhone.reason, 'ACCOUNT_BOUND_TO_OTHER');
});

test('computeFaceMatchScore enforces threshold and calculates similarity percentage', () => {
  const match = computeFaceMatchScore(0.32);
  assert.equal(match.matched, true);
  assert.ok(match.similarityPercent >= 70);

  const mismatch = computeFaceMatchScore(0.82);
  assert.equal(mismatch.matched, false);
});

test('determineAttendanceStatus handles Bor, Kechikdi, and Hududdan tashqari', () => {
  assert.equal(determineAttendanceStatus(true, '08:25', '08:45'), 'Bor');
  assert.equal(determineAttendanceStatus(true, '09:05', '08:45'), 'Kechikdi');
  assert.equal(determineAttendanceStatus(false, '08:15', '08:45'), 'Hududdan tashqari');
});

test('buildExcelRows produces properly structured rows for SheetJS export', () => {
  const rows = buildExcelRows([
    {
      id: 'rec-1',
      studentId: 's1',
      studentName: 'Azizbek Karimov',
      groupName: 'AT-21',
      dateStr: '2026-11-16',
      timeStr: '08:24',
      status: 'Bor',
      distanceMeters: 42,
      faceScore: 88,
      deviceId: 'DEV-98A1',
      lat: 41.311,
      lng: 69.241,
      syncedToSheets: true,
      createdAt: '2026-11-16T08:24:00Z',
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['№'], 1);
  assert.equal(rows[0]['F.I.Sh.'], 'Azizbek Karimov');
  assert.equal(rows[0].Holati, 'Bor');
  assert.equal(rows[0]['Google Sheets'], 'Yuborilgan');
});
