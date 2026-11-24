import crypto from 'node:crypto';
import express from 'express';
import {
  hashPassword,
  requireAdminAuth,
  requireAdminOrEngineAuth,
  signAdminToken,
  verifyPassword,
  type AuthenticatedRequest,
} from './auth.ts';
import {
  db,
  euclideanDistance,
  type AttendanceStatus,
  type MemberRole,
} from './db.ts';

const ALLOWED_ROLES: MemberRole[] = ['Student', 'Faculty', 'Staff', 'Intern'];
const ALLOWED_STATUSES: AttendanceStatus[] = ['Present', 'Late', 'Absent'];

function isValidAvatarUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.startsWith('/src/assets/images/') && !value.includes('..')) {
    return /^\/src\/assets\/images\/[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$/.test(value);
  }
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) {
    return value.length <= 2_500_000;
  }
  return false;
}

function isValidEncoding(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 128 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

function escapeCsvCell(raw: string | number | null | undefined): string {
  let str = raw === null || raw === undefined ? '' : String(raw);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function enumerateDates(dateFrom: string, dateTo: string): string[] {
  const start = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }
  const dates: string[] = [];
  const cur = new Date(start);
  let guard = 0;
  while (cur <= end && guard < 366) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
    guard++;
  }
  return dates;
}

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function offsetDateString(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function createApiRouter(): express.Router {
  const router = express.Router();

  // ---- Health ----
  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      databaseMode: db.getMode(),
      timestamp: new Date().toISOString(),
    });
  });

  // ---- Authentication ----
  router.get('/auth/status', async (_req, res) => {
    const envPasscodeSet = Boolean(process.env.ADMIN_PASSCODE?.trim());
    const adminCount = await db.countAdmins();
    res.json({
      needsSetup: !envPasscodeSet && adminCount === 0,
      hasEnvOverride: envPasscodeSet,
      databaseMode: db.getMode(),
    });
  });

  router.post('/auth/setup', async (req, res) => {
    try {
      const envPasscodeSet = Boolean(process.env.ADMIN_PASSCODE?.trim());
      if (envPasscodeSet) {
        res.status(403).json({
          error: 'Initial setup is disabled because ADMIN_PASSCODE is configured on the server.',
        });
        return;
      }
      const existingCount = await db.countAdmins();
      if (existingCount > 0) {
        res.status(409).json({
          error: 'An administrator account has already been claimed. Please sign in.',
        });
        return;
      }

      const {name, email, password} = req.body ?? {};
      if (
        typeof name !== 'string' ||
        name.trim().length < 2 ||
        typeof email !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        typeof password !== 'string' ||
        password.length < 8
      ) {
        res.status(400).json({
          error: 'Provide a valid name, email address, and password (minimum 8 characters).',
        });
        return;
      }

      const passwordHash = await hashPassword(password);
      const admin = await db.createAdmin(name, email, passwordHash);
      const token = signAdminToken({
        admin_id: admin.admin_id,
        name: admin.name,
        email: admin.email,
      });

      res.status(201).json({
        token,
        admin: {
          admin_id: admin.admin_id,
          name: admin.name,
          email: admin.email,
        },
      });
    } catch (err) {
      console.error('[Auth] Setup error:', err);
      res.status(500).json({error: 'Failed to initialize administrator account'});
    }
  });

  router.post('/auth/login', async (req, res) => {
    try {
      const {email, password} = req.body ?? {};
      if (typeof email !== 'string' || typeof password !== 'string' || !password) {
        res.status(400).json({error: 'Email and password are required'});
        return;
      }

      const envPasscode = process.env.ADMIN_PASSCODE?.trim();
      const envEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

      if (envPasscode) {
        const emailMatches = !envEmail || email.trim().toLowerCase() === envEmail;
        const passBuf = Buffer.from(password, 'utf8');
        const expectedBuf = Buffer.from(envPasscode, 'utf8');
        const passMatches =
          passBuf.length === expectedBuf.length &&
          crypto.timingSafeEqual(passBuf, expectedBuf);

        if (emailMatches && passMatches) {
          const token = signAdminToken({
            admin_id: 0,
            name: 'System Administrator',
            email: envEmail || email.trim().toLowerCase(),
          });
          res.json({
            token,
            admin: {
              admin_id: 0,
              name: 'System Administrator',
              email: envEmail || email.trim().toLowerCase(),
            },
          });
          return;
        }
      }

      const admin = await db.findAdminByEmail(email);
      if (!admin) {
        res.status(401).json({error: 'Invalid email or password'});
        return;
      }

      const valid = await verifyPassword(password, admin.password_hash);
      if (!valid) {
        res.status(401).json({error: 'Invalid email or password'});
        return;
      }

      const token = signAdminToken({
        admin_id: admin.admin_id,
        name: admin.name,
        email: admin.email,
      });
      res.json({
        token,
        admin: {
          admin_id: admin.admin_id,
          name: admin.name,
          email: admin.email,
        },
      });
    } catch (err) {
      console.error('[Auth] Login error:', err);
      res.status(500).json({error: 'Authentication failed'});
    }
  });

  router.get('/auth/me', requireAdminAuth, (req: AuthenticatedRequest, res) => {
    res.json({admin: req.admin});
  });

  // ---- Departments ----
  router.get('/departments', requireAdminAuth, async (_req, res) => {
    try {
      const departments = await db.listDepartments();
      res.json({departments});
    } catch (err) {
      console.error('[Departments] List error:', err);
      res.status(500).json({error: 'Failed to load departments'});
    }
  });

  router.post('/departments', requireAdminAuth, async (req, res) => {
    try {
      const {department_name} = req.body ?? {};
      if (typeof department_name !== 'string' || department_name.trim().length < 2) {
        res.status(400).json({error: 'Department name must be at least 2 characters'});
        return;
      }
      const department = await db.createDepartment(department_name);
      res.status(201).json({department});
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create department';
      res.status(400).json({error: msg});
    }
  });

  // ---- Users & Encodings ----
  router.get('/users', requireAdminAuth, async (_req, res) => {
    try {
      const users = await db.listUsers(false);
      res.json({users});
    } catch (err) {
      console.error('[Users] List error:', err);
      res.status(500).json({error: 'Failed to fetch registered users'});
    }
  });

  router.get('/engine/encodings', requireAdminOrEngineAuth, async (_req, res) => {
    try {
      const users = await db.listUsers(true);
      res.json({users});
    } catch (err) {
      console.error('[Engine] Encodings error:', err);
      res.status(500).json({error: 'Failed to load face encodings'});
    }
  });

  router.post('/users', requireAdminAuth, async (req, res) => {
    try {
      const {name, roll_no, department_id, role, face_encoding, avatar_url} = req.body ?? {};

      if (typeof name !== 'string' || name.trim().length < 2) {
        res.status(400).json({error: 'Full name is required'});
        return;
      }
      if (typeof roll_no !== 'string' || roll_no.trim().length < 2) {
        res.status(400).json({error: 'Roll No / Employee ID is required'});
        return;
      }
      const deptId = Number(department_id);
      if (!Number.isInteger(deptId) || deptId <= 0) {
        res.status(400).json({error: 'Valid department is required'});
        return;
      }
      if (!ALLOWED_ROLES.includes(role)) {
        res.status(400).json({error: 'Role must be Student, Faculty, Staff, or Intern'});
        return;
      }
      if (!isValidEncoding(face_encoding)) {
        res.status(400).json({error: 'Valid 128-dimensional face encoding is required'});
        return;
      }
      const cleanAvatar =
        avatar_url === null || avatar_url === undefined || avatar_url === ''
          ? null
          : isValidAvatarUrl(avatar_url)
            ? avatar_url
            : null;

      const user = await db.createUser({
        name,
        roll_no,
        department_id: deptId,
        role,
        face_encoding,
        avatar_url: cleanAvatar,
      });

      res.status(201).json({
        user: {
          ...user,
          face_encoding: undefined,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to register user';
      res.status(400).json({error: msg});
    }
  });

  router.post('/engine/users', requireAdminOrEngineAuth, async (req, res) => {
    try {
      const {name, roll_no, department_id, role, face_encoding} = req.body ?? {};
      if (
        typeof name !== 'string' ||
        typeof roll_no !== 'string' ||
        !ALLOWED_ROLES.includes(role) ||
        !isValidEncoding(face_encoding)
      ) {
        res.status(400).json({error: 'Invalid user payload from recognition engine'});
        return;
      }
      const user = await db.createUser({
        name,
        roll_no,
        department_id: Number(department_id) || 1,
        role,
        face_encoding,
        avatar_url: null,
      });
      res.status(201).json({user_id: user.user_id, name: user.name, roll_no: user.roll_no});
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to register user';
      res.status(400).json({error: msg});
    }
  });

  router.patch('/users/:id/encoding', requireAdminAuth, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        res.status(400).json({error: 'Invalid user ID'});
        return;
      }
      const {face_encoding} = req.body ?? {};
      if (!isValidEncoding(face_encoding)) {
        res.status(400).json({error: 'Valid 128-dimensional encoding required'});
        return;
      }
      const updated = await db.updateUserEncoding(userId, face_encoding);
      if (!updated) {
        res.status(404).json({error: 'User not found'});
        return;
      }
      res.json({updated: true, user_id: userId});
    } catch (err) {
      console.error('[Users] Encoding sync error:', err);
      res.status(500).json({error: 'Failed to update face encoding'});
    }
  });

  router.delete('/users/:id', requireAdminAuth, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        res.status(400).json({error: 'Invalid user ID'});
        return;
      }
      const deleted = await db.deleteUser(userId);
      if (!deleted) {
        res.status(404).json({error: 'User not found'});
        return;
      }
      res.json({deleted: true, user_id: userId});
    } catch (err) {
      console.error('[Users] Delete error:', err);
      res.status(500).json({error: 'Failed to delete user'});
    }
  });

  // ---- Real-time Recognition & Attendance Logging ----
  router.post('/attendance/recognize', requireAdminOrEngineAuth, async (req, res) => {
    try {
      const {encoding, threshold} = req.body ?? {};
      if (!isValidEncoding(encoding)) {
        res.status(400).json({error: 'Valid 128-d face encoding array is required'});
        return;
      }

      const settings = await db.getSettings();
      const activeThreshold =
        typeof threshold === 'number' && threshold >= 0.25 && threshold <= 0.9
          ? threshold
          : settings.match_threshold;

      const users = await db.listUsers(true);
      if (users.length === 0) {
        res.json({
          status: 'unknown',
          matched: false,
          distance: null,
          threshold: activeThreshold,
          confidence: 0,
        });
        return;
      }

      let bestUser = users[0];
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const candidate of users) {
        if (!isValidEncoding(candidate.face_encoding)) continue;
        const dist = euclideanDistance(encoding, candidate.face_encoding);
        if (dist < bestDistance) {
          bestDistance = dist;
          bestUser = candidate;
        }
      }

      if (!Number.isFinite(bestDistance) || bestDistance > activeThreshold) {
        res.json({
          status: 'unknown',
          matched: false,
          distance: Number.isFinite(bestDistance) ? Number(bestDistance.toFixed(4)) : null,
          threshold: activeThreshold,
          confidence: 0,
        });
        return;
      }

      const confidence = Number(
        Math.max(0.05, Math.min(0.995, 1 - bestDistance * 0.65)).toFixed(4),
      );
      const {outcome, record} = await db.logAttendance(bestUser.user_id, confidence);

      res.json({
        status: outcome,
        matched: true,
        distance: Number(bestDistance.toFixed(4)),
        threshold: activeThreshold,
        confidence,
        user: {
          user_id: bestUser.user_id,
          name: bestUser.name,
          roll_no: bestUser.roll_no,
          department_name: bestUser.department_name,
          role: bestUser.role,
          avatar_url: bestUser.avatar_url,
        },
        record,
      });
    } catch (err) {
      console.error('[Recognize] Error:', err);
      res.status(500).json({error: 'Recognition processing failed'});
    }
  });

  // ---- Attendance Logs & CSV Export ----
  router.get('/attendance', requireAdminAuth, async (req, res) => {
    try {
      const dateFrom =
        typeof req.query.dateFrom === 'string' && req.query.dateFrom
          ? req.query.dateFrom
          : undefined;
      const dateTo =
        typeof req.query.dateTo === 'string' && req.query.dateTo
          ? req.query.dateTo
          : undefined;
      const departmentId = req.query.departmentId
        ? Number(req.query.departmentId)
        : undefined;
      const userId = req.query.userId ? Number(req.query.userId) : undefined;
      const status =
        typeof req.query.status === 'string' &&
        ALLOWED_STATUSES.includes(req.query.status as AttendanceStatus)
          ? (req.query.status as AttendanceStatus)
          : undefined;
      const search =
        typeof req.query.search === 'string' ? req.query.search : undefined;

      const records = await db.listAttendance({
        dateFrom,
        dateTo,
        departmentId,
        userId,
        status,
        search,
      });
      res.json({records});
    } catch (err) {
      console.error('[Attendance] List error:', err);
      res.status(500).json({error: 'Failed to load attendance logs'});
    }
  });

  router.get('/attendance/export', requireAdminAuth, async (req, res) => {
    try {
      const dateFrom =
        typeof req.query.dateFrom === 'string' && req.query.dateFrom
          ? req.query.dateFrom
          : undefined;
      const dateTo =
        typeof req.query.dateTo === 'string' && req.query.dateTo
          ? req.query.dateTo
          : undefined;
      const departmentId = req.query.departmentId
        ? Number(req.query.departmentId)
        : undefined;
      const userId = req.query.userId ? Number(req.query.userId) : undefined;
      const status =
        typeof req.query.status === 'string' &&
        ALLOWED_STATUSES.includes(req.query.status as AttendanceStatus)
          ? (req.query.status as AttendanceStatus)
          : undefined;
      const search =
        typeof req.query.search === 'string' ? req.query.search : undefined;

      const records = await db.listAttendance({
        dateFrom,
        dateTo,
        departmentId,
        userId,
        status,
        search,
      });

      const header = [
        'Attendance ID',
        'Name',
        'Roll No / ID',
        'Department',
        'Role',
        'Date',
        'Time In',
        'Status',
        'Confidence (%)',
      ];
      const lines = [header.map(escapeCsvCell).join(',')];

      for (const r of records) {
        lines.push(
          [
            r.attendance_id,
            r.name || '',
            r.roll_no || '',
            r.department_name || '',
            r.role || '',
            r.date,
            r.time_in,
            r.status,
            (r.confidence_score * 100).toFixed(1),
          ]
            .map(escapeCsvCell)
            .join(','),
        );
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="veriface-attendance-${todayDateString()}.csv"`,
      );
      res.send(lines.join('\r\n'));
    } catch (err) {
      console.error('[Attendance] Export error:', err);
      res.status(500).json({error: 'Failed to export CSV report'});
    }
  });

  // ---- Reports & Analytics ----
  router.get('/reports/summary', requireAdminAuth, async (req, res) => {
    try {
      const today = todayDateString();
      const dateTo =
        typeof req.query.dateTo === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.dateTo)
          ? req.query.dateTo
          : today;
      const dateFrom =
        typeof req.query.dateFrom === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(req.query.dateFrom)
          ? req.query.dateFrom
          : offsetDateString(-6);

      const [users, departments, rangeLogs, todayLogs] = await Promise.all([
        db.listUsers(false),
        db.listDepartments(),
        db.listAttendance({dateFrom, dateTo}),
        db.listAttendance({dateFrom: today, dateTo: today}),
      ]);

      const totalMembers = users.length;
      const todayUniqueUsers = new Map<number, AttendanceStatus>();
      for (const log of todayLogs) {
        if (!todayUniqueUsers.has(log.user_id)) {
          todayUniqueUsers.set(log.user_id, log.status);
        }
      }
      let presentToday = 0;
      let lateToday = 0;
      for (const st of todayUniqueUsers.values()) {
        if (st === 'Late') lateToday++;
        else if (st === 'Present') presentToday++;
      }
      const checkedInToday = presentToday + lateToday;
      const absentToday = Math.max(0, totalMembers - checkedInToday);

      const dates = enumerateDates(dateFrom, dateTo);
      const totalDays = Math.max(1, dates.length);

      // Daily series
      const dailyBreakdown = dates.map((d) => {
        const dayLogs = rangeLogs.filter((l) => l.date === d);
        const seen = new Map<number, AttendanceStatus>();
        for (const l of dayLogs) {
          if (!seen.has(l.user_id)) seen.set(l.user_id, l.status);
        }
        let present = 0;
        let late = 0;
        for (const st of seen.values()) {
          if (st === 'Late') late++;
          else if (st === 'Present') present++;
        }
        const attended = present + late;
        return {
          date: d,
          present,
          late,
          absent: Math.max(0, totalMembers - attended),
          rate_pct: totalMembers > 0 ? Number(((attended / totalMembers) * 100).toFixed(1)) : 0,
        };
      });

      // Per-person attendance percentage over date range
      const memberSummary = users.map((u) => {
        const personLogs = rangeLogs.filter((l) => l.user_id === u.user_id);
        const uniqueDates = new Map<string, AttendanceStatus>();
        let confSum = 0;
        for (const l of personLogs) {
          if (!uniqueDates.has(l.date)) {
            uniqueDates.set(l.date, l.status);
          }
          confSum += l.confidence_score;
        }
        const daysAttended = uniqueDates.size;
        let daysLate = 0;
        for (const st of uniqueDates.values()) {
          if (st === 'Late') daysLate++;
        }
        return {
          user_id: u.user_id,
          name: u.name,
          roll_no: u.roll_no,
          department_name: u.department_name || '',
          role: u.role,
          avatar_url: u.avatar_url,
          days_present: daysAttended - daysLate,
          days_late: daysLate,
          days_attended: daysAttended,
          total_days: totalDays,
          attendance_pct: Number(((daysAttended / totalDays) * 100).toFixed(1)),
          avg_confidence:
            personLogs.length > 0
              ? Number(((confSum / personLogs.length) * 100).toFixed(1))
              : 0,
        };
      });

      // Department summary
      const departmentSummary = departments.map((dept) => {
        const deptUsers = users.filter((u) => u.department_id === dept.department_id);
        const deptUserIds = new Set(deptUsers.map((u) => u.user_id));
        const deptCheckedInToday = Array.from(todayUniqueUsers.keys()).filter((id) =>
          deptUserIds.has(id),
        ).length;
        const deptMemberCount = deptUsers.length;

        let deptPossibleSlots = deptMemberCount * totalDays;
        let deptAttendedSlots = 0;
        for (const m of memberSummary) {
          if (deptUserIds.has(m.user_id)) {
            deptAttendedSlots += m.days_attended;
          }
        }

        return {
          department_id: dept.department_id,
          department_name: dept.department_name,
          member_count: deptMemberCount,
          present_today: deptCheckedInToday,
          absent_today: Math.max(0, deptMemberCount - deptCheckedInToday),
          range_rate_pct:
            deptPossibleSlots > 0
              ? Number(((deptAttendedSlots / deptPossibleSlots) * 100).toFixed(1))
              : 0,
        };
      });

      res.json({
        dateFrom,
        dateTo,
        today: {
          date: today,
          total_members: totalMembers,
          present: presentToday,
          late: lateToday,
          checked_in: checkedInToday,
          absent: absentToday,
          attendance_pct:
            totalMembers > 0 ? Number(((checkedInToday / totalMembers) * 100).toFixed(1)) : 0,
        },
        dailyBreakdown,
        memberSummary,
        departmentSummary,
      });
    } catch (err) {
      console.error('[Reports] Summary error:', err);
      res.status(500).json({error: 'Failed to generate attendance reports'});
    }
  });

  // ---- Recognition & Duplicate Guard Settings ----
  router.get('/settings', requireAdminAuth, async (_req, res) => {
    const settings = await db.getSettings();
    res.json({settings});
  });

  router.put('/settings', requireAdminAuth, async (req, res) => {
    try {
      const settings = await db.updateSettings(req.body ?? {});
      res.json({settings});
    } catch (err) {
      console.error('[Settings] Update error:', err);
      res.status(500).json({error: 'Failed to update recognition settings'});
    }
  });

  return router;
}
