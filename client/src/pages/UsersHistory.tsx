// ============================================================
//  USERS HISTORY MODAL  —  archive of deleted login accounts
//  Opens as a popup from User Management (no page navigation).
//  Blurred + dimmed backdrop. Paginated (10/page), searchable,
//  filterable. Each row expands to the full snapshot: id, previous
//  role + permissions, department, status, who/when/why deleted,
//  and the activity log.
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import {
  Archive, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  X, Clock, Trash2, RefreshCw,
} from 'lucide-react';
import { api } from '../api/client';
import { inputStyle } from '../components/ui';
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
    <div style={overlay} onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* header */}
        <div style={modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Archive size={20} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Users History</div>
              <div style={{ fontSize: 12.5, color: '#6b7280' }}>Archive of deleted accounts ({data.total})</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} style={iconBtn} title="Refresh"><RefreshCw size={16} /></button>
            <button onClick={onClose} style={iconBtn} title="Close" aria-label="Close"><X size={18} /></button>
          </div>
        </div>

        {/* search + filter */}
        <div style={{ display: 'flex', gap: 12, padding: '14px 20px', flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--border, #eef0f4)' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, email, role, reason, or who deleted…"
              autoFocus
              style={{ ...inputStyle, width: '100%', paddingLeft: 36 }}
            />
          </div>
          <select value={type} onChange={(e) => setType(e.target.value as any)} style={{ ...inputStyle, minWidth: 170 }}>
            <option value="">All deletion types</option>
            <option value="temporary">Temporary only</option>
            <option value="permanent">Permanent only</option>
          </select>
        </div>

        {/* scrollable body: table */}
        <div style={modalBody}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: 12, background: 'var(--surface-2, #f8fafc)', position: 'sticky', top: 0, zIndex: 1 }}>
                {['', 'Name', 'Email', 'Previous role', 'Status', 'Type', 'Deleted at', 'Deleted by'].map((h, i) => (
                  <th key={i} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={empty}>Loading…</td></tr>
              ) : data.rows.length === 0 ? (
                <tr><td colSpan={8} style={empty}>No deleted users found.</td></tr>
              ) : data.rows.map((r) => (
                <RowItem key={r._id} r={r} open={expanded === r._id} onToggle={() => setExpanded(expanded === r._id ? null : r._id)} />
              ))}
            </tbody>
          </table>
        </div>

        {/* pagination footer */}
        <div style={pager}>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            {data.total === 0 ? 'No records' : `Page ${data.page} of ${data.pages} · ${data.total} records`}
          </div>
          {data.pages > 1 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button disabled={data.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={pageBtn(data.page <= 1)}>
                <ChevronLeft size={15} /> Prev
              </button>
              {pageNumbers.map((n, i) =>
                n === '…' ? (
                  <span key={`e${i}`} style={{ padding: '0 4px', color: '#9ca3af' }}>…</span>
                ) : (
                  <button key={n} onClick={() => setPage(n as number)} style={pageNumBtn(n === data.page)}>{n}</button>
                )
              )}
              <button disabled={data.page >= data.pages} onClick={() => setPage((p) => Math.min(data.pages, p + 1))} style={pageBtn(data.page >= data.pages)}>
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
      <tr style={{ borderTop: '1px solid var(--border, #eee)', cursor: 'pointer', background: open ? 'var(--surface-2, #f8fafc)' : undefined }} onClick={onToggle}>
        <td style={{ ...td, width: 36 }}>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
        <td style={{ ...td, fontWeight: 700 }}>{r.name}</td>
        <td style={td}>{r.email}</td>
        <td style={td}>{ROLE_LABELS[r.role] ?? r.role}</td>
        <td style={td}><StatusBadge status={r.accountStatus} /></td>
        <td style={td}>
          <span style={{ ...badge, ...(isPerm ? { background: '#fee2e2', color: '#b91c1c' } : { background: '#fff7ed', color: '#c2410c' }) }}>
            {isPerm ? <Trash2 size={12} /> : <Clock size={12} />} {isPerm ? 'Permanent' : 'Temporary'}
          </span>
        </td>
        <td style={td}>{fmt(r.deletedAt)}</td>
        <td style={td}>{r.deletedByName || r.deletedByEmail || '—'}</td>
      </tr>

      {open && (
        <tr style={{ background: 'var(--surface-2, #f8fafc)' }}>
          <td colSpan={8} style={{ padding: '4px 20px 22px' }}>
            <div style={detailGrid}>
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
            <div style={{ marginTop: 14 }}>
              <div style={sectionLabel}>Previous permissions</div>
              {r.permissions && Object.keys(r.permissions).length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(r.permissions).map(([mod, acts]) => (
                    <div key={mod} style={permChip}>
                      <b style={{ textTransform: 'capitalize' }}>{mod}</b>: {(acts as string[]).join(', ') || '—'}
                    </div>
                  ))}
                </div>
              ) : <div style={{ fontSize: 13, color: '#9ca3af' }}>No permission snapshot.</div>}
            </div>

            {/* activity log */}
            <div style={{ marginTop: 14 }}>
              <div style={sectionLabel}>Activity log</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {r.activity?.length ? r.activity.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ color: '#9ca3af', minWidth: 150, fontVariantNumeric: 'tabular-nums' }}>{fmt(a.ts)}</span>
                    <span style={{ ...badge, background: '#eef2ff', color: '#4338ca' }}>{a.action}</span>
                    <span style={{ color: '#374151' }}>{a.detail}{a.by ? ` · by ${a.by}` : ''}</span>
                  </div>
                )) : <div style={{ fontSize: 13, color: '#9ca3af' }}>No activity recorded.</div>}
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
    <div style={{ gridColumn: wide ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '.03em', marginBottom: 2 }}>{label.toUpperCase()}</div>
      <div className={mono ? 'mono' : undefined} style={{ fontSize: 13.5, color: '#1f2937', wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, React.CSSProperties> = {
    active: { background: '#e7f6ec', color: '#15803d' },
    disabled: { background: '#f3f4f6', color: '#6b7280' },
    suspended: { background: '#fee2e2', color: '#b91c1c' },
  };
  return <span style={{ ...badge, ...(map[status] || map.disabled), textTransform: 'capitalize' }}>{status}</span>;
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

// ---- styles ----
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20,
  background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
  animation: 'fadeUp .18s ease',
};
const modalCard: React.CSSProperties = {
  position: 'relative', width: '100%', maxWidth: 1080, maxHeight: '88vh', background: '#fff',
  borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,.28)', border: '1px solid #eef0f4',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
};
const modalHeader: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--border, #eef0f4)' };
const modalBody: React.CSSProperties = { overflow: 'auto', flex: 1 };
const th: React.CSSProperties = { padding: '11px 16px', fontWeight: 700, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle' };
const empty: React.CSSProperties = { padding: 30, textAlign: 'center', color: '#9ca3af' };
const badge: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 99, fontSize: 12, fontWeight: 700 };
const iconBtn: React.CSSProperties = { background: 'var(--surface-2, #f3f4f6)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '7px 9px', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'inherit' };
const detailGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px 24px', background: '#fff', border: '1px solid var(--border, #eef0f4)', borderRadius: 12, padding: 16 };
const sectionLabel: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: '#6b7280', marginBottom: 8 };
const permChip: React.CSSProperties = { background: '#fff', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '6px 10px', fontSize: 12.5, color: '#374151' };
const pager: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 18px', borderTop: '1px solid var(--border, #eee)', flexWrap: 'wrap' };
const pageBtn = (disabled: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#fff', border: '1px solid var(--border, #d1d5db)', borderRadius: 8, padding: '6px 11px', fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', color: disabled ? '#cbd5e1' : '#374151' });
const pageNumBtn = (active: boolean): React.CSSProperties => ({ minWidth: 34, textAlign: 'center', background: active ? 'var(--brand, #3b5bfd)' : '#fff', color: active ? '#fff' : '#374151', border: `1px solid ${active ? 'var(--brand, #3b5bfd)' : 'var(--border, #d1d5db)'}`, borderRadius: 8, padding: '6px 10px', fontSize: 13, fontWeight: 700, cursor: 'pointer' });
