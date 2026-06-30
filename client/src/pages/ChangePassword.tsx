// ============================================================
//  CHANGE PASSWORD  —  EKC re-skin (Tailwind + theme tokens)
//  Shown right after a freshly-created user logs in with their
//  temporary password (mustChangePassword = true). Also reachable
//  any time a user wants to change their own password.
//  Visual layer only — all auth hooks, state, validation, error
//  handling and redirect behaviour are unchanged from the original.
// ============================================================
import { useState } from 'react';
import { KeyRound, Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/auth';

export default function ChangePassword({ firstLogin = false }: { firstLogin?: boolean }) {
  const { changePassword, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (next.length < 8) return setError('New password must be at least 8 characters.');
    if (next !== confirm) return setError('New passwords do not match.');
    setBusy(true);
    try {
      await changePassword(current, next);
      // on success the App gate re-renders into the dashboard
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not change password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-base px-5">
      <form onSubmit={onSubmit} className="panel w-full max-w-[400px] p-7 flex flex-col">
        {/* brand */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent grid place-items-center shrink-0">
            <KeyRound size={20} className="text-white" />
          </div>
          <div>
            <div className="font-bold text-primary leading-tight">JCI SmartFactory</div>
            <div className="text-xs text-steel">Account security</div>
          </div>
        </div>

        <h2 className="text-lg font-bold text-primary mb-1">
          {firstLogin ? 'Set your password' : 'Change password'}
        </h2>
        {firstLogin && (
          <p className="text-sm text-steel mb-5 leading-relaxed">
            Welcome! For security, please replace the temporary password you were emailed.
          </p>
        )}
        {!firstLogin && <div className="mb-5" />}

        <label className="label mb-1.5">{firstLogin ? 'Temporary password' : 'Current password'}</label>
        <div className="relative mb-4">
          <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel/60 pointer-events-none" />
          <input
            className="input pl-9 pr-10"
            type={show ? 'text' : 'password'}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Hide passwords' : 'Show passwords'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-steel/60 hover:text-primary transition-colors"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <label className="label mb-1.5">New password</label>
        <div className="relative mb-1.5">
          <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel/60 pointer-events-none" />
          <input
            className="input pl-9 pr-10"
            type={show ? 'text' : 'password'}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="At least 8 characters"
            required
          />
        </div>
        <p className="text-xs text-steel mb-4">Use at least 8 characters.</p>

        <label className="label mb-1.5">Confirm new password</label>
        <div className="relative mb-4">
          <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel/60 pointer-events-none" />
          <input
            className="input pl-9 pr-10"
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>

        {error && (
          <div className="rounded-lg border border-stopped/30 bg-stopped/10 text-stopped px-3.5 py-2.5 text-sm flex items-center gap-2 mb-4">
            <AlertTriangle size={15} className="shrink-0" />
            {error}
          </div>
        )}

        <button
          className="w-full bg-accent text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
          disabled={busy}
          type="submit"
        >
          {busy ? 'Saving…' : 'Save password'}
        </button>

        <button
          type="button"
          onClick={logout}
          className="text-sm text-steel hover:text-primary transition-colors mt-4 mx-auto"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
