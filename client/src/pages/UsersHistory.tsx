// ============================================================
//  USERS HISTORY MODAL  —  archive of deleted login accounts
//  Opens as a popup from User Management (no page navigation).
//  Blurred + dimmed backdrop. Paginated (10/page), searchable,
//  filterable. Each row expands to the full snapshot: id, previous
//  role + permissions, department, status, who/when/why deleted,
//  and the activity log.
//  EKC re-skin — visual layer only, logic unchanged.
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import {
  Archive, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  X, Clock, Trash2, RefreshCw,
} from 'lucide-react';
import { api } from '../api/client';
import { cn } from '../lib/utils';
import { ROLE_LABELS } from '../config/nav';
import type { Role } from '@shared/types';

interface Activity { ts: string; action: string; by: string; detail: string }
interface HistoryRow {
  _id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  permissions: Record<string, string[]>;
  assignedLines: string[];
  assignedMachineIds: string[];
  accountStatus: string;
  deletionType: 'temporary' | 'permanent';
  reason: string;
  deletedByName: string;
  deletedByEmail: string;
  deletedAt: string;
  suspendedUntil: string | null;
  accountCreatedAt: string | null;
  lastLoginAt: string | null;
  activity: Activity[];
}
interface HistoryResp { rows: HistoryRow[]; total: number; page: number; pages: number; limit: number }

const LIMIT = 10;
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : '—');
// unified account-status pill — active=running · suspended=stopped · disabled=steel
const STATUS_BADGE: Record<string, string> = {
  active: 'bg-running/10 text-running',
  suspended: 'bg-stopped/10 text-stopped',
  disabled: 'bg-steel/10 text-steel',
};

