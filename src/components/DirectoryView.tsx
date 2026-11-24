import {useState, type FormEvent} from 'react';
import {Plus, Search, Terminal, Trash2} from 'lucide-react';
import {api, type Department, type RegisteredUser} from '../lib/api.ts';
import {AvatarThumb} from './AvatarThumb.tsx';

interface DirectoryViewProps {
  users: RegisteredUser[];
  departments: Department[];
  databaseMode: 'mysql' | 'local-store';
  onRefresh: () => void;
}

export function DirectoryView({
  users,
  departments,
  databaseMode,
  onRefresh,
}: DirectoryViewProps) {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [newDeptName, setNewDeptName] = useState('');
  const [deptError, setDeptError] = useState<string | null>(null);
  const [addingDept, setAddingDept] = useState(false);

  const filteredUsers = users.filter((u) => {
    if (deptFilter && u.department_id !== Number(deptFilter)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        u.name.toLowerCase().includes(q) ||
        u.roll_no.toLowerCase().includes(q) ||
        u.department_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleDeleteUser = async (userId: number) => {
    setDeletingId(userId);
    try {
      await api.deleteUser(userId);
      setConfirmDeleteId(null);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete member:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleAddDepartment = async (e: FormEvent) => {
    e.preventDefault();
    setDeptError(null);
    if (newDeptName.trim().length < 2) {
      setDeptError('Enter a valid department name');
      return;
    }
    setAddingDept(true);
    try {
      await api.createDepartment(newDeptName);
      setNewDeptName('');
      onRefresh();
    } catch (err) {
      setDeptError(err instanceof Error ? err.message : 'Unable to add department');
    } finally {
      setAddingDept(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Registered Members Directory */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter registered members..."
                className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
              />
            </div>

            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.department_id} value={d.department_id}>
                  {d.department_name}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-5">Member</th>
                  <th className="py-2.5 px-4">Roll No / ID</th>
                  <th className="py-2.5 px-4">Department</th>
                  <th className="py-2.5 px-4">Registered On</th>
                  <th className="py-2.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-xs text-slate-500">
                      No registered members match your search.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.user_id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-5">
                        <div className="flex items-center gap-3">
                          <AvatarThumb src={user.avatar_url} name={user.name} size="sm" />
                          <div>
                            <div className="font-medium text-slate-900">{user.name}</div>
                            <div className="text-xs text-slate-500">{user.role}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs text-slate-700 tabular-nums">
                        {user.roll_no}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-700">
                        {user.department_name}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs text-slate-500 tabular-nums">
                        {user.registered_on}
                      </td>
                      <td className="py-2.5 px-5 text-right">
                        {confirmDeleteId === user.user_id ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              disabled={deletingId === user.user_id}
                              onClick={() => void handleDeleteUser(user.user_id)}
                              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 cursor-pointer whitespace-nowrap"
                            >
                              {deletingId === user.user_id ? 'Removing...' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(user.user_id)}
                            aria-label={`Remove ${user.name}`}
                            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-slate-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Department Management & Python Engine Integration */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Departments & Classes
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Organize students and staff into academic or operational groups
              </p>
            </div>

            <form onSubmit={handleAddDepartment} className="flex gap-2">
              <input
                type="text"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="New department name..."
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
              />
              <button
                type="submit"
                disabled={addingDept}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </form>

            {deptError && (
              <p className="text-xs text-red-700">{deptError}</p>
            )}

            <ul className="divide-y divide-slate-100 text-xs">
              {departments.map((d) => {
                const count = users.filter((u) => u.department_id === d.department_id).length;
                return (
                  <li key={d.department_id} className="py-2 flex items-center justify-between">
                    <span className="font-medium text-slate-800">{d.department_name}</span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {count} {count === 1 ? 'member' : 'members'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-slate-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                Python OpenCV + MySQL 8.0 Engine
              </h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Active backend mode:{' '}
              <span className="font-mono font-medium text-slate-900">
                {databaseMode === 'mysql' ? 'MySQL 8.0 Pool' : 'Local Relational Store'}
              </span>
              . Run the dlib workstation camera service alongside this Express API:
            </p>
            <pre className="rounded-lg bg-slate-950 text-slate-100 p-3 text-[11px] font-mono overflow-x-auto leading-relaxed">
{`mysql -u root -p < database/schema.sql
pip install -r face_engine/requirements.txt
python face_engine/recognize_attendance.py`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
