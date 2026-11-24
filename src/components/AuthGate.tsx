import {useState, type FormEvent} from 'react';
import {Lock, ShieldCheck} from 'lucide-react';
import {api, type AdminUser, type AuthStatusResponse} from '../lib/api.ts';

interface AuthGateProps {
  status: AuthStatusResponse;
  onAuthenticated: (token: string, admin: AdminUser) => void;
}

export function AuthGate({status, onAuthenticated}: AuthGateProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (status.needsSetup) {
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      setSubmitting(true);
      try {
        const res = await api.setupAdmin({name, email, password});
        onAuthenticated(res.token, res.admin);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to create administrator');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.login({email, password});
      onAuthenticated(res.token, res.admin);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-6 py-12">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-blue-700 text-white flex items-center justify-center shrink-0">
            {status.needsSetup ? (
              <ShieldCheck className="h-5 w-5" />
            ) : (
              <Lock className="h-5 w-5" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
              VeriFace Attendance
            </h1>
            <p className="text-sm text-slate-500">
              {status.needsSetup
                ? 'Initial Administrator Setup'
                : 'Administrator Console Sign In'}
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          {status.needsSetup
            ? 'Claim the initial administrator account to manage face registrations, live recognition thresholds, and attendance logs.'
            : 'Sign in with your administrator credentials to access live camera monitoring, member registration, and attendance reports.'}
        </p>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {status.needsSetup && (
            <div>
              <label
                htmlFor="admin-name"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Administrator Name
              </label>
              <input
                id="admin-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Sarah Jenkins"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="admin-email"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Email Address
            </label>
            <input
              id="admin-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@institution.edu"
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15"
            />
          </div>

          <div>
            <label
              htmlFor="admin-password"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              required
              autoComplete={status.needsSetup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={status.needsSetup ? 'Minimum 8 characters' : 'Enter password'}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15"
            />
          </div>

          {status.needsSetup && (
            <div>
              <label
                htmlFor="admin-password-confirm"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Confirm Password
              </label>
              <input
                id="admin-password-confirm"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
          >
            {submitting
              ? status.needsSetup
                ? 'Creating Account...'
                : 'Signing In...'
              : status.needsSetup
                ? 'Create Admin Account'
                : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            Storage: {status.databaseMode === 'mysql' ? 'MySQL 8.0' : 'Local Relational Store'}
          </span>
          <span>128-D Biometric Engine</span>
        </div>
      </div>
    </div>
  );
}
