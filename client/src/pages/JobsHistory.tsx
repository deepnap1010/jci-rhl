// client/src/pages/JobsHistory.tsx
// ============================================================
//  JOBS HISTORY MODAL  —  archive of deleted production jobs.
//  Opens as a popup from Jobs & Tasks. Paginated + searchable.
//  Each row expands to the full job snapshot + deletion info.
//  EKC re-skin — visual layer only, logic unchanged.
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { Archive, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { cn } from '../lib/utils';

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
// unified status pill — pending=amber · inProgress=teal · completed=steel
const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-idle/10 text-idle',
  inProgress: 'bg-running/10 text-running',
  completed: 'bg-steel/10 text-steel',
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
    <div className="fixed inset-0 z-[1000] grid place-items-center p-5 bg-[rgba(15,23,42,.55)] backdrop-blur-sm" onClick={onClose}>
      <div className="panel relative w-full max-w-[1040px] max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0"><Archive size={18} className="text-accent" /></span>
            <div>
              <div className="text-lg font-extrabold text-primary leading-tight">Job History</div>
              <div className="text-[12.5px] text-steel">Archive of deleted jobs ({data.total})</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="bg-base border border-line rounded-lg p-2 grid place-items-center text-steel hover:text-primary transition-colors" title="Refresh"><RefreshCw size={16} /></button>
            <button onClick={onClose} className="bg-base border border-line rounded-lg p-2 grid place-items-center text-steel hover:text-primary transition-colors" title="Close" aria-label="Close"><X size={18} /></button>
          </div>
        </div>

        <div className="px-5 py-3.5 border-b border-line">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel/60 pointer-events-none" />
            <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Search by job, order, fabric, operator, supervisor, reason…" className="w-full bg-base border border-line rounded-lg pl-9 pr-3 py-2.5 text-sm text-primary outline-none focus:border-accent placeholder:text-steel/50" />
          </div>
        </div>

        <div className="overflow-auto flex-1">
          <table className="tbl [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-[1]">
            <thead>
              <tr>
                {['', 'Job', 'Order', 'Fabric', 'Stage', 'Status', 'Deleted at', 'Deleted by'].map((h, i) => <th key={i}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-8 text-steel">Loading…</td></tr>
              ) : data.rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-steel">No deleted jobs found.</td></tr>
              ) : data.rows.map((r) => (
                <RowItem key={r._id} r={r} open={expanded === r._id} onToggle={() => setExpanded(expanded === r._id ? null : r._id)} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center gap-3 px-4.5 py-3.5 border-t border-line flex-wrap">
          <div className="text-[13px] text-steel">{data.total === 0 ? 'No records' : `Page ${data.page} of ${data.pages} · ${data.total} records`}</div>
          {data.pages > 1 && (
            <div className="flex gap-1.5 items-center">
              <button disabled={data.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className={pageBtn(data.page <= 1)}><ChevronLeft size={15} /> Prev</button>
              {pageNumbers.map((n, i) => n === '…'
                ? <span key={`e${i}`} className="px-1 text-steel/50">…</span>
                : <button key={n} onClick={() => setPage(n as number)} className={pageNumBtn(n === data.page)}>{n}</button>)}
              <button disabled={data.page >= data.pages} onClick={() => setPage((p) => Math.min(data.pages, p + 1))} className={pageBtn(data.page >= data.pages)}>Next <ChevronRight size={15} /></button>
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
      <tr className={cn('cursor-pointer', open && 'bg-raised')} onClick={onToggle}>
        <td className="w-9 text-steel">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
        <td className="data font-bold">{r.jobNumber}</td>
        <td>{r.orderNumber || '—'}</td>
        <td>{r.fabricName || '—'}</td>
        <td>{r.stage || '—'}</td>
        <td><span className={cn('pill whitespace-nowrap', STATUS_BADGE[r.status] || 'bg-steel/10 text-steel')}>{r.status || '—'}</span></td>
        <td className="whitespace-nowrap">{fmt(r.deletedAt)}</td>
        <td>{r.deletedByName || r.deletedByEmail || '—'}</td>
      </tr>
      {open && (
        <tr className="bg-raised">
          <td colSpan={8} className="!pt-1 !pb-5 px-5">
            <div className="grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] gap-x-6 gap-y-3 bg-base border border-line rounded-xl p-4">
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
    <div className={wide ? 'col-span-full' : undefined}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-steel mb-0.5">{label}</div>
      <div className={cn('text-[13.5px] text-primary break-words', mono && 'data')}>{value}</div>
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