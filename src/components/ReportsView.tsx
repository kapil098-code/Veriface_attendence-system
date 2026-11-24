import {useCallback, useEffect, useState} from 'react';
import {api, type ReportsSummary} from '../lib/api.ts';
import {AvatarThumb} from './AvatarThumb.tsx';

interface ReportsViewProps {
  refreshSignal: number;
}

function getDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function ReportsView({refreshSignal}: ReportsViewProps) {
  const [dateFrom, setDateFrom] = useState(() => getDateOffset(-6));
  const [dateTo, setDateTo] = useState(() => getDateOffset(0));
  const [report, setReport] = useState<ReportsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getReportsSummary(dateFrom, dateTo);
      setReport(data);
    } catch (err) {
      console.error('Failed to load report summary:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void loadReport();
  }, [loadReport, refreshSignal]);

  const applyPreset = (daysBack: number) => {
    setDateFrom(getDateOffset(-daysBack));
    setDateTo(getDateOffset(0));
  };

  return (
    <div className="space-y-6">
      {/* Date Range Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => applyPreset(6)}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-slate-700 hover:bg-white transition-colors cursor-pointer whitespace-nowrap"
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => applyPreset(13)}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-slate-700 hover:bg-white transition-colors cursor-pointer whitespace-nowrap"
          >
            Last 14 Days
          </button>
          <button
            type="button"
            onClick={() => applyPreset(29)}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-slate-700 hover:bg-white transition-colors cursor-pointer whitespace-nowrap"
          >
            Last 30 Days
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="rep-from" className="text-xs text-slate-600">
              From
            </label>
            <input
              id="rep-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 tabular-nums focus:border-blue-700 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="rep-to" className="text-xs text-slate-600">
              To
            </label>
            <input
              id="rep-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 tabular-nums focus:border-blue-700 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Department Summary + Daily Present/Absent Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Department-wise Summary */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">
              Department / Class Summary
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Today&apos;s headcount and period attendance rate by department
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-5">Department</th>
                  <th className="py-2.5 px-3 text-right">Members</th>
                  <th className="py-2.5 px-3 text-right">Present Today</th>
                  <th className="py-2.5 px-3 text-right">Absent Today</th>
                  <th className="py-2.5 px-5 text-right">Period Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading || !report ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                      Loading department summary...
                    </td>
                  </tr>
                ) : (
                  report.departmentSummary.map((dept) => (
                    <tr key={dept.department_id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-5 font-medium text-slate-900">
                        {dept.department_name}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {dept.member_count}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 font-medium">
                        {dept.present_today}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                        {dept.absent_today}
                      </td>
                      <td className="py-2.5 px-5 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {dept.range_rate_pct}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Daily Present / Absent Breakdown */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">
              Daily Present & Absent Count
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Day-by-day attendance coverage across {report?.dailyBreakdown.length ?? 0} days
            </p>
          </div>
          <div className="divide-y divide-slate-100 max-h-[340px] overflow-y-auto">
            {loading || !report ? (
              <div className="px-5 py-8 text-center text-xs text-slate-500">
                Calculating daily counts...
              </div>
            ) : report.dailyBreakdown.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-500">
                Select a valid date range to view daily counts.
              </div>
            ) : (
              [...report.dailyBreakdown].reverse().map((day) => {
                const total = day.present + day.late + day.absent || 1;
                const presentW = (day.present / total) * 100;
                const lateW = (day.late / total) * 100;
                return (
                  <div key={day.date} className="px-5 py-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono tabular-nums font-medium text-slate-800">
                        {day.date}
                      </span>
                      <span className="text-slate-600 tabular-nums">
                        {day.present} Present · {day.late} Late · {day.absent} Absent ({day.rate_pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-600"
                        style={{width: `${presentW}%`}}
                      />
                      <div
                        className="h-full bg-amber-500"
                        style={{width: `${lateW}%`}}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Per-Person Attendance Percentage Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Individual Attendance Percentage
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Calculated from {dateFrom} through {dateTo}
            </p>
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            {report?.memberSummary.length ?? 0} members
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-5">Member</th>
                <th className="py-2.5 px-4">Roll No / ID</th>
                <th className="py-2.5 px-4">Department</th>
                <th className="py-2.5 px-4 text-right">Days Present</th>
                <th className="py-2.5 px-4 text-right">Days Late</th>
                <th className="py-2.5 px-4 text-right">Avg Confidence</th>
                <th className="py-2.5 px-5 text-right">Attendance %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading || !report ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-xs text-slate-500">
                    Computing member percentages...
                  </td>
                </tr>
              ) : report.memberSummary.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-xs text-slate-500">
                    No registered members found.
                  </td>
                </tr>
              ) : (
                report.memberSummary.map((m) => (
                  <tr key={m.user_id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-5">
                      <div className="flex items-center gap-3">
                        <AvatarThumb src={m.avatar_url} name={m.name} size="sm" />
                        <div>
                          <div className="font-medium text-slate-900">{m.name}</div>
                          <div className="text-xs text-slate-500">{m.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-700 tabular-nums">
                      {m.roll_no}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-700">
                      {m.department_name}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {m.days_present}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-amber-700 tabular-nums">
                      {m.days_late}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {m.avg_confidence > 0 ? `${m.avg_confidence}%` : '—'}
                    </td>
                    <td className="py-2.5 px-5 text-right font-mono text-xs font-semibold tabular-nums">
                      <span
                        className={
                          m.attendance_pct >= 75
                            ? 'text-emerald-700'
                            : m.attendance_pct >= 50
                              ? 'text-amber-700'
                              : 'text-red-700'
                        }
                      >
                        {m.attendance_pct}% ({m.days_attended}/{m.total_days})
                      </span>
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
