// ============================================================
//  CHANGE PASSWORD
//  Shown right after a freshly-created user logs in with their
//  temporary password (mustChangePassword = true). Also reachable
//  any time a user wants to change their own password.
// ============================================================
import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../context/auth';

export default function ChangePassword({ firstLogin = false }: { firstLogin?: boolean }) {
  const { changePassword, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
    <div style={S.wrap}>
      <form onSubmit={onSubmit} style={S.card}>
        <div style={S.icon}><KeyRound size={22} color="#fff" /></div>
        <h2 style={S.title}>{firstLogin ? 'Set your password' : 'Change password'}</h2>
        {firstLogin && (
          <p style={S.sub}>
            Welcome! For security, please replace the temporary password you were emailed.
          </p>
        )}

        <label style={S.label}>{firstLogin ? 'Temporary password' : 'Current password'}</label>
        <input style={S.input} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus />

        <label style={S.label}>New password</label>
        <input style={S.input} type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 8 characters" required />

        <label style={S.label}>Confirm new password</label>
        <input style={S.input} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />

        {error && <div style={S.error}>{error}</div>}

        <button style={{ ...S.btn, opacity: busy ? 0.7 : 1 }} disabled={busy} type="submit">
          {busy ? 'Saving…' : 'Save password'}
        </button>

        <button type="button" onClick={logout} style={S.link}>Sign out</button>
      </form>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg, #f4f6fb)', padding: 20 },
  card: {
    width: '100%', maxWidth: 400, background: 'var(--surface, #fff)', borderRadius: 16,
    padding: 28, boxShadow: '0 10px 40px rgba(0,0,0,.08)', border: '1px solid var(--border, #e5e7eb)',
    display: 'flex', flexDirection: 'column',
  },
  icon: { width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#3b5bfd,#6d83ff)', display: 'grid', placeItems: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: 800, marginBottom: 4 },
  sub: { fontSize: 13, color: '#6b7280', marginBottom: 18, lineHeight: 1.5 },
  label: { fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 6, marginTop: 6 },
  input: { border: '1px solid #d1d5db', borderRadius: 10, padding: '10px 12px', fontSize: 14, marginBottom: 10, outline: 'none', background: '#fff' },
  btn: { background: 'var(--brand, #3b5bfd)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 14px', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 8 },
  link: { background: 'none', border: 'none', color: '#6b7280', fontSize: 13, marginTop: 14, cursor: 'pointer' },
  error: { background: '#fdeaea', color: '#b91c1c', borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 12 },
};
