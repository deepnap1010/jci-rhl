// ============================================================
//  JOBS HISTORY MODAL  —  archive of deleted production jobs.
//  Opens as a popup from Jobs & Tasks. Paginated + searchable.
//  Each row expands to the full job snapshot + deletion info.
//  Mirrors the Users History modal.
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { Archive, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { inputStyle } from '../components/ui';

interface JobHistRow {
  _id: string;
  jobId: string;
  jobNumber: string;
  orderNumber: string;
  fabricName: string;
  stage: string;
  status: string;
  targetProduction: number;
  achievedProduction: number;
  machineId: string;
  operatorName: string;
  supervisorName: string;
  batchId: string;
  processType: string;
  glm: number;
  liquorRatio: string;
  dyeStage: string;
  shift: string;
  jobCreatedAt: string | null;
  reason: string;
  deletedByName: string;
  deletedByEmail: string;
  deletedAt: string;
}
interface Resp { rows: JobHistRow[]; total: number; page: number; pages: number; limit: number }

const LIMIT = 10;
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : '—');
const STATUS_BADGE: Record<string, React.CSSProperties> = {
  pending: { background: '#fef5e7', color: '#b45309' },
  inProgress: { background: '#eaf3fb', color: '#2563eb' },
  completed: { background: '#e8f7ee', color: '#16a34a' },
};

