import {useCallback, useEffect, useState} from 'react';
import {Download, Search, X} from 'lucide-react';
import {
  api,
  type AttendanceLog,
  type AttendanceStatus,
  type Department,
  type RegisteredUser,
} from '../lib/api.ts';
import {AvatarThumb} from './AvatarThumb.tsx';

interface AttendanceLogsViewProps {
  departments: Department[];
  users: RegisteredUser[];
  refreshSignal: number;
}

export function AttendanceLogsView({
  departments,
  users,
  refreshSignal,
}: AttendanceLogsViewProps) {
  const [records, setRecords] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | ''>('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAttendance({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        departmentId: departmentId ? Number(departmentId) : undefined,
        userId: userId ? Number(userId) : undefined,
        status: statusFilter,
        search: search || undefined,
      });
      setRecords(res.records);
    } catch (err) {
      console.error('Failed to load attendance logs:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, departmentId, userId, statusFilter, search]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs, refreshSignal]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await api.exportAttendanceCsv({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        departmentId: departmentId ? Number(departmentId) : undefined,
        userId: userId ? Number(userId) : undefined,
        status: statusFilter,
        search: search || undefined,
      });
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setDepartmentId('');
    setUserId('');
    setStatusFilter('');
  };

  const hasFilters = Boolean(
    search || dateFrom || dateTo || departmentId || userId || statusFilter,
  );

  return (
    <div className="space-y-5">
      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, roll no, or department..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['', 'Present', 'Late'] as const).map((st) => (
                <button
                  key={st || 'all'}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st || 'All Statuses'}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-55 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label htmlFor="log-from" className="block text-[11px] font-medium text-slate-500 mb-1">
              From Date
            </label>
            <input
              id="log-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 tabular-nums focus:border-blue-700 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="log-to" className="block text-[11px] font-medium text-slate-500 mb-1">
              To Date
            </label>
            <input
              id="log-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 tabular-nums focus:border-blue-700 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="log-dept" className="block text-[11px] font-medium text-slate-500 mb-1">
              Department
            </label>
            <select
              id="log-dept"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.department_id} value={d.department_id}>
                  {d.department_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="log-user" className="block text-[11px] font-medium text-slate-500 mb-1">
                Member
              </label>
              <select
                id="log-user"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
              >
                <option value="">All Members</option>
                {users.map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.name} ({u.roll_no})
                  </option>
                ))}
              </select>
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                title="Clear filters"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Verified Attendance Ledger
          </h2>
          <span className="text-xs text-slate-500 tabular-nums">
            {records.length} {records.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-5">Member</th>
                <th className="py-2.5 px-4">Roll No / ID</th>
                <th className="py-2.5 px-4">Department</th>
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">Time In</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-5 text-right">Match Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                Array.from({length: 5}).map((_, i) => (
                  <tr key={i} className="h-11">
                    <td className="px-5 py-2.5" colSpan={7}>
                      <div className="h-4 bg-slate-100 rounded animate-pulse w-full" />
                    </td>
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <p className="text-sm font-medium text-slate-700">
                      No matching attendance records found
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Adjust your date range or filters, or record check-ins from Live Monitor.
                    </p>
                  </td>
                </tr>
              ) : (
                records.map((rec) => (
                  <tr key={rec.attendance_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-5">
                      <div className="flex items-center gap-3">
                        <AvatarThumb src={rec.avatar_url} name={rec.name} size="sm" />
                        <div>
                          <div className="font-medium text-slate-900">{rec.name}</div>
                          <div className="text-xs text-slate-500">{rec.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-700 tabular-nums">
                      {rec.roll_no}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-700">
                      {rec.department_name}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-700 tabular-nums">
                      {rec.date}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-700 tabular-nums">
                      {rec.time_in}
                    </td>
                    <td className="py-2.5 px-4 text-xs font-medium">
                      <span
                        className={
                          rec.status === 'Present'
                            ? 'text-emerald-700'
                            : rec.status === 'Late'
                              ? 'text-amber-700'
                              : 'text-red-700'
                        }
                      >
                        {rec.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-5 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {(rec.confidence_score * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
