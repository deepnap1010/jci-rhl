// ============================================================
//  LOGIN PAGE  —  EKC re-skin (Tailwind + theme tokens)
//  Email + password → calls AuthContext.login. On success the
//  App gate decides where to go (change-password or dashboard).
//  Visual layer only — all auth hooks, state, validation, error
//  handling and redirect behaviour are unchanged from the original.
// ============================================================
import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/auth';
import { Logo } from '../components/Logo';
import { cn } from '../lib/utils';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      // navigation handled by the App gate once `user` is set
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Login failed. Check your email and password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-base px-5">
      <form onSubmit={onSubmit} className="panel w-full max-w-[400px] p-7 flex flex-col">
        {/* brand */}
        <div className="mb-6 flex justify-center">
          <Logo imgClassName="h-16 w-auto max-w-[240px] object-contain" />
        </div>

        <h2 className="text-lg font-bold text-primary mb-5">Sign in</h2>

        <label className="label mb-1.5">Email</label>
        <div className="relative mb-4">
          <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel/60 pointer-events-none" />
          <input
            className="input pl-9"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoFocus
            required
          />
        </div>

        <label className="label mb-1.5">Password</label>
        <div className="relative mb-4">
          <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel/60 pointer-events-none" />
          <input
            className="input pl-9 pr-10"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-steel/60 hover:text-primary transition-colors"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
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
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <div className={cn('text-xs text-steel mt-5 text-center leading-relaxed')}>
          New users receive a temporary password by email and set their own on first login.
        </div>
      </form>
    </div>
  );
}
