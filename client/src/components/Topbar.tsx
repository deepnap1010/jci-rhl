// client/src/components/Topbar.tsx
// ============================================================
//  TOPBAR  —  page title + live/stale status + clock +
//             health alerts + logged-in user + sign out
//
//  The role is no longer switchable here — it reflects WHO is
//  actually logged in (from the JWT). Sign out clears the token.
// ============================================================
import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/auth';
import { ROLE_LABELS } from '../config/nav';
import { useMachines, liveSummary, fmtLastSeen, fmtAgo } from '../hooks/useData';
import NotificationBell from './NotificationBell';

export default function Topbar({ title }: { title: string }) {
  const { user, role, logout } = useAuth();
  const { machines } = useMachines();
  const { live, lastUpdated } = liveSummary(machines);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const displayName = user?.name || (role ? ROLE_LABELS[role] : 'User');
  const roleLabel = role ? ROLE_LABELS[role] : '';
  const initials = displayName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <header style={S.bar}>
      <h1 style={S.title}>{title}</h1>

      <div style={S.right}>
        {live ? (
          <span style={S.livePill}><span style={S.liveDot} /> Live</span>
        ) : (
          <span style={S.stalePill} title={`Last updated ${fmtLastSeen(lastUpdated)}`}>
            <span style={S.staleDot} /> {fmtAgo(lastUpdated)}
          </span>
        )}
        <div style={S.clock} className="mono">
          {now.toLocaleTimeString('en-US', { hour12: true })}
        </div>

        {/* role-scoped health alerts */}
        <NotificationBell />

        {/* logged-in user */}
        <div style={S.user} className="topbar-username">
          <div style={S.avatar}>{initials}</div>
          <div>
            <div style={S.userName}>{displayName}</div>
            <div style={S.userSub}>{roleLabel}</div>
          </div>
        </div>

        <button onClick={logout} style={S.logout} title="Sign out">
          <LogOut size={16} /> <span>Sign out</span>
        </button>
      </div>
    </header>
  );
}

const S: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 28px', position: 'sticky', top: 0, zIndex: 10,
    background: 'rgba(244,246,251,.85)', backdropFilter: 'blur(8px)',
  },
  title: { fontSize: 22, fontWeight: 800, color: 'var(--text)' },
  right: { display: 'flex', alignItems: 'center', gap: 16 },
  livePill: { display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', background: '#e8f7ee', color: 'var(--running)', borderRadius: 99, padding: '4px 10px', fontSize: 12, fontWeight: 700 },
  liveDot: { width: 7, height: 7, borderRadius: '50%', background: 'var(--running)', boxShadow: '0 0 0 3px rgba(22,163,74,.2)' },
  stalePill: { display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', background: '#fef5e7', color: '#b45309', borderRadius: 99, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'default' },
  staleDot: { width: 7, height: 7, borderRadius: '50%', background: 'var(--idle)' },
  clock: { fontSize: 13, color: 'var(--text-muted)', minWidth: 92, textAlign: 'right' },
  user: {
    display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 16,
    borderLeft: '1px solid var(--border)',
  },
  avatar: {
    width: 34, height: 34, borderRadius: '50%',
    background: 'linear-gradient(135deg,#3b5bfd,#6d83ff)', color: '#fff',
    display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700,
  },
  userName: { fontSize: 13, fontWeight: 700, color: 'var(--text)' },
  userSub: { fontSize: 11, color: 'var(--text-faint)' },
  logout: {
    display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)',
    border: '1px solid var(--border)', borderRadius: 10, padding: '7px 12px',
    fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer',
  },
};
