// ============================================================
//  NOTIFICATIONS  —  personal inbox + history
//  Unread items appear in the topbar bell; once read they leave the
//  bell and live here permanently. Filter by All / Unread / Read,
//  search, and click through to the related machine or task.
// ============================================================
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, Search, CheckCheck } from 'lucide-react';
import { api } from '../api/client';
import type { NotificationItem } from '../hooks/useData';
import { cn } from '../lib/utils';

type Scope = 'all' | 'unread' | 'read';
const PAGE = 20;

const fmtFull = (iso: string) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
function ago(iso: string): string {
  if (!iso) return '';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
const dot = (sev: string) => (sev === 'critical' ? 'bg-stopped' : sev === 'warning' ? 'bg-idle' : 'bg-accent');

export default function Notifications() {
  const nav = useNavigate();
  const [scope, setScope] = useState<Scope>('all');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: String(PAGE) });
      if (scope !== 'all') p.set('scope', scope);
      const { data } = await api.get<{ items: NotificationItem[]; unread: number; total: number; pages: number }>(`/api/notifications?${p.toString()}`);
      setItems(data.items || []); setUnread(data.unread || 0); setTotal(data.total || 0); setPages(data.pages || 1);
    } catch { setItems([]); } finally { setLoading(false); }
  }, [page, scope]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (s: Scope) => { setScope(s); setPage(1); };

  // search filters within the loaded page
  const shown = q.trim()
    ? items.filter((n) => `${n.title} ${n.body} ${n.machineCode} ${n.jobNumber} ${n.orderNumber}`.toLowerCase().includes(q.trim().toLowerCase()))
    : items;

  async function markRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    try { await api.post(`/api/notifications/${id}/read`); } catch { load(); }
  }
  async function markAll() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try { await api.post('/api/notifications/read-all'); } finally { load(); }
  }
  function open(n: NotificationItem) {
    if (!n.read) markRead(n.id);
    if (n.refType === 'task' || n.type === 'taskAssigned' || n.type === 'taskDone') { nav('/jobs?tab=tasks'); return; }
    const code = n.machineCode || n.machineId;
    if (code) nav(`/machines?focus=${encodeURIComponent(code)}`);
  }

  const TABS: { key: Scope; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: `Unread${unread ? ` (${unread})` : ''}` },
    { key: 'read', label: 'Read' },
  ];

  return (
    <div className="px-5 sm:px-7 pt-1 pb-10 space-y-4">
      {/* filter bar */}
      <div className="panel px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-line overflow-hidden">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={cn('px-3.5 py-1.5 text-sm font-semibold transition-colors', scope === t.key ? 'bg-accent text-white' : 'bg-surface text-steel hover:text-primary')}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel/60 pointer-events-none" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notifications…" className="input pl-9" />
        </div>
        <button onClick={markAll} disabled={unread === 0}
          className="inline-flex items-center gap-1.5 bg-surface border border-line rounded-lg px-3 py-2 text-sm font-semibold text-primary hover:border-accent/40 transition-colors disabled:opacity-50">
          <CheckCheck size={15} /> Mark all read
        </button>
      </div>

      {/* list */}
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <span className="flex items-center gap-2 text-sm font-extrabold text-primary"><Inbox size={16} /> {total} notification{total === 1 ? '' : 's'}</span>
          <span className="text-xs text-steel">{unread} unread</span>
        </div>
        {loading ? (
          <div className="px-4 py-12 text-center text-steel text-sm">Loading…</div>
        ) : shown.length === 0 ? (
          <div className="px-4 py-14 text-center text-steel text-sm">
            {q ? 'No notifications match your search.' : scope === 'unread' ? '✓ You’re all caught up — no unread notifications.' : 'No notifications yet.'}
          </div>
        ) : (
          shown.map((n) => (
            <button key={n.id} onClick={() => open(n)}
              className={cn('flex items-start gap-3 w-full text-left px-4 py-3 border-b border-line hover:bg-raised transition-colors', !n.read && 'bg-accent/5')}>
              <span className={cn('w-2 h-2 rounded-full mt-1.5 flex-none', n.read ? 'bg-line' : dot(n.severity))} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between gap-2">
                  <span className={cn('text-[13px] truncate', n.read ? 'font-semibold text-primary/80' : 'font-bold text-primary')}>{n.title}</span>
                  <span className="data text-[11px] text-steel/70 whitespace-nowrap" title={fmtFull(n.ts)}>{ago(n.ts)}</span>
                </div>
                <div className="text-xs text-steel mt-0.5">{n.body}</div>
                <div className="flex items-center gap-2 mt-1 text-[10.5px] text-steel/70 flex-wrap">
                  {n.machineCode && <span className="pill bg-raised">{n.machineCode}</span>}
                  {n.jobNumber && <span className="pill bg-raised">{n.jobNumber}</span>}
                  <span>{fmtFull(n.ts)}</span>
                  {!n.read && (
                    <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); markRead(n.id); }}
                      className="ml-auto text-accent font-bold cursor-pointer hover:underline">Mark read</span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* pagination (hidden while searching, since search filters the loaded page only) */}
      {pages > 1 && !q && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-steel">Page <b className="text-primary">{page}</b> of <b className="text-primary">{pages}</b></span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="min-w-16 h-8 px-3 rounded-lg text-[13px] font-bold border border-line bg-base text-accent disabled:opacity-50 disabled:cursor-not-allowed">‹ Prev</button>
            <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}
              className="min-w-16 h-8 px-3 rounded-lg text-[13px] font-bold border border-line bg-base text-accent disabled:opacity-50 disabled:cursor-not-allowed">Next ›</button>
          </div>
        </div>
      )}
    </div>
  );
}
