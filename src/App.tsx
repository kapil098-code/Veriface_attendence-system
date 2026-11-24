import {useCallback, useEffect, useRef, useState} from 'react';
import {
  BarChart3,
  ClipboardList,
  LogOut,
  Menu,
  ScanFace,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {AuthGate} from './components/AuthGate.tsx';
import {AttendanceLogsView} from './components/AttendanceLogsView.tsx';
import {DirectoryView} from './components/DirectoryView.tsx';
import {LiveMonitorView} from './components/LiveMonitorView.tsx';
import {RegisterUserView} from './components/RegisterUserView.tsx';
import {ReportsView} from './components/ReportsView.tsx';
import {
  api,
  type AdminUser,
  type AuthStatusResponse,
  type Department,
  type RegisteredUser,
  type ReportsSummary,
  type SystemSettings,
} from './lib/api.ts';
import {encodeImageUrl} from './lib/faceEngine.ts';

type NavTab = 'monitor' | 'register' | 'logs' | 'reports' | 'directory';

const NAV_ITEMS: Array<{id: NavTab; label: string; icon: typeof ScanFace}> = [
  {id: 'monitor', label: 'Live Monitor', icon: ScanFace},
  {id: 'register', label: 'Register User', icon: UserPlus},
  {id: 'logs', label: 'Attendance Logs', icon: ClipboardList},
  {id: 'reports', label: 'Reports', icon: BarChart3},
  {id: 'directory', label: 'Directory', icon: Users},
];

const DEFAULT_SETTINGS: SystemSettings = {
  match_threshold: 0.55,
  duplicate_mode: 'window',
  duplicate_window_minutes: 10,
  late_after_time: '09:15:00',
};

export default function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('monitor');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const syncedPortraitsRef = useRef(false);

  useEffect(() => {
    let active = true;
    api
      .getAuthStatus()
      .then((res) => {
        if (active) setAuthStatus(res);
      })
      .catch((err) => {
        console.error('Failed to check auth status:', err);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    if (!admin) return;
    try {
      const [deptRes, usersRes, settingsRes, summaryRes] = await Promise.all([
        api.getDepartments(),
        api.getUsers(),
        api.getSettings(),
        api.getReportsSummary(),
      ]);
      setDepartments(deptRes.departments);
      setUsers(usersRes.users);
      setSettings(settingsRes.settings);
      setSummary(summaryRes);

      if (!syncedPortraitsRef.current) {
        syncedPortraitsRef.current = true;
        const seeded = usersRes.users.filter(
          (u) => u.avatar_url && u.avatar_url.startsWith('/src/assets/images/member_'),
        );
        for (const member of seeded) {
          if (!member.avatar_url) continue;
          const encoding = await encodeImageUrl(member.avatar_url);
          if (encoding && encoding.length === 128) {
            await api.updateUserEncoding(member.user_id, encoding);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load workspace data:', err);
    }
  }, [admin]);

  useEffect(() => {
    void loadWorkspaceData();
  }, [loadWorkspaceData, refreshSignal]);

  const handleAuthenticated = (token: string, loggedInAdmin: AdminUser) => {
    api.setToken(token);
    setAdmin(loggedInAdmin);
  };

  const handleSignOut = () => {
    api.setToken(null);
    setAdmin(null);
    syncedPortraitsRef.current = false;
    api
      .getAuthStatus()
      .then(setAuthStatus)
      .catch(() => {});
  };

  const triggerRefresh = () => {
    setRefreshSignal((prev) => prev + 1);
  };

  if (!authStatus) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-600">Loading VeriFace Attendance Console...</p>
      </div>
    );
  }

  if (!admin) {
    return <AuthGate status={authStatus} onAuthenticated={handleAuthenticated} />;
  }

  const activeNav = NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white">
        <div className="h-16 px-6 flex items-center border-b border-slate-200">
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            VeriFace Attendance
          </span>
        </div>

        <nav aria-label="Primary" className="flex-1 px-3 py-5 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="px-2">
            <p className="text-xs font-medium text-slate-900 truncate">{admin.name}</p>
            <p className="text-[11px] text-slate-500 truncate">{admin.email}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative z-50 w-64 max-w-full bg-white h-full flex flex-col border-r border-slate-200">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
              <span className="font-display text-base font-bold text-slate-900">
                VeriFace Attendance
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation"
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Workspace */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-8 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="font-display text-base sm:text-lg font-semibold text-slate-900 truncate">
              {activeNav.label}
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeTab !== 'register' ? (
              <button
                type="button"
                onClick={() => setActiveTab('register')}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Register Member
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('monitor')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <ScanFace className="h-3.5 w-3.5" />
                Live Monitor
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1360px] w-full mx-auto">
          {activeTab === 'monitor' && (
            <LiveMonitorView
              users={users}
              settings={settings}
              summary={summary}
              onSettingsUpdated={setSettings}
              onAttendanceLogged={triggerRefresh}
            />
          )}

          {activeTab === 'register' && (
            <RegisterUserView
              departments={departments}
              onUserRegistered={() => {
                triggerRefresh();
              }}
            />
          )}

          {activeTab === 'logs' && (
            <AttendanceLogsView
              departments={departments}
              users={users}
              refreshSignal={refreshSignal}
            />
          )}

          {activeTab === 'reports' && <ReportsView refreshSignal={refreshSignal} />}

          {activeTab === 'directory' && (
            <DirectoryView
              users={users}
              departments={departments}
              databaseMode={authStatus.databaseMode}
              onRefresh={triggerRefresh}
            />
          )}
        </main>
      </div>
    </div>
  );
}
