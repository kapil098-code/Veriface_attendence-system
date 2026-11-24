export type MemberRole = 'Student' | 'Faculty' | 'Staff' | 'Intern';
export type AttendanceStatus = 'Present' | 'Late' | 'Absent';
export type DuplicateMode = 'window' | 'same_day';

export interface AdminUser {
  admin_id: number;
  name: string;
  email: string;
}

export interface AuthStatusResponse {
  needsSetup: boolean;
  hasEnvOverride: boolean;
  databaseMode: 'mysql' | 'local-store';
}

export interface Department {
  department_id: number;
  department_name: string;
}

export interface RegisteredUser {
  user_id: number;
  name: string;
  roll_no: string;
  department_id: number;
  department_name: string;
  role: MemberRole;
  avatar_url: string | null;
  registered_on: string;
}

export interface AttendanceLog {
  attendance_id: number;
  user_id: number;
  name: string;
  roll_no: string;
  department_id: number;
  department_name: string;
  role: MemberRole;
  avatar_url: string | null;
  date: string;
  time_in: string;
  status: AttendanceStatus;
  confidence_score: number;
}

export interface RecognitionResponse {
  status: 'marked' | 'duplicate' | 'unknown';
  matched: boolean;
  distance: number | null;
  threshold: number;
  confidence: number;
  user?: {
    user_id: number;
    name: string;
    roll_no: string;
    department_name: string;
    role: MemberRole;
    avatar_url: string | null;
  };
  record?: AttendanceLog;
}

export interface SystemSettings {
  match_threshold: number;
  duplicate_mode: DuplicateMode;
  duplicate_window_minutes: number;
  late_after_time: string;
}

export interface ReportsSummary {
  dateFrom: string;
  dateTo: string;
  today: {
    date: string;
    total_members: number;
    present: number;
    late: number;
    checked_in: number;
    absent: number;
    attendance_pct: number;
  };
  dailyBreakdown: Array<{
    date: string;
    present: number;
    late: number;
    absent: number;
    rate_pct: number;
  }>;
  memberSummary: Array<{
    user_id: number;
    name: string;
    roll_no: string;
    department_name: string;
    role: MemberRole;
    avatar_url: string | null;
    days_present: number;
    days_late: number;
    days_attended: number;
    total_days: number;
    attendance_pct: number;
    avg_confidence: number;
  }>;
  departmentSummary: Array<{
    department_id: number;
    department_name: string;
    member_count: number;
    present_today: number;
    absent_today: number;
    range_rate_pct: number;
  }>;
}

class ApiClient {
  // Token kept strictly in JS memory (never localStorage/sessionStorage)
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!headers.has('Content-Type') && init.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const res = await fetch(`/api${path}`, {
      ...init,
      headers,
    });

    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const body = (await res.json()) as {error?: string};
        if (body.error) message = body.error;
      } catch {
        // ignore parse errors
      }
      throw new Error(message);
    }

    return (await res.json()) as T;
  }

  getAuthStatus() {
    return this.request<AuthStatusResponse>('/auth/status');
  }

  setupAdmin(payload: {name: string; email: string; password: string}) {
    return this.request<{token: string; admin: AdminUser}>('/auth/setup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  login(payload: {email: string; password: string}) {
    return this.request<{token: string; admin: AdminUser}>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  getDepartments() {
    return this.request<{departments: Department[]}>('/departments');
  }

  createDepartment(department_name: string) {
    return this.request<{department: Department}>('/departments', {
      method: 'POST',
      body: JSON.stringify({department_name}),
    });
  }

  getUsers() {
    return this.request<{users: RegisteredUser[]}>('/users');
  }

  registerUser(payload: {
    name: string;
    roll_no: string;
    department_id: number;
    role: MemberRole;
    face_encoding: number[];
    avatar_url: string | null;
  }) {
    return this.request<{user: RegisteredUser}>('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  updateUserEncoding(userId: number, face_encoding: number[]) {
    return this.request<{updated: boolean}>(`/users/${userId}/encoding`, {
      method: 'PATCH',
      body: JSON.stringify({face_encoding}),
    });
  }

  deleteUser(userId: number) {
    return this.request<{deleted: boolean}>(`/users/${userId}`, {
      method: 'DELETE',
    });
  }

  recognizeFace(encoding: number[], threshold?: number) {
    return this.request<RecognitionResponse>('/attendance/recognize', {
      method: 'POST',
      body: JSON.stringify({encoding, threshold}),
    });
  }

  getAttendance(params: {
    dateFrom?: string;
    dateTo?: string;
    departmentId?: number;
    userId?: number;
    status?: AttendanceStatus | '';
    search?: string;
  }) {
    const qs = new URLSearchParams();
    if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params.dateTo) qs.set('dateTo', params.dateTo);
    if (params.departmentId) qs.set('departmentId', String(params.departmentId));
    if (params.userId) qs.set('userId', String(params.userId));
    if (params.status) qs.set('status', params.status);
    if (params.search) qs.set('search', params.search);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this.request<{records: AttendanceLog[]}>(`/attendance${suffix}`);
  }

  async exportAttendanceCsv(params: {
    dateFrom?: string;
    dateTo?: string;
    departmentId?: number;
    userId?: number;
    status?: AttendanceStatus | '';
    search?: string;
  }): Promise<void> {
    const qs = new URLSearchParams();
    if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params.dateTo) qs.set('dateTo', params.dateTo);
    if (params.departmentId) qs.set('departmentId', String(params.departmentId));
    if (params.userId) qs.set('userId', String(params.userId));
    if (params.status) qs.set('status', params.status);
    if (params.search) qs.set('search', params.search);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';

    const headers = new Headers();
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }
    const res = await fetch(`/api/attendance/export${suffix}`, {headers});
    if (!res.ok) {
      throw new Error('Failed to export attendance CSV');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `veriface-attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  getReportsSummary(dateFrom?: string, dateTo?: string) {
    const qs = new URLSearchParams();
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this.request<ReportsSummary>(`/reports/summary${suffix}`);
  }

  getSettings() {
    return this.request<{settings: SystemSettings}>('/settings');
  }

  updateSettings(patch: Partial<SystemSettings>) {
    return this.request<{settings: SystemSettings}>('/settings', {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  }
}

export const api = new ApiClient();