export default function JobsHistoryModal({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Resp>({ rows: [], total: 0, page: 1, pages: 1, limit: LIMIT });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Resp>('/api/jobs/history', { params: { page, limit: LIMIT, q: q.trim() } });
      setData(data);
    } catch { setData({ rows: [], total: 0, page: 1, pages: 1, limit: LIMIT }); } finally { setLoading(false); }
  }, [page, q]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setPage(1); }, [q]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);

  const pageNumbers = buildPageWindow(data.page, data.pages);

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Archive size={20} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Job History</div>
              <div style={{ fontSize: 12.5, color: '#6b7280' }}>Archive of deleted jobs ({data.total})</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} style={iconBtn} title="Refresh"><RefreshCw size={16} /></button>
            <button onClick={onClose} style={iconBtn} title="Close" aria-label="Close"><X size={18} /></button>
          </div>
        </div>

        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border, #eef0f4)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Search by job, order, fabric, operator, supervisor, reason…" style={{ ...inputStyle, width: '100%', paddingLeft: 36 }} />
          </div>
        </div>

        <div style={modalBody}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: 12, background: 'var(--surface-2, #f8fafc)', position: 'sticky', top: 0, zIndex: 1 }}>
                {['', 'Job', 'Order', 'Fabric', 'Stage', 'Status', 'Deleted at', 'Deleted by'].map((h, i) => <th key={i} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={empty}>Loading…</td></tr>
              ) : data.rows.length === 0 ? (
                <tr><td colSpan={8} style={empty}>No deleted jobs found.</td></tr>
              ) : data.rows.map((r) => (
                <RowItem key={r._id} r={r} open={expanded === r._id} onToggle={() => setExpanded(expanded === r._id ? null : r._id)} />
              ))}
            </tbody>
          </table>
        </div>

        <div style={pager}>
          <div style={{ fontSize: 13, color: '#6b7280' }}>{data.total === 0 ? 'No records' : `Page ${data.page} of ${data.pages} · ${data.total} records`}</div>
          {data.pages > 1 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button disabled={data.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={pageBtn(data.page <= 1)}><ChevronLeft size={15} /> Prev</button>
              {pageNumbers.map((n, i) => n === '…'
                ? <span key={`e${i}`} style={{ padding: '0 4px', color: '#9ca3af' }}>…</span>
                : <button key={n} onClick={() => setPage(n as number)} style={pageNumBtn(n === data.page)}>{n}</button>)}
              <button disabled={data.page >= data.pages} onClick={() => setPage((p) => Math.min(data.pages, p + 1))} style={pageBtn(data.page >= data.pages)}>Next <ChevronRight size={15} /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RowItem({ r, open, onToggle }: { r: JobHistRow; open: boolean; onToggle: () => void }) {
  const pct = r.targetProduction > 0 ? Math.min(100, Math.round((r.achievedProduction / r.targetProduction) * 100)) : 0;
  return (
    <>
      <tr style={{ borderTop: '1px solid var(--border, #eee)', cursor: 'pointer', background: open ? 'var(--surface-2, #f8fafc)' : undefined }} onClick={onToggle}>
        <td style={{ ...td, width: 36 }}>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
        <td style={{ ...td, fontWeight: 700 }} className="mono">{r.jobNumber}</td>
        <td style={td}>{r.orderNumber || '—'}</td>
        <td style={td}>{r.fabricName || '—'}</td>
        <td style={td}>{r.stage || '—'}</td>
        <td style={td}><span style={{ ...badge, ...(STATUS_BADGE[r.status] || { background: '#f3f4f6', color: '#6b7280' }) }}>{r.status || '—'}</span></td>
        <td style={td}>{fmt(r.deletedAt)}</td>
        <td style={td}>{r.deletedByName || r.deletedByEmail || '—'}</td>
      </tr>
      {open && (
        <tr style={{ background: 'var(--surface-2, #f8fafc)' }}>
          <td colSpan={8} style={{ padding: '4px 20px 22px' }}>
            <div style={detailGrid}>
              <Detail label="Job ID" value={r.jobId} mono />
              <Detail label="Machine" value={r.machineId || '—'} />
              <Detail label="Operator" value={r.operatorName || '—'} />
              <Detail label="Supervisor" value={r.supervisorName || '—'} />
              <Detail label="Target" value={`${r.targetProduction.toLocaleString()} mtr`} />
              <Detail label="Achieved" value={`${r.achievedProduction.toLocaleString()} mtr (${pct}%)`} />
              {r.batchId && <Detail label="Batch ID" value={r.batchId} />}
              {r.processType && <Detail label="Process" value={r.processType} />}
              {r.glm ? <Detail label="GLM / Weight" value={`${r.glm} kg`} /> : null}
              {r.liquorRatio && <Detail label="Liquor ratio" value={r.liquorRatio} />}
              {r.dyeStage && <Detail label="Dye stage" value={r.dyeStage} />}
              {r.shift && <Detail label="Shift" value={r.shift} />}
              <Detail label="Allotted at" value={fmt(r.jobCreatedAt)} />
              <Detail label="Deleted by" value={`${r.deletedByName || '—'}${r.deletedByEmail ? ` (${r.deletedByEmail})` : ''}`} />
              <Detail label="Reason" value={r.reason || '—'} wide />
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

function buildPageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const start = Math.max(2, current - 1), end = Math.min(total - 1, current + 1);
  if (start > 2) out.push('…');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push('…');
  out.push(total);
  return out;
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', animation: 'fadeUp .18s ease' };
const modalCard: React.CSSProperties = { position: 'relative', width: '100%', maxWidth: 1040, maxHeight: '88vh', background: '#fff', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,.28)', border: '1px solid #eef0f4', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const modalHeader: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--border, #eef0f4)' };
const modalBody: React.CSSProperties = { overflow: 'auto', flex: 1 };
const th: React.CSSProperties = { padding: '11px 16px', fontWeight: 700, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle' };
const empty: React.CSSProperties = { padding: 30, textAlign: 'center', color: '#9ca3af' };
const badge: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 99, fontSize: 12, fontWeight: 700 };
const iconBtn: React.CSSProperties = { background: 'var(--surface-2, #f3f4f6)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '7px 9px', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'inherit' };
const detailGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px 24px', background: '#fff', border: '1px solid var(--border, #eef0f4)', borderRadius: 12, padding: 16 };
const pager: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 18px', borderTop: '1px solid var(--border, #eee)', flexWrap: 'wrap' };
const pageBtn = (disabled: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#fff', border: '1px solid var(--border, #d1d5db)', borderRadius: 8, padding: '6px 11px', fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', color: disabled ? '#cbd5e1' : '#374151' });
const pageNumBtn = (active: boolean): React.CSSProperties => ({ minWidth: 34, textAlign: 'center', background: active ? 'var(--brand, #3b5bfd)' : '#fff', color: active ? '#fff' : '#374151', border: `1px solid ${active ? 'var(--brand, #3b5bfd)' : 'var(--border, #d1d5db)'}`, borderRadius: 8, padding: '6px 10px', fontSize: 13, fontWeight: 700, cursor: 'pointer' });
