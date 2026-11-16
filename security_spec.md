# Security Specification & Red Team Audit

## 1. Data Invariants
1. **Default-Deny Catch-All**: All unspecified Firestore paths deny read and write by default.
2. **Strict Admin Gate**: All student PII (`login`, `passwordHash`, `deviceId`, `photoUrl`), attendance logs, and campus geofence settings can only be read or written by verified teachers/administrators (`email_verified == true` and either bootstrapped owner email `diliable004@gmail.com` or an existing `/admins/{uid}` document).
3. **Path ID Hardening**: Every document ID (`studentId`, `recordId`, `settingId`, `adminUid`) must match `^[a-zA-Z0-9_-]+$` and be <= 128 characters.
4. **Immutable Audit Fields & Server Timestamps**: `createdAt` must equal `request.time` on creation and remain immutable on updates; `updatedAt` must equal `request.time` on writes.
5. **Relational Integrity**: Attendance records must reference a valid existing `studentId` document in `/students/{studentId}`.
6. **Strict Schema Enforcement**: Every `create` and `update` call invokes `isValidStudent`, `isValidAttendanceRecord`, `isValidCampusSettings`, or `isValidAdminUser` with strict `keys().hasAll(...)` / `keys().hasOnly(...)` and `.size()` checks.

## 2. Dirty Dozen Attack Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read on `/students/s1` -> DENIED.
2. Unauthenticated list query on `/attendance` -> DENIED.
3. Unverified email user (`email_verified: false`) pretending to be `diliable004@gmail.com` -> DENIED.
4. Non-admin authenticated user creating `/admins/{uid}` to escalate privileges -> DENIED.
5. Admin creating a student with a shadow field `{ ..., isVerified: true }` -> DENIED (`hasOnly` check).
6. Admin creating a student with a 2KB document ID `studentId` -> DENIED (`isValidId` check).
7. Admin creating a student with `createdAt` spoofed to a past timestamp -> DENIED (`createdAt == request.time`).
8. Admin updating a student while mutating `createdAt` -> DENIED (`incoming().createdAt == existing().createdAt`).
9. Admin creating an attendance record for a non-existent `studentId: "ghost_id"` -> DENIED (`exists(/databases/.../students/...)`).
10. Admin creating an attendance record with invalid status `"Bypass"` -> DENIED (enum check).
11. Admin creating campus settings with negative `allowedRadiusMeters: -50` -> DENIED (range check).
12. Admin updating campus settings with `affectedKeys().hasOnly(...)` bypassed via extra field -> DENIED.
