import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

export type MemberRole = 'Student' | 'Faculty' | 'Staff' | 'Intern';
export type AttendanceStatus = 'Present' | 'Late' | 'Absent';
export type DuplicateMode = 'window' | 'same_day';

export interface AdminRecord {
  admin_id: number;
  name: string;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface DepartmentRecord {
  department_id: number;
  department_name: string;
}

export interface UserRecord {
  user_id: number;
  name: string;
  roll_no: string;
  department_id: number;
  department_name?: string;
  role: MemberRole;
  face_encoding: number[];
  avatar_url: string | null;
  registered_on: string;
}

export interface AttendanceRecord {
  attendance_id: number;
  user_id: number;
  name?: string;
  roll_no?: string;
  department_id?: number;
  department_name?: string;
  role?: MemberRole;
  avatar_url?: string | null;
  date: string; // YYYY-MM-DD
  time_in: string; // HH:MM:SS
  status: AttendanceStatus;
  confidence_score: number;
}

export interface SystemSettings {
  match_threshold: number;
  duplicate_mode: DuplicateMode;
  duplicate_window_minutes: number;
  late_after_time: string;
}

export interface AttendanceFilter {
  dateFrom?: string;
  dateTo?: string;
  departmentId?: number;
  userId?: number;
  status?: AttendanceStatus;
  search?: string;
}

interface LocalStoreData {
  nextAdminId: number;
  nextDepartmentId: number;
  nextUserId: number;
  nextAttendanceId: number;
  admins: AdminRecord[];
  departments: DepartmentRecord[];
  users: UserRecord[];
  attendance: AttendanceRecord[];
  settings: SystemSettings;
}

const DEFAULT_SETTINGS: SystemSettings = {
  match_threshold: 0.55,
  duplicate_mode: 'window',
  duplicate_window_minutes: 10,
  late_after_time: '09:15:00',
};

function getLocalDateString(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalTimeString(date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function makeSeedVector(seed: number): number[] {
  const vec: number[] = [];
  let sumSq = 0;
  for (let i = 0; i < 128; i++) {
    const val = Math.sin(seed * 17.3 + i * 0.47) * Math.cos(seed * 3.1 - i * 0.19);
    vec.push(val);
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq) || 1;
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

function createInitialLocalStore(): LocalStoreData {
  const departments: DepartmentRecord[] = [
    {department_id: 1, department_name: 'Computer Science'},
    {department_id: 2, department_name: 'Electrical Engineering'},
    {department_id: 3, department_name: 'Data Science'},
    {department_id: 4, department_name: 'Operations'},
    {department_id: 5, department_name: 'Faculty & Staff'},
  ];

  const today = getLocalDateString(0);
  const yesterday = getLocalDateString(-1);
  const twoDaysAgo = getLocalDateString(-2);
  const threeDaysAgo = getLocalDateString(-3);

  const users: UserRecord[] = [
    {
      user_id: 1,
      name: 'Arjun Mehta',
      roll_no: 'CS-2026-014',
      department_id: 1,
      role: 'Student',
      face_encoding: makeSeedVector(11),
      avatar_url: '/src/assets/images/member_arjun_mehta_1795535019325.jpg',
      registered_on: `${threeDaysAgo} 08:45:00`,
    },
    {
      user_id: 2,
      name: 'Elena Rostova',
      roll_no: 'DS-2026-008',
      department_id: 3,
      role: 'Faculty',
      face_encoding: makeSeedVector(29),
      avatar_url: '/src/assets/images/member_elena_rostova_1795535019562.jpg',
      registered_on: `${threeDaysAgo} 09:10:00`,
    },
    {
      user_id: 3,
      name: 'Marcus Vance',
      roll_no: 'OPS-2026-003',
      department_id: 4,
      role: 'Staff',
      face_encoding: makeSeedVector(47),
      avatar_url: '/src/assets/images/member_marcus_vance_1795535020452.jpg',
      registered_on: `${threeDaysAgo} 09:20:00`,
    },
    {
      user_id: 4,
      name: 'Mei Lin',
      roll_no: 'EE-2026-021',
      department_id: 2,
      role: 'Student',
      face_encoding: makeSeedVector(63),
      avatar_url: '/src/assets/images/member_mei_lin_1795535020882.jpg',
      registered_on: `${twoDaysAgo} 08:30:00`,
    },
  ];

  const attendance: AttendanceRecord[] = [
    {
      attendance_id: 1,
      user_id: 1,
      date: threeDaysAgo,
      time_in: '08:52:14',
      status: 'Present',
      confidence_score: 0.9412,
    },
    {
      attendance_id: 2,
      user_id: 2,
      date: threeDaysAgo,
      time_in: '09:04:38',
      status: 'Present',
      confidence_score: 0.9625,
    },
    {
      attendance_id: 3,
      user_id: 3,
      date: threeDaysAgo,
      time_in: '09:21:05',
      status: 'Late',
      confidence_score: 0.918,
    },
    {
      attendance_id: 4,
      user_id: 1,
      date: twoDaysAgo,
      time_in: '08:48:09',
      status: 'Present',
      confidence_score: 0.953,
    },
    {
      attendance_id: 5,
      user_id: 2,
      date: twoDaysAgo,
      time_in: '09:01:44',
      status: 'Present',
      confidence_score: 0.9588,
    },
    {
      attendance_id: 6,
      user_id: 4,
      date: twoDaysAgo,
      time_in: '08:57:31',
      status: 'Present',
      confidence_score: 0.9465,
    },
    {
      attendance_id: 7,
      user_id: 1,
      date: yesterday,
      time_in: '09:18:40',
      status: 'Late',
      confidence_score: 0.9274,
    },
    {
      attendance_id: 8,
      user_id: 3,
      date: yesterday,
      time_in: '08:59:11',
      status: 'Present',
      confidence_score: 0.934,
    },
    {
      attendance_id: 9,
      user_id: 4,
      date: yesterday,
      time_in: '08:51:22',
      status: 'Present',
      confidence_score: 0.9511,
    },
    {
      attendance_id: 10,
      user_id: 2,
      date: today,
      time_in: '08:54:19',
      status: 'Present',
      confidence_score: 0.961,
    },
    {
      attendance_id: 11,
      user_id: 3,
      date: today,
      time_in: '09:07:45',
      status: 'Present',
      confidence_score: 0.9392,
    },
  ];

  return {
    nextAdminId: 1,
    nextDepartmentId: 6,
    nextUserId: 5,
    nextAttendanceId: 12,
    admins: [],
    departments,
    users,
    attendance,
    settings: {...DEFAULT_SETTINGS},
  };
}

export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function parseEncodingBlob(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw.map(Number);
  }
  if (Buffer.isBuffer(raw)) {
    const text = raw.toString('utf8').trim();
    if (text.startsWith('[')) {
      return (JSON.parse(text) as number[]).map(Number);
    }
    const floats: number[] = [];
    for (let offset = 0; offset + 8 <= raw.length; offset += 8) {
      floats.push(raw.readDoubleLE(offset));
    }
    return floats;
  }
  if (typeof raw === 'string') {
    return (JSON.parse(raw) as number[]).map(Number);
  }
  return [];
}

class AttendanceDatabase {
  private pool: mysql.Pool | null = null;
  private storePath: string;
  private localData: LocalStoreData;
  private mode: 'mysql' | 'local-store' = 'local-store';

  constructor() {
    this.storePath = path.resolve(process.cwd(), 'data', 'store.json');
    this.localData = this.loadLocalStore();
  }

  async init(): Promise<void> {
    const host = process.env.MYSQL_HOST?.trim();
    const user = process.env.MYSQL_USER?.trim();
    const database = process.env.MYSQL_DATABASE?.trim();

    if (host && user && database) {
      try {
        this.pool = mysql.createPool({
          host,
          port: Number(process.env.MYSQL_PORT || 3306),
          user,
          password: process.env.MYSQL_PASSWORD || '',
          database,
          waitForConnections: true,
          connectionLimit: 10,
          dateStrings: true,
        });
        await this.pool.query('SELECT 1');
        this.mode = 'mysql';
        console.log(`[DB] Connected to MySQL 8.0 (${host}/${database})`);
        return;
      } catch (err) {
        console.warn('[DB] MySQL connection unavailable, using local relational store:', err);
        this.pool = null;
      }
    }

    this.mode = 'local-store';
    console.log('[DB] Using persistent local relational store (data/store.json)');
  }

  getMode(): 'mysql' | 'local-store' {
    return this.mode;
  }

  private loadLocalStore(): LocalStoreData {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf8');
        const parsed = JSON.parse(raw) as LocalStoreData;
        return {
          ...createInitialLocalStore(),
          ...parsed,
          settings: {
            ...DEFAULT_SETTINGS,
            ...(parsed.settings || {}),
          },
        };
      }
    } catch (err) {
      console.warn('[DB] Failed to load local store, re-initializing:', err);
    }
    const initial = createInitialLocalStore();
    this.persistLocalStore(initial);
    return initial;
  }

  private persistLocalStore(data: LocalStoreData = this.localData): void {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {recursive: true});
    }
    fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2), 'utf8');
  }

  // ---- Admins ----

  async countAdmins(): Promise<number> {
    if (this.pool) {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        'SELECT COUNT(*) AS cnt FROM admins',
      );
      return Number(rows[0]?.cnt || 0);
    }
    return this.localData.admins.length;
  }

  async findAdminByEmail(email: string): Promise<AdminRecord | null> {
    const normalized = email.trim().toLowerCase();
    if (this.pool) {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        'SELECT admin_id, name, email, password_hash, created_at FROM admins WHERE LOWER(email) = ? LIMIT 1',
        [normalized],
      );
      if (rows.length === 0) return null;
      return rows[0] as AdminRecord;
    }
    return (
      this.localData.admins.find((a) => a.email.toLowerCase() === normalized) || null
    );
  }

  async createAdmin(name: string, email: string, passwordHash: string): Promise<AdminRecord> {
    const normalized = email.trim().toLowerCase();
    if (this.pool) {
      const [result] = await this.pool.execute<mysql.ResultSetHeader>(
        'INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)',
        [name.trim(), normalized, passwordHash],
      );
      return {
        admin_id: result.insertId,
        name: name.trim(),
        email: normalized,
        password_hash: passwordHash,
        created_at: new Date().toISOString(),
      };
    }

    const record: AdminRecord = {
      admin_id: this.localData.nextAdminId++,
      name: name.trim(),
      email: normalized,
      password_hash: passwordHash,
      created_at: new Date().toISOString(),
    };
    this.localData.admins.push(record);
    this.persistLocalStore();
    return record;
  }

  // ---- Departments ----

  async listDepartments(): Promise<DepartmentRecord[]> {
    if (this.pool) {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        'SELECT department_id, department_name FROM departments ORDER BY department_name ASC',
      );
      return rows as DepartmentRecord[];
    }
    return [...this.localData.departments].sort((a, b) =>
      a.department_name.localeCompare(b.department_name),
    );
  }

  async createDepartment(departmentName: string): Promise<DepartmentRecord> {
    const trimmed = departmentName.trim();
    if (this.pool) {
      const [result] = await this.pool.execute<mysql.ResultSetHeader>(
        'INSERT INTO departments (department_name) VALUES (?)',
        [trimmed],
      );
      return {department_id: result.insertId, department_name: trimmed};
    }
    const existing = this.localData.departments.find(
      (d) => d.department_name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      throw new Error('Department already exists');
    }
    const record: DepartmentRecord = {
      department_id: this.localData.nextDepartmentId++,
      department_name: trimmed,
    };
    this.localData.departments.push(record);
    this.persistLocalStore();
    return record;
  }

  // ---- Users ----

  async listUsers(includeEncodings = false): Promise<UserRecord[]> {
    if (this.pool) {
      const cols = includeEncodings
        ? 'u.user_id, u.name, u.roll_no, u.department_id, d.department_name, u.role, u.face_encoding, u.avatar_url, u.registered_on'
        : 'u.user_id, u.name, u.roll_no, u.department_id, d.department_name, u.role, u.avatar_url, u.registered_on';
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        `SELECT ${cols} FROM users u INNER JOIN departments d ON d.department_id = u.department_id ORDER BY u.registered_on DESC`,
      );
      return rows.map((r) => ({
        user_id: Number(r.user_id),
        name: String(r.name),
        roll_no: String(r.roll_no),
        department_id: Number(r.department_id),
        department_name: String(r.department_name),
        role: r.role as MemberRole,
        face_encoding: includeEncodings ? parseEncodingBlob(r.face_encoding) : [],
        avatar_url: r.avatar_url ? String(r.avatar_url) : null,
        registered_on: String(r.registered_on),
      }));
    }

    const deptMap = new Map(
      this.localData.departments.map((d) => [d.department_id, d.department_name]),
    );
    return [...this.localData.users]
      .sort((a, b) => b.user_id - a.user_id)
      .map((u) => ({
        ...u,
        department_name: deptMap.get(u.department_id) || 'Unassigned',
        face_encoding: includeEncodings ? u.face_encoding : [],
      }));
  }

  async createUser(input: {
    name: string;
    roll_no: string;
    department_id: number;
    role: MemberRole;
    face_encoding: number[];
    avatar_url: string | null;
  }): Promise<UserRecord> {
    const cleanName = input.name.trim();
    const cleanRoll = input.roll_no.trim();
    const nowStr = `${getLocalDateString(0)} ${getLocalTimeString()}`;

    if (this.pool) {
      const blob = Buffer.from(JSON.stringify(input.face_encoding), 'utf8');
      const [result] = await this.pool.execute<mysql.ResultSetHeader>(
        'INSERT INTO users (name, roll_no, department_id, role, face_encoding, avatar_url, registered_on) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [cleanName, cleanRoll, input.department_id, input.role, blob, input.avatar_url, nowStr],
      );
      const depts = await this.listDepartments();
      const dept = depts.find((d) => d.department_id === input.department_id);
      return {
        user_id: result.insertId,
        name: cleanName,
        roll_no: cleanRoll,
        department_id: input.department_id,
        department_name: dept?.department_name || '',
        role: input.role,
        face_encoding: input.face_encoding,
        avatar_url: input.avatar_url,
        registered_on: nowStr,
      };
    }

    if (
      this.localData.users.some(
        (u) => u.roll_no.toLowerCase() === cleanRoll.toLowerCase(),
      )
    ) {
      throw new Error(`Roll No / Employee ID "${cleanRoll}" is already registered`);
    }
    const dept = this.localData.departments.find(
      (d) => d.department_id === input.department_id,
    );
    if (!dept) {
      throw new Error('Selected department does not exist');
    }

    const record: UserRecord = {
      user_id: this.localData.nextUserId++,
      name: cleanName,
      roll_no: cleanRoll,
      department_id: input.department_id,
      department_name: dept.department_name,
      role: input.role,
      face_encoding: input.face_encoding,
      avatar_url: input.avatar_url,
      registered_on: nowStr,
    };
    this.localData.users.push(record);
    this.persistLocalStore();
    return record;
  }

  async updateUserEncoding(userId: number, encoding: number[]): Promise<boolean> {
    if (this.pool) {
      const blob = Buffer.from(JSON.stringify(encoding), 'utf8');
      const [result] = await this.pool.execute<mysql.ResultSetHeader>(
        'UPDATE users SET face_encoding = ? WHERE user_id = ?',
        [blob, userId],
      );
      return result.affectedRows > 0;
    }
    const target = this.localData.users.find((u) => u.user_id === userId);
    if (!target) return false;
    target.face_encoding = encoding;
    this.persistLocalStore();
    return true;
  }

  async deleteUser(userId: number): Promise<boolean> {
    if (this.pool) {
      const [result] = await this.pool.execute<mysql.ResultSetHeader>(
        'DELETE FROM users WHERE user_id = ?',
        [userId],
      );
      return result.affectedRows > 0;
    }
    const before = this.localData.users.length;
    this.localData.users = this.localData.users.filter((u) => u.user_id !== userId);
    this.localData.attendance = this.localData.attendance.filter(
      (a) => a.user_id !== userId,
    );
    if (this.localData.users.length !== before) {
      this.persistLocalStore();
      return true;
    }
    return false;
  }

  // ---- Attendance ----

  async logAttendance(
    userId: number,
    confidenceScore: number,
  ): Promise<{
    outcome: 'marked' | 'duplicate';
    record: AttendanceRecord;
  }> {
    const settings = await this.getSettings();
    const now = new Date();
    const dateStr = getLocalDateString(0);
    const timeStr = getLocalTimeString(now);

    if (this.pool) {
      if (settings.duplicate_mode === 'same_day') {
        const [existingRows] = await this.pool.execute<mysql.RowDataPacket[]>(
          'SELECT attendance_id, user_id, date, time_in, status, confidence_score FROM attendance WHERE user_id = ? AND date = ? ORDER BY attendance_id DESC LIMIT 1',
          [userId, dateStr],
        );
        if (existingRows.length > 0) {
          const row = existingRows[0];
          return {
            outcome: 'duplicate',
            record: {
              attendance_id: Number(row.attendance_id),
              user_id: Number(row.user_id),
              date: String(row.date),
              time_in: String(row.time_in),
              status: row.status as AttendanceStatus,
              confidence_score: Number(row.confidence_score),
            },
          };
        }
      } else {
        const [existingRows] = await this.pool.execute<mysql.RowDataPacket[]>(
          `SELECT attendance_id, user_id, date, time_in, status, confidence_score
           FROM attendance
           WHERE user_id = ? AND date = ?
             AND TIMESTAMPDIFF(MINUTE, TIMESTAMP(date, time_in), ?) < ?
           ORDER BY attendance_id DESC LIMIT 1`,
          [userId, dateStr, `${dateStr} ${timeStr}`, settings.duplicate_window_minutes],
        );
        if (existingRows.length > 0) {
          const row = existingRows[0];
          return {
            outcome: 'duplicate',
            record: {
              attendance_id: Number(row.attendance_id),
              user_id: Number(row.user_id),
              date: String(row.date),
              time_in: String(row.time_in),
              status: row.status as AttendanceStatus,
              confidence_score: Number(row.confidence_score),
            },
          };
        }
      }

      const status: AttendanceStatus =
        timeStr > settings.late_after_time ? 'Late' : 'Present';
      const roundedConfidence = Number(confidenceScore.toFixed(4));
      const [result] = await this.pool.execute<mysql.ResultSetHeader>(
        'INSERT INTO attendance (user_id, date, time_in, status, confidence_score) VALUES (?, ?, ?, ?, ?)',
        [userId, dateStr, timeStr, status, roundedConfidence],
      );
      return {
        outcome: 'marked',
        record: {
          attendance_id: result.insertId,
          user_id: userId,
          date: dateStr,
          time_in: timeStr,
          status,
          confidence_score: roundedConfidence,
        },
      };
    }

    // Local store duplicate prevention
    const todayEntries = this.localData.attendance
      .filter((a) => a.user_id === userId && a.date === dateStr)
      .sort((a, b) => b.attendance_id - a.attendance_id);

    if (todayEntries.length > 0) {
      const latest = todayEntries[0];
      if (settings.duplicate_mode === 'same_day') {
        return {outcome: 'duplicate', record: latest};
      }
      const latestTs = new Date(`${latest.date}T${latest.time_in}`).getTime();
      const diffMinutes = (now.getTime() - latestTs) / 60000;
      if (diffMinutes < settings.duplicate_window_minutes) {
        return {outcome: 'duplicate', record: latest};
      }
    }

    const status: AttendanceStatus =
      timeStr > settings.late_after_time ? 'Late' : 'Present';
    const record: AttendanceRecord = {
      attendance_id: this.localData.nextAttendanceId++,
      user_id: userId,
      date: dateStr,
      time_in: timeStr,
      status,
      confidence_score: Number(confidenceScore.toFixed(4)),
    };
    this.localData.attendance.push(record);
    this.persistLocalStore();
    return {outcome: 'marked', record};
  }

  async listAttendance(filter: AttendanceFilter = {}): Promise<AttendanceRecord[]> {
    if (this.pool) {
      const conditions: string[] = [];
      const params: Array<string | number> = [];
      if (filter.dateFrom) {
        conditions.push('a.date >= ?');
        params.push(filter.dateFrom);
      }
      if (filter.dateTo) {
        conditions.push('a.date <= ?');
        params.push(filter.dateTo);
      }
      if (filter.departmentId) {
        conditions.push('u.department_id = ?');
        params.push(filter.departmentId);
      }
      if (filter.userId) {
        conditions.push('a.user_id = ?');
        params.push(filter.userId);
      }
      if (filter.status) {
        conditions.push('a.status = ?');
        params.push(filter.status);
      }
      if (filter.search) {
        conditions.push('(u.name LIKE ? OR u.roll_no LIKE ? OR d.department_name LIKE ?)');
        const q = `%${filter.search.trim()}%`;
        params.push(q, q, q);
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        `SELECT a.attendance_id, a.user_id, u.name, u.roll_no, u.department_id,
                d.department_name, u.role, u.avatar_url, a.date, a.time_in, a.status, a.confidence_score
         FROM attendance a
         INNER JOIN users u ON u.user_id = a.user_id
         INNER JOIN departments d ON d.department_id = u.department_id
         ${whereClause}
         ORDER BY a.date DESC, a.time_in DESC, a.attendance_id DESC`,
        params,
      );
      return rows.map((r) => ({
        attendance_id: Number(r.attendance_id),
        user_id: Number(r.user_id),
        name: String(r.name),
        roll_no: String(r.roll_no),
        department_id: Number(r.department_id),
        department_name: String(r.department_name),
        role: r.role as MemberRole,
        avatar_url: r.avatar_url ? String(r.avatar_url) : null,
        date: String(r.date),
        time_in: String(r.time_in),
        status: r.status as AttendanceStatus,
        confidence_score: Number(r.confidence_score),
      }));
    }

    const usersMap = new Map(this.localData.users.map((u) => [u.user_id, u]));
    const deptMap = new Map(
      this.localData.departments.map((d) => [d.department_id, d.department_name]),
    );
    const searchLower = filter.search?.trim().toLowerCase() || '';

    return this.localData.attendance
      .map((a) => {
        const user = usersMap.get(a.user_id);
        if (!user) return null;
        const deptName = deptMap.get(user.department_id) || 'Unassigned';
        return {
          ...a,
          name: user.name,
          roll_no: user.roll_no,
          department_id: user.department_id,
          department_name: deptName,
          role: user.role,
          avatar_url: user.avatar_url,
        } as AttendanceRecord;
      })
      .filter((row): row is AttendanceRecord => {
        if (!row) return false;
        if (filter.dateFrom && row.date < filter.dateFrom) return false;
        if (filter.dateTo && row.date > filter.dateTo) return false;
        if (filter.departmentId && row.department_id !== filter.departmentId) return false;
        if (filter.userId && row.user_id !== filter.userId) return false;
        if (filter.status && row.status !== filter.status) return false;
        if (searchLower) {
          const hay = `${row.name} ${row.roll_no} ${row.department_name}`.toLowerCase();
          if (!hay.includes(searchLower)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        if (a.time_in !== b.time_in) return b.time_in.localeCompare(a.time_in);
        return b.attendance_id - a.attendance_id;
      });
  }

  // ---- Settings ----

  async getSettings(): Promise<SystemSettings> {
    return {...this.localData.settings};
  }

  async updateSettings(patch: Partial<SystemSettings>): Promise<SystemSettings> {
    const next: SystemSettings = {...this.localData.settings};
    if (
      typeof patch.match_threshold === 'number' &&
      patch.match_threshold >= 0.25 &&
      patch.match_threshold <= 0.9
    ) {
      next.match_threshold = Number(patch.match_threshold.toFixed(2));
    }
    if (patch.duplicate_mode === 'window' || patch.duplicate_mode === 'same_day') {
      next.duplicate_mode = patch.duplicate_mode;
    }
    if (
      typeof patch.duplicate_window_minutes === 'number' &&
      patch.duplicate_window_minutes >= 1 &&
      patch.duplicate_window_minutes <= 1440
    ) {
      next.duplicate_window_minutes = Math.round(patch.duplicate_window_minutes);
    }
    if (
      typeof patch.late_after_time === 'string' &&
      /^\d{2}:\d{2}(:\d{2})?$/.test(patch.late_after_time)
    ) {
      next.late_after_time =
        patch.late_after_time.length === 5
          ? `${patch.late_after_time}:00`
          : patch.late_after_time;
    }
    this.localData.settings = next;
    this.persistLocalStore();
    return {...next};
  }
}

export const db = new AttendanceDatabase();
