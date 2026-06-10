// ============================================================
//  NOTIFICATION BELL  —  topbar dropdown
//  Two sections:
//   1. Your tasks    — personal job assignments (operator /
//                      supervisor), persisted + real-time.
//   2. Machine alerts — role-scoped health (offline, suspect
//                      data, downtime, behind-target…).
//  Click a task to mark it read and jump to the machine / jobs.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ClipboardList } from 'lucide-react';
import { useAlerts, useNotifications } from '../hooks/useData';
import type { AlertItem, AlertSeverity, NotificationItem } from '../hooks/useData';
import { api } from '../api/client';

export const SEV: Record<AlertSeverity, { color: string; bg: string; label: string; dot: string }> = {
  critical: { color: '#b42318', bg: '#fef0ef', label: 'Critical', dot: '#ef4444' },
  warning: { color: '#8a5d00', bg: '#fff7e6', label: 'Warning', dot: '#f59e0b' },
  info: { color: '#1453a8', bg: '#eef4fd', label: 'Info', dot: '#3b82f6' },
};

function ago(iso: string): string {
  if (!iso) return '';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationBell() {
  const { data } = useAlerts();
  const { items: tasks, unread, markRead, markAllRead, reload } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const { alerts, counts } = data;
  const badge = unread + counts.total;
  const badgeColor = unread > 0 ? '#3b5bfd' : counts.critical > 0 ? '#ef4444' : counts.warning > 0 ? '#f59e0b' : '#3b82f6';
  const shake = unread > 0 || counts.critical > 0;

  function goAlert(a: AlertItem) {
    setOpen(false);
    navigate(`/machines?focus=${encodeURIComponent(a.machineCode)}`);
  }

  function goTask(n: NotificationItem) {
    if (!n.read) markRead(n.id);
    setOpen(false);
    // task delegation → open the Tasks page; machine/job/idle → jump to that machine
    if (n.refType === 'task' || n.type === 'taskAssigned' || n.type === 'taskDone') {
      navigate('/jobs?tab=tasks');
      return;
    }
    const code = n.machineCode || n.machineId;
    if (code) navigate(`/machines?focus=${encodeURIComponent(code)}`);
  }

  async function acknowledge(n: NotificationItem, e: React.MouseEvent) {
    e.stopPropagation();
    if (n.refType === 'downtimeReport' && n.refId) {
      try { await api.post(`/api/downtime-reports/${n.refId}/acknowledge`); } catch { /* ignore */ }
    }
    markRead(n.id);
    reload();
  }

  const dotColor = (n: NotificationItem) =>
    n.severity === 'critical' ? '#ef4444' : n.severity === 'warning' ? '#f59e0b' : '#3b5bfd';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} aria-label="Notifications" style={S.bellBtn}>
        <Bell size={18} className={shake ? 'bell-shake' : ''} />
        {badge > 0 && (
          <span style={{ ...S.badge, background: badgeColor }}>{badge > 99 ? '99+' : badge}</span>
        )}
      </button>

      {open && (
        <div style={S.panel} className="card">
          {/* ── Your tasks ── */}
          <div style={S.head}>
            <span style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
              <ClipboardList size={15} /> Your tasks
            </span>
            {unread > 0 ? (
              <button onClick={markAllRead} style={S.linkBtn}>Mark all read</button>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tasks.length ? 'All read' : 'None'}</span>
            )}
          </div>
          <div style={{ maxHeight: 230, overflowY: 'auto' }}>
            {tasks.length === 0 ? (
              <div style={S.empty}>No tasks assigned to you yet.</div>
            ) : (
              tasks.map((n) => (
                <button key={n.id} onClick={() => goTask(n)} style={{ ...S.row, background: n.read ? 'none' : '#f5f8ff' }}>
                  {!n.read ? <span style={{ ...S.unreadDot, background: dotColor(n) }} /> : <span style={{ width: 8, flex: 'none' }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{n.title}</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{ago(n.ts)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'normal' }}>{n.body}</div>
                    {n.actionType === 'acknowledge' && !n.read && (
                      <span onClick={(e) => acknowledge(n, e)} style={S.ackBtn}>✓ Acknowledge</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* ── Machine alerts ── */}
          <div style={{ ...S.head, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 800, fontSize: 14 }}>Machine alerts</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {counts.critical > 0 && <b style={{ color: SEV.critical.color }}>{counts.critical} critical</b>}
              {counts.critical > 0 && (counts.warning > 0 || counts.info > 0) ? ' · ' : ''}
              {counts.warning > 0 && <span style={{ color: SEV.warning.color }}>{counts.warning} warning</span>}
              {counts.warning > 0 && counts.info > 0 ? ' · ' : ''}
              {counts.info > 0 && <span style={{ color: SEV.info.color }}>{counts.info} info</span>}
              {counts.total === 0 && 'All clear'}
            </span>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {alerts.length === 0 ? (
              <div style={S.empty}>✓ No alerts — everything looks healthy.</div>
            ) : (
              alerts.map((a) => (
                <button key={a.id} onClick={() => goAlert(a)} style={S.row}>
                  <span style={{ ...S.sevDot, background: SEV[a.severity].dot }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{a.title}</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{a.machineCode}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.detail} · {a.department}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  bellBtn: { position: 'relative', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 10, width: 38, height: 38, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--text-muted)' },
  badge: { position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 99, color: '#fff', fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center', boxShadow: '0 0 0 2px var(--surface)' },
  panel: { position: 'absolute', right: 0, top: 46, width: 380, maxWidth: '92vw', padding: 0, overflow: 'hidden', zIndex: 60, boxShadow: '0 16px 40px rgba(20,28,46,.18)' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--border)' },
  row: { display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderBottom: '1px solid var(--border)', background: 'none', cursor: 'pointer' },
  sevDot: { width: 8, height: 8, borderRadius: '50%', marginTop: 5, flex: 'none' },
  unreadDot: { width: 8, height: 8, borderRadius: '50%', background: '#3b5bfd', marginTop: 5, flex: 'none' },
  empty: { padding: '22px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 },
  linkBtn: { border: 'none', background: 'none', color: 'var(--brand)', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  ackBtn: { display: 'inline-block', marginTop: 7, background: 'var(--brand)', color: '#fff', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700 },
};