export default function UsersHistoryModal({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<'' | 'temporary' | 'permanent'>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<HistoryResp>({ rows: [], total: 0, page: 1, pages: 1, limit: LIMIT });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<HistoryResp>('/api/users/history', {
        params: { page, limit: LIMIT, q: q.trim(), type },
      });
      setData(data);
    } catch {
      setData({ rows: [], total: 0, page: 1, pages: 1, limit: LIMIT });
    } finally {
      setLoading(false);
    }
  }, [page, q, type]);

  // debounce search/filter; immediate on page change
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // reset to page 1 when the query/filter changes
  useEffect(() => { setPage(1); }, [q, type]);

  // close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pageNumbers = buildPageWindow(data.page, data.pages);

  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center p-5 bg-[rgba(15,23,42,.55)] backdrop-blur-sm" onClick={onClose}>
      <div className="panel relative w-full max-w-[1080px] max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0"><Archive size={18} className="text-accent" /></span>
            <div>
              <div className="text-lg font-extrabold text-primary leading-tight">Users History</div>
              <div className="text-[12.5px] text-steel">Archive of deleted accounts ({data.total})</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="bg-base border border-line rounded-lg p-2 grid place-items-center text-steel hover:text-primary transition-colors" title="Refresh"><RefreshCw size={16} /></button>
            <button onClick={onClose} className="bg-base border border-line rounded-lg p-2 grid place-items-center text-steel hover:text-primary transition-colors" title="Close" aria-label="Close"><X size={18} /></button>
          </div>
        </div>

        {/* search + filter */}
        <div className="flex gap-3 px-5 py-3.5 border-b border-line flex-wrap items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel/60 pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, email, role, reason, or who deleted…"
              autoFocus
              className="input pl-9"
            />
          </div>
          <select value={type} onChange={(e) => setType(e.target.value as any)} className="input min-w-[170px]">
            <option value="">All deletion types</option>
            <option value="temporary">Temporary only</option>
            <option value="permanent">Permanent only</option>
          </select>
        </div>

        {/* scrollable body: table */}
        <div className="overflow-auto flex-1">
          <table className="tbl [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-[1]">
            <thead>
              <tr>
                {['', 'Name', 'Email', 'Previous role', 'Status', 'Type', 'Deleted at', 'Deleted by'].map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-8 text-steel">Loading…</td></tr>
              ) : data.rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-steel">No deleted users found.</td></tr>
              ) : data.rows.map((r) => (
                <RowItem key={r._id} r={r} open={expanded === r._id} onToggle={() => setExpanded(expanded === r._id ? null : r._id)} />
              ))}
            </tbody>
          </table>
        </div>

        {/* pagination footer */}
        <div className="flex justify-between items-center gap-3 px-4.5 py-3.5 border-t border-line flex-wrap">
          <div className="text-[13px] text-steel">
            {data.total === 0 ? 'No records' : `Page ${data.page} of ${data.pages} · ${data.total} records`}
          </div>
          {data.pages > 1 && (
            <div className="flex gap-1.5 items-center">
              <button disabled={data.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className={pageBtn(data.page <= 1)}>
                <ChevronLeft size={15} /> Prev
              </button>
              {pageNumbers.map((n, i) =>
                n === '…' ? (
                  <span key={`e${i}`} className="px-1 text-steel/50">…</span>
                ) : (
                  <button key={n} onClick={() => setPage(n as number)} className={pageNumBtn(n === data.page)}>{n}</button>
                )
              )}
              <button disabled={data.page >= data.pages} onClick={() => setPage((p) => Math.min(data.pages, p + 1))} className={pageBtn(data.page >= data.pages)}>
                Next <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RowItem({ r, open, onToggle }: { r: HistoryRow; open: boolean; onToggle: () => void }) {
  const isPerm = r.deletionType === 'permanent';
  return (
    <>
      <tr className={cn('cursor-pointer', open && 'bg-raised')} onClick={onToggle}>
        <td className="w-9 text-steel">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
        <td className="font-bold">{r.name}</td>
        <td>{r.email}</td>
        <td>{ROLE_LABELS[r.role] ?? r.role}</td>
        <td><StatusBadge status={r.accountStatus} /></td>
        <td>
          <span className={cn('pill whitespace-nowrap', isPerm ? 'bg-stopped/10 text-stopped' : 'bg-idle/10 text-idle')}>
            {isPerm ? <Trash2 size={12} /> : <Clock size={12} />} {isPerm ? 'Permanent' : 'Temporary'}
          </span>
        </td>
        <td className="whitespace-nowrap">{fmt(r.deletedAt)}</td>
        <td>{r.deletedByName || r.deletedByEmail || '—'}</td>
      </tr>

      {open && (
        <tr className="bg-raised">
          <td colSpan={8} className="!pt-1 !pb-5 px-5">
            <div className="grid [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))] gap-x-6 gap-y-3 bg-base border border-line rounded-xl p-4">
              <Detail label="Employee ID" value={r.userId} mono />
              <Detail label="Department / Lines" value={r.assignedLines.length ? r.assignedLines.join(', ') : '—'} />
              <Detail label="Designation (role)" value={ROLE_LABELS[r.role] ?? r.role} />
              <Detail label="Account status at deletion" value={r.accountStatus} />
              <Detail label="Assigned machines" value={r.assignedMachineIds.length ? r.assignedMachineIds.join(', ') : '—'} />
              <Detail label="Account created" value={fmt(r.accountCreatedAt)} />
              <Detail label="Last login" value={fmt(r.lastLoginAt)} />
              {r.deletionType === 'temporary' && <Detail label="Suspended until" value={fmt(r.suspendedUntil)} />}
              <Detail label="Deleted by" value={`${r.deletedByName || '—'}${r.deletedByEmail ? ` (${r.deletedByEmail})` : ''}`} />
              <Detail label="Reason" value={r.reason || '—'} wide />
            </div>

            {/* previous permissions */}
            <div className="mt-3.5">
              <div className="label font-bold mb-2">Previous permissions</div>
              {r.permissions && Object.keys(r.permissions).length ? (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(r.permissions).map(([mod, acts]) => (
                    <div key={mod} className="card px-2.5 py-1.5 text-[12.5px] text-primary">
                      <b className="capitalize">{mod}</b>: {(acts as string[]).join(', ') || '—'}
                    </div>
                  ))}
                </div>
              ) : <div className="text-[13px] text-steel">No permission snapshot.</div>}
            </div>

            {/* activity log */}
            <div className="mt-3.5">
              <div className="label font-bold mb-2">Activity log</div>
              <div className="flex flex-col gap-1.5">
                {r.activity?.length ? r.activity.map((a, i) => (
                  <div key={i} className="flex gap-2.5 text-[13px] items-baseline flex-wrap">
                    <span className="text-steel min-w-[150px] tabular-nums">{fmt(a.ts)}</span>
                    <span className="pill bg-accent/10 text-accent">{a.action}</span>
                    <span className="text-primary">{a.detail}{a.by ? ` · by ${a.by}` : ''}</span>
                  </div>
                )) : <div className="text-[13px] text-steel">No activity recorded.</div>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Detail({ label, value, mono, wide }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-full' : undefined}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-steel mb-0.5">{label}</div>
      <div className={cn('text-[13.5px] text-primary break-words', mono && 'data')}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={cn('pill capitalize', STATUS_BADGE[status] || STATUS_BADGE.disabled)}>{status}</span>;
}

// page-number window with ellipses, e.g. [1, …, 4,5,6, …, 12]
function buildPageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push('…');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push('…');
  out.push(total);
  return out;
}

function pageBtn(disabled: boolean) {
  return cn(
    'inline-flex items-center gap-1 bg-base border border-line rounded-lg px-2.5 py-1.5 text-[13px] font-bold transition-colors',
    disabled ? 'opacity-50 cursor-not-allowed text-steel' : 'text-primary hover:border-accent/40'
  );
}
function pageNumBtn(active: boolean) {
  return cn(
    'min-w-[34px] text-center rounded-lg px-2.5 py-1.5 text-[13px] font-bold border transition-colors',
    active ? 'bg-accent border-accent text-white' : 'bg-base border-line text-primary hover:border-accent/40'
  );
}
