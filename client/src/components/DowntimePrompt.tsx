// ════════════════════════════════════════════════════════════════
//  📁 FILE PATH : smartfactory/client/src/components/DowntimePrompt.tsx
//  ⚙️  ACTION    : NEW FILE — create at this exact path
// ════════════════════════════════════════════════════════════════

// ============================================================
//  DOWNTIME REASON PROMPT  —  the auto-popup
//
//  When a machine has been stopped/idle for 2+ minutes the server
//  raises a prompt; this modal appears AUTOMATICALLY on the
//  operator's screen (whatever page they're on) and blocks until
//  they pick the reason(s):
//
//    • opens on the 'downtime:prompt' socket push
//    • re-opens after a refresh (GET /pending on load + 30s poll)
//    • closes itself on 'downtime:prompt:clear' (machine running
//      again, resolved by a manager, or answered on another tab)
//    • checkbox reasons (shared list) + "Other" with required text
//    • no ✕ / no Cancel — the reason must be submitted; the
//      supervisor is notified the moment it is, then the report
//      escalates up the org chain every 10 min until acknowledged
//
//  Mounted once in the app Shell; renders nothing for roles that
//  can't report downtime.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { api, getSocket } from '../api/client';
import { useAuth } from '../context/auth';
import { useToast } from './Toast';
import { can } from '@shared/permissions';
import { DOWNTIME_REASONS, OTHER_REASON } from '@shared/downtimeReasons';
import { cn } from '../lib/utils';

interface PendingReport {
  _id: string;
  machineId: string;
  machineCode: string;
  department: string;
  status: string;
  startedAt: string | null;
  promptedAt: string | null;
}

const POLL_MS = 30000; // safety net if the socket is quiet

// live "Stopped for 4m 32s" ticker
function useElapsed(iso: string | null): string {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return '—';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function DowntimePrompt() {
  const { user, role } = useAuth();
  const toast = useToast();
  const [queue, setQueue] = useState<PendingReport[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [otherText, setOtherText] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const canReport = can(role, 'reportDowntime');
  const current = queue[0] || null;

  const load = useCallback(async () => {
    if (!canReport) return;
    try {
      const { data } = await api.get<{ reports: PendingReport[] }>('/api/downtime-reports/pending');
      setQueue((prev) => {
        const next = data.reports || [];
        // a NEW machine appeared at the front → reset the form for it
        if (next[0]?._id !== prev[0]?._id) { setSelected(new Set()); setOtherText(''); setNote(''); }
        return next;
      });
    } catch { /* transient — the poll retries */ }
  }, [canReport]);

  // load on login + socket pushes + steady poll fallback
  useEffect(() => {
    if (!canReport || !user) return;
    load();
    const socket = getSocket();
    const onPrompt = () => load();
    const onClear = (p: { reportId?: string }) => {
      setQueue((q) => q.filter((r) => r._id !== p?.reportId));
      load();
    };
    socket.on('downtime:prompt', onPrompt);
    socket.on('downtime:prompt:clear', onClear);
    const poll = setInterval(load, POLL_MS);
    return () => {
      socket.off('downtime:prompt', onPrompt);
      socket.off('downtime:prompt:clear', onClear);
      clearInterval(poll);
    };
  }, [canReport, user, load]);

  const elapsed = useElapsed(current?.startedAt ?? null);

  const canSubmit = useMemo(() => {
    if (selected.size === 0) return false;
    if (selected.has(OTHER_REASON) && !otherText.trim()) return false;
    return true;
  }, [selected, otherText]);

  function toggle(r: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }

  async function submit() {
    if (!current || !canSubmit || saving) return;
    setSaving(true);
    try {
      await api.post(`/api/downtime-reports/${current._id}/reason`, {
        reasons: [...selected],
        otherText: otherText.trim(),
        note: note.trim(),
      });
      toast.success(`Reason submitted for ${current.machineCode} — your supervisor has been notified`);
      setQueue((q) => q.slice(1));
      setSelected(new Set()); setOtherText(''); setNote('');
    } catch (e) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to submit reason');
    } finally {
      setSaving(false);
    }
  }

  if (!canReport || !current) return null;

  return (
    <div className="fixed inset-0 z-[1200] grid place-items-center p-5 bg-[rgba(15,23,42,.62)] backdrop-blur-sm">
      <div className="panel relative w-full max-w-[560px] p-6 border-2 border-stopped/60 shadow-2xl">
        {/* header */}
        <div className="flex items-start gap-3 mb-1">
          <span className="mt-0.5 grid place-items-center w-9 h-9 rounded-full bg-stopped/10 text-stopped shrink-0">
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-primary leading-tight">
              Why is <span className="data">{current.machineCode}</span> {current.status === 'idle' ? 'idle' : 'stopped'}?
            </h2>
            <div className="text-[13px] text-steel mt-0.5">
              {current.department || '—'} · <Clock size={12} className="inline -mt-0.5" />{' '}
              <span className="data text-stopped font-bold">{elapsed}</span> without production
              {queue.length > 1 && <span className="ml-2 text-[11px] font-bold bg-base border border-line rounded px-1.5 py-0.5">machine 1 of {queue.length}</span>}
            </div>
          </div>
        </div>
        <div className="text-[12.5px] text-steel mb-4 mt-2">
          Select every reason that applies. Your supervisor is notified as soon as you submit —
          and the report escalates up the management chain until it is acknowledged.
        </div>

        {/* checkbox grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          {[...DOWNTIME_REASONS, OTHER_REASON].map((r) => {
            const on = selected.has(r);
            return (
              <label
                key={r}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer select-none text-[13px] font-semibold transition-colors',
                  on ? 'border-accent bg-accent/10 text-primary' : 'border-line bg-base text-steel hover:text-primary hover:border-steel/40'
                )}
              >
                <input type="checkbox" className="accent-[rgb(var(--c-accent))] w-4 h-4 shrink-0" checked={on} onChange={() => toggle(r)} />
                {r}
              </label>
            );
          })}
        </div>

        {/* Other → required description */}
        {selected.has(OTHER_REASON) && (
          <div className="mb-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-steel mb-1">Describe the other reason *</div>
            <textarea
              className="w-full bg-base border border-line rounded-lg px-3 py-2.5 text-[13px] text-primary min-h-[64px] resize-y outline-none focus:border-accent"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              placeholder="What exactly happened?"
              autoFocus
            />
          </div>
        )}

        {/* optional note */}
        <div className="mb-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-steel mb-1">Note for your supervisor (optional)</div>
          <input
            className="w-full bg-base border border-line rounded-lg px-3 py-2.5 text-[13px] text-primary outline-none focus:border-accent"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Any extra detail…"
          />
        </div>

        <button
          onClick={submit}
          disabled={!canSubmit || saving}
          className="w-full bg-stopped text-white rounded-lg px-4 py-3 font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Submitting…' : selected.size ? `Submit ${selected.size} reason${selected.size > 1 ? 's' : ''} → notify supervisor` : 'Select at least one reason'}
        </button>
        <div className="text-center text-[11px] text-steel mt-2">
          This prompt closes automatically if the machine starts running again.
        </div>
      </div>
    </div>
  );
}