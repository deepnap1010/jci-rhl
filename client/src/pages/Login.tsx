// ============================================================
//  LOGIN PAGE
//  Email + password → calls AuthContext.login. On success the
//  App gate decides where to go (change-password or dashboard).
// ============================================================
import { useState } from 'react';
import { Factory } from 'lucide-react';
import { useAuth } from '../context/auth';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
    <div style={S.wrap}>
      <form onSubmit={onSubmit} style={S.card}>
        <div style={S.brand}>
          <div style={S.logo}><Factory size={22} color="#fff" /></div>
          <div>
            <div style={S.brandName}>JCI SmartFactory</div>
            <div style={S.brandSub}>Production Monitor</div>
          </div>
        </div>

        <h2 style={S.title}>Sign in</h2>

        <label style={S.label}>Email</label>
        <input
          style={S.input}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          autoFocus
          required
        />

        <label style={S.label}>Password</label>
        <input
          style={S.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
        />

        {error && <div style={S.error}>{error}</div>}

        <button style={{ ...S.btn, opacity: busy ? 0.7 : 1 }} disabled={busy} type="submit">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <div style={S.hint}>
          New users receive a temporary password by email and set their own on first login.
        </div>
      </form>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg, #f4f6fb)', padding: 20 },
  card: {
    width: '100%', maxWidth: 380, background: 'var(--surface, #fff)', borderRadius: 16,
    padding: 28, boxShadow: '0 10px 40px rgba(0,0,0,.08)', border: '1px solid var(--border, #e5e7eb)',
    display: 'flex', flexDirection: 'column',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 },
  logo: { width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#3b5bfd,#6d83ff)', display: 'grid', placeItems: 'center' },
  brandName: { fontWeight: 800, fontSize: 16 },
  brandSub: { fontSize: 11, color: '#9ca3af' },
  title: { fontSize: 20, fontWeight: 800, margin: '6px 0 18px' },
  label: { fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 6 },
  input: {
    border: '1px solid #d1d5db', borderRadius: 10, padding: '10px 12px', fontSize: 14,
    marginBottom: 14, outline: 'none', background: '#fff',
  },
  btn: {
    background: 'var(--brand, #3b5bfd)', color: '#fff', border: 'none', borderRadius: 10,
    padding: '11px 14px', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4,
  },
  error: {
    background: '#fdeaea', color: '#b91c1c', borderRadius: 8, padding: '9px 12px',
    fontSize: 13, marginBottom: 12,
  },
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 16, textAlign: 'center', lineHeight: 1.5 },
};
