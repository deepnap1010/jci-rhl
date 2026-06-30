// ============================================================
//  NOTIFICATION BELL  —  topbar dropdown  (EKC re-skin)
//  Two sections:
//   1. Your tasks    — personal job assignments (operator /
//                      supervisor), persisted + real-time.
//   2. Machine alerts — role-scoped health (offline, suspect
//                      data, downtime, behind-target…).
//  Click a task to mark it read and jump to the machine / jobs.
//  Visual layer only — all data hooks, the unread-count +
//  acknowledge logic, navigation and handlers are unchanged.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ClipboardList } from 'lucide-react';
import { useAlerts, useNotifications } from '../hooks/useData';
import type { AlertItem, AlertSeverity, NotificationItem } from '../hooks/useData';
import { api } from '../api/client';
import { useToast } from './Toast';
import { cn } from '../lib/utils';

// severity → EKC status tokens (text + tint + dot colour classes)
export const SEV: Record<AlertSeverity, { text: string; bg: string; label: string; dot: string }> = {
  critical: { text: 'text-stopped', bg: 'bg-stopped/10', label: 'Critical', dot: 'bg-stopped' },
  warning: { text: 'text-idle', bg: 'bg-idle/10', label: 'Warning', dot: 'bg-idle' },
  info: { text: 'text-accent', bg: 'bg-accent/10', label: 'Info', dot: 'bg-accent' },
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
  const { data, reload: reloadAlerts } = useAlerts();
  const { items: tasks, unread, markRead, markAllRead, reload } = useNotifications();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // optimistically-acknowledged alert ids
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Acknowledging archives the alert into the Notification history + drops the badge. We hide
  // it optimistically (instant), then the server confirms; on failure we revert + surface why.
  const alerts = data.alerts.filter((a) => !hidden.has(a.id));
  const counts = {
    critical: alerts.filter((a) => a.severity === 'critical').length,
    warning: alerts.filter((a) => a.severity === 'warning').length,
    info: alerts.filter((a) => a.severity === 'info').length,
    total: alerts.length,
  };
  const ackErr = (e: unknown) => {
    const err = e as { response?: { status?: number; data?: { error?: string } } };
    const st = err?.response?.status;
    toast.error(st ? `Acknowledge failed (HTTP ${st})${err.response?.data?.error ? ' — ' + err.response.data.error : ''}` : 'Acknowledge failed — no response from the API server.');
  };
  const ackOne = async (a: AlertItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setHidden((s) => new Set(s).add(a.id));
    try {
      await api.post('/api/alerts/acknowledge', { id: a.id, severity: a.severity, machineId: a.machineId, machineCode: a.machineCode, title: a.title, detail: a.detail });
      reloadAlerts();
    } catch (e2) {
      setHidden((s) => { const n = new Set(s); n.delete(a.id); return n; });
      ackErr(e2);
    }
  };
  const ackAll = async () => {
    const ids = alerts.map((a) => a.id);
    setHidden((s) => { const n = new Set(s); ids.forEach((id) => n.add(id)); return n; });
    try { await api.post('/api/alerts/acknowledge-all'); reloadAlerts(); }
    catch (e2) {
      setHidden((s) => { const n = new Set(s); ids.forEach((id) => n.delete(id)); return n; });
      ackErr(e2);
    }
  };

  // the bell shows only UNREAD tasks; once read they leave the bell and live in the
  // Notifications history page (linked at the bottom).
  const unreadTasks = tasks.filter((n) => !n.read);
  const badge = unread + counts.total;
  // badge tint priority: unread → accent, else critical → stopped, else warning → idle, else accent
  const badgeBg = unread > 0 ? 'bg-accent' : counts.critical > 0 ? 'bg-stopped' : counts.warning > 0 ? 'bg-idle' : 'bg-accent';
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
    n.severity === 'critical' ? 'bg-stopped' : n.severity === 'warning' ? 'bg-idle' : 'bg-accent';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative grid place-items-center w-9 h-9 rounded-lg text-steel hover:text-primary transition-colors"
      >
        <Bell size={18} className={shake ? 'bell-shake' : ''} />
        {badge > 0 && (
          <span className={cn('absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold grid place-items-center', badgeBg)}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>

      {open && (
        <div className="panel absolute right-0 mt-2 w-[360px] max-h-[460px] overflow-auto z-[1000] shadow-panel">
          {/* ── Your tasks ── */}
          <div className="flex items-center justify-between px-3.5 py-3 border-b border-line">
            <span className="flex items-center gap-1.5 text-sm font-extrabold text-primary">
              <ClipboardList size={15} /> Your tasks
            </span>
            {unread > 0 ? (
              <button onClick={markAllRead} className="text-accent text-xs font-bold hover:underline">Mark all read</button>
            ) : (
              <span className="text-xs text-steel">{tasks.length ? 'All read' : 'None'}</span>
            )}
          </div>
          <div className="max-h-[230px] overflow-y-auto">
            {unreadTasks.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-steel">{tasks.length ? '✓ No new notifications.' : 'No tasks assigned to you yet.'}</div>
            ) : (
              unreadTasks.map((n) => (
                <button
                  key={n.id}
                  onClick={() => goTask(n)}
                  className={cn('flex items-start gap-2.5 w-full text-left px-3.5 py-2.5 border-b border-line hover:bg-raised transition-colors', !n.read && 'bg-accent/5')}
                >
                  {!n.read
                    ? <span className={cn('w-2 h-2 rounded-full mt-1.5 flex-none', dotColor(n))} />
                    : <span className="w-2 flex-none" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2">
                      <span className="font-bold text-[13px] text-primary">{n.title}</span>
                      <span className="data text-[11px] text-steel/70 whitespace-nowrap">{ago(n.ts)}</span>
                    </div>
                    <div className="text-xs text-steel">{n.body}</div>
                    {n.actionType === 'acknowledge' && !n.read && (
                      <span onClick={(e) => acknowledge(n, e)} className="inline-block mt-1.5 bg-accent text-white rounded-lg px-2.5 py-1 text-xs font-bold">✓ Acknowledge</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* ── Machine alerts ── */}
          <div className="flex items-center justify-between px-3.5 py-3 border-b border-line border-t">
            <span className="flex items-center gap-2 text-sm font-extrabold text-primary">
              Machine alerts
              {counts.total > 0 && <button onClick={ackAll} className="text-accent text-xs font-bold hover:underline">Acknowledge all</button>}
            </span>
            <span className="text-xs text-steel">
              {counts.critical > 0 && <b className={SEV.critical.text}>{counts.critical} critical</b>}
              {counts.critical > 0 && (counts.warning > 0 || counts.info > 0) ? ' · ' : ''}
              {counts.warning > 0 && <span className={SEV.warning.text}>{counts.warning} warning</span>}
              {counts.warning > 0 && counts.info > 0 ? ' · ' : ''}
              {counts.info > 0 && <span className={SEV.info.text}>{counts.info} info</span>}
              {counts.total === 0 && 'All clear'}
            </span>
          </div>
          <div className="max-h-[260px] overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-steel">✓ No alerts — everything looks healthy.</div>
            ) : (
              alerts.map((a) => (
                <div key={a.id} className="flex items-start gap-2.5 px-3.5 py-2.5 border-b border-line hover:bg-raised transition-colors">
                  <span className={cn('w-2 h-2 rounded-full mt-1.5 flex-none', SEV[a.severity].dot)} />
                  <button onClick={() => goAlert(a)} className="flex-1 min-w-0 text-left border-none bg-transparent p-0 cursor-pointer">
                    <div className="flex justify-between gap-2">
                      <span className="font-bold text-[13px] text-primary">{a.title}</span>
                      <span className="data text-[11px] text-steel/70">{a.machineCode}</span>
                    </div>
                    <div className="text-xs text-steel overflow-hidden text-ellipsis whitespace-nowrap">
                      {a.detail} · {a.department}
                    </div>
                  </button>
                  <button
                    onClick={(e) => ackOne(a, e)}
                    title="Acknowledge"
                    className="flex-none grid place-items-center w-[26px] h-[26px] rounded-lg border border-line bg-surface text-running font-extrabold cursor-pointer self-center hover:border-accent/40 transition-colors"
                  >
                    ✓
                  </button>
                </div>
              ))
            )}
          </div>

          {/* footer — read notifications live in the history page */}
          <button
            onClick={() => { setOpen(false); navigate('/notifications'); }}
            className="w-full text-center px-3.5 py-3 text-accent text-xs font-bold hover:bg-raised border-t border-line transition-colors"
          >
            View notification history →
          </button>
        </div>
      )}
    </div>
  );
}
