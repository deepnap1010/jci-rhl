// client/src/pages/JobTracking.tsx
// ============================================================
//  JOB TRACKING PAGE  —  EKC re-skin (Tailwind + theme tokens)
//  KPIs + jobs table + create / track / delete modals.
//  Exports the shared Modal/Field shells used by other pages.
//  Visual layer only — all data hooks and logic are unchanged.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { Search, X, Plus, Trash2, History, AlertTriangle } from 'lucide-react';
import { useJobs, useMachines, useTasks } from '../hooks/useData';
import type { JobRow } from '../hooks/useData';
import JobsHistoryModal from './JobsHistory';
import OrgCascadePicker from '../components/OrgCascadePicker';
import type { CascadeSelection } from '../components/OrgCascadePicker';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { api } from '../api/client';
import { DEPARTMENTS } from '@shared/types';
import { can } from '@shared/permissions';
import { useAuth } from '../context/auth';
import { cn } from '../lib/utils';

// EKC accent palette
const TEAL = '#0D9488', AMBER = '#D97706', INDIGO = '#6366F1', STEEL = '#64748B';

// shared Tailwind class strings
const FIELD = 'w-full bg-base border border-line rounded-lg px-3 py-2.5 text-sm text-primary outline-none focus:border-accent placeholder:text-steel/50';
const LBL = 'text-[11px] font-bold uppercase tracking-wide text-steel mb-1.5';
const B = 'font-semibold text-primary';
const PRIMARY = 'inline-flex items-center justify-center gap-1.5 bg-accent text-white rounded-lg px-4 py-2.5 font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60';
const GHOST = 'inline-flex items-center justify-center gap-1.5 bg-base text-steel border border-line rounded-lg px-4 py-2.5 font-bold text-sm hover:text-primary transition-colors disabled:opacity-60';

// unified status pill (jobs) — Pending=amber · In Progress=teal · Completed=steel
const JOB_TONE: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-idle/10 text-idle' },
  inProgress: { label: 'In Progress', cls: 'bg-running/10 text-running' },
  completed: { label: 'Completed', cls: 'bg-steel/10 text-steel' },
};
const JOBS_PAGE = 10; // jobs per page in the Production Jobs table
function JobStatus({ status }: { status: string }) {
  const t = JOB_TONE[status] ?? { label: status, cls: 'bg-steel/10 text-steel' };
  return <span className={cn('pill whitespace-nowrap', t.cls)}>{t.label}</span>;
}

export default function JobTracking() {
  const { data: jobs, reload } = useJobs();
  const { role } = useAuth();
  const canCreate = can(role, 'assignJobs');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [track, setTrack] = useState<JobRow | null>(null);
  const [delTarget, setDelTarget] = useState<JobRow | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [page, setPage] = useState(1);

  const counts = useMemo(() => ({
    total: jobs.length,
    inProgress: jobs.filter((j) => j.status === 'inProgress').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    pending: jobs.filter((j) => j.status === 'pending').length,
  }), [jobs]);

  // allotted-date window (a single "From" date filters that whole day; with "To" it's a range)
  const fromMs = dateFrom ? new Date(`${dateFrom}T00:00`).getTime() : null;
  const toMs = (dateTo || dateFrom) ? new Date(`${dateTo || dateFrom}T23:59:59`).getTime() : null;

  const filtered = jobs.filter((j) => {
    if (status && j.status !== status) return false;
    // search also matches the assigned operator + supervisor by name
    if (q && !`${j.jobNumber} ${j.orderNumber} ${j.fabricName} ${j.machineCode ?? ''} ${j.operatorName ?? ''} ${j.supervisorName ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (fromMs != null && toMs != null) {
      const t = j.createdAt ? new Date(j.createdAt).getTime() : null;
      if (t == null || t < fromMs || t > toMs) return false;
    }
    return true;
  });

  // paginate (10/page); reset to page 1 whenever the filter changes
  const totalPages = Math.max(1, Math.ceil(filtered.length / JOBS_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageJobs = filtered.slice((safePage - 1) * JOBS_PAGE, safePage * JOBS_PAGE);
  useEffect(() => { setPage(1); }, [q, status, dateFrom, dateTo]);
  const fmtAllot = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  return (
    <div className="px-5 sm:px-7 pb-10 space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total Jobs" value={counts.total} sub="All jobs" color={INDIGO} />
        <Kpi label="In Progress" value={counts.inProgress} sub="Running now" color={TEAL} />
        <Kpi label="Completed" value={counts.completed} sub="Finished" color={STEEL} />
        <Kpi label="Pending" value={counts.pending} sub="Not started" color={AMBER} />
      </div>

      {/* toolbar */}
      <div className="panel p-3.5 flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel/60 pointer-events-none" />
          <input placeholder="Search job, order, fabric, machine…" value={q} onChange={(e) => setQ(e.target.value)} className={cn(FIELD, 'pl-9')} />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={cn(FIELD, 'w-auto cursor-pointer')}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="inProgress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <label className="inline-flex items-center gap-1.5 bg-base border border-line rounded-lg px-2.5 py-1.5" title="Allotted from">
          <span className="text-[10px] font-extrabold tracking-wide text-steel/60">FROM</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-transparent text-[13px] text-primary outline-none" />
        </label>
        <label className="inline-flex items-center gap-1.5 bg-base border border-line rounded-lg px-2.5 py-1.5" title="Allotted to (optional)">
          <span className="text-[10px] font-extrabold tracking-wide text-steel/60">TO</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-transparent text-[13px] text-primary outline-none" />
        </label>
        {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-accent font-bold text-[13px] hover:underline">Clear dates</button>}
        <button onClick={() => setShowHistory(true)} className={GHOST}><History size={16} /> Job History</button>
        {canCreate && <button onClick={() => setShowCreate(true)} className={PRIMARY}><Plus size={16} /> Create Job</button>}
      </div>

      <div className="panel p-0 overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>JOB</th><th>ORDER</th><th>FABRIC</th><th>STAGE</th><th>ASSIGNED TO</th>
              <th className="r">TARGET</th><th className="r">ACHIEVED</th><th className="w-[140px]">PROGRESS</th><th>STATUS</th><th className="r">ACTION</th>
            </tr>
          </thead>
          <tbody>
            {pageJobs.map((j) => (
              <tr key={j._id}>
                <td className="data font-bold">{j.jobNumber}</td>
                <td>{j.orderNumber}</td>
                <td>{j.fabricName}</td>
                <td className="text-steel">{j.stage}</td>
                <td>
                  {j.operatorName || j.supervisorName ? (
                    <div className="leading-[1.35]">
                      <div className="font-bold">{j.operatorName ?? '—'}</div>
                      {j.supervisorName && <div className="text-[11px] text-steel">under {j.supervisorName}</div>}
                      {j.createdAt && <div className="text-[11px] text-steel/60">allotted {fmtAllot(j.createdAt)}</div>}
                    </div>
                  ) : <span className="text-steel/60">Unassigned</span>}
                </td>
                <td className="r data">{j.targetProduction.toLocaleString()}</td>
                <td className="r data">{j.achievedProduction.toLocaleString()}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-raised rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${j.pct}%`, background: j.pct >= 100 ? TEAL : '#0D9488' }} />
                    </div>
                    <span className="data text-xs w-9 text-right">{j.pct}%</span>
                  </div>
                </td>
                <td><JobStatus status={j.status} /></td>
                <td className="r">
                  <div className="inline-flex items-center gap-1">
                    <button onClick={() => setTrack(j)} className="text-accent font-bold text-[13px] px-1.5 hover:underline">Track</button>
                    {canCreate && (
                      <button onClick={() => setDelTarget(j)} title="Delete job" className="w-7 h-7 grid place-items-center rounded-lg border border-line bg-base text-stopped hover:bg-stopped/10 transition-colors"><Trash2 size={15} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="text-center text-steel py-8">No jobs match.</td></tr>
            )}
          </tbody>
        </table>
        {filtered.length > JOBS_PAGE && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line">
            <span className="text-[13px] text-steel">
              Showing <b className={B}>{(safePage - 1) * JOBS_PAGE + 1}–{Math.min(safePage * JOBS_PAGE, filtered.length)}</b> of <b className={B}>{filtered.length}</b>
            </span>
            <div className="flex gap-2 items-center">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className={pagerCls(safePage <= 1)}>‹ Prev</button>
              <span className="text-[13px] text-steel self-center">Page {safePage} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className={pagerCls(safePage >= totalPages)}>Next ›</button>
            </div>
          </div>
        )}
      </div>

      {showCreate && <CreateJobModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); reload(); }} />}
      {track && <TrackModal job={track} onClose={() => setTrack(null)} onSaved={() => { setTrack(null); reload(); }} />}
      {delTarget && <DeleteJobModal job={delTarget} onClose={() => setDelTarget(null)} onDeleted={() => { setDelTarget(null); reload(); }} />}
      {showHistory && <JobsHistoryModal onClose={() => setShowHistory(false)} />}
    </div>
  );
}

// ---- summary KPI tile (EKC card look) ----
function Kpi({ label, value, sub, color }: { label: string; value: React.ReactNode; sub: string; color: string }) {
  return (
    <div className="card p-3.5">
      <div className="label">{label}</div>
      <div className="data text-2xl font-bold mt-1" style={{ color }}>{value}</div>
      <div className="text-[10px] text-steel mt-0.5">{sub}</div>
    </div>
  );
}

function pagerCls(disabled: boolean) {
  return cn(
    'min-w-16 h-8 px-3 rounded-lg text-[13px] font-bold border border-line bg-base transition-colors',
    disabled ? 'opacity-50 cursor-not-allowed text-steel' : 'text-accent hover:border-accent/40'
  );
}

// ---- delete confirmation modal ----
function DeleteJobModal({ job, onClose, onDeleted }: { job: JobRow; onClose: () => void; onDeleted: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function confirm() {
    setBusy(true); setErr('');
    try {
      await api.delete(`/api/jobs/${job._id}`, { data: { reason } });
      onDeleted();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to delete job.');
      setBusy(false);
    }
  }
  return (
    <Modal title="Delete job" onClose={onClose}>
      <div className="flex gap-3 items-start px-3.5 py-3 bg-stopped/10 border border-stopped/30 rounded-card mb-3.5">
        <AlertTriangle size={22} className="text-stopped shrink-0 mt-0.5" />
        <div className="text-[13.5px] text-stopped leading-relaxed">
          Delete <b className="data font-bold">{job.jobNumber}</b>{job.fabricName && job.fabricName !== '—' ? ` (${job.fabricName})` : ''}? It will be removed from the live list and moved to <b className="font-bold">Job History</b>, where its full details remain viewable.
        </div>
      </div>
      <div className={LBL}>Reason (optional)</div>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Completed and cleared, or created by mistake" className={cn(FIELD, 'resize-y')} />
      {err && <div className="text-stopped text-[13px] mt-2.5">{err}</div>}
      <div className="flex justify-end gap-2.5 mt-4">
        <button onClick={onClose} className={GHOST} disabled={busy}>Cancel</button>
        <button onClick={confirm} disabled={busy} className="inline-flex items-center justify-center gap-1.5 bg-stopped text-white rounded-lg px-4 py-2.5 font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60">{busy ? 'Deleting…' : 'Delete job'}</button>
      </div>
    </Modal>
  );
}

// ---- create job modal ----
function CreateJobModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { machines } = useMachines();
  const { assign } = useTasks(); // create a delegated task
  const [f, setF] = useState({ orderNumber: '', fabricName: '', stage: DEPARTMENTS[0] as string, targetProduction: '', machineId: '' });
  const [taskSel, setTaskSel] = useState<CascadeSelection | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  // contextual: stage → only its machines
  const stageMachines = machines.filter((m) => m.department === f.stage);
  const setStage = (v: string) => setF((p) => ({ ...p, stage: v, machineId: '' }));
  const setMachine = (v: string) => setF((p) => ({ ...p, machineId: v }));

  async function save() {
    if (!f.orderNumber || !f.fabricName) { setErr('Order number and fabric are required.'); return; }
    setSaving(true); setErr('');
    try {
      // operator/supervisor come from the hierarchy you drilled in the cascade
      const operatorId = taskSel?.path.find((p) => p.role === 'operator')?.id;
      const supervisorId = taskSel?.path.find((p) => p.role === 'supervisor')?.id;
      const machineCode = taskSel?.machineCode || machines.find((m) => m._id === f.machineId)?.code || undefined;
      const { data } = await api.post('/api/jobs', {
        orderNumber: f.orderNumber, fabricName: f.fabricName, stage: f.stage,
        targetProduction: Number(f.targetProduction) || 0,
        machineId: machineCode, operatorId, supervisorId,
      });
      // hand this job down your org as a task to the person you picked
      if (taskSel?.userId && data?.jobNumber) {
        await assign({
          assignedToId: taskSel.userId,
          title: `${data.jobNumber}${f.fabricName ? ` — ${f.fabricName}` : ''}`,
          targetProduction: Number(f.targetProduction) || 0,
          department: f.stage,
          machineId: machineCode || null,
          jobId: data.id,
          jobNumber: data.jobNumber,
        });
      }
      onSaved();
    } catch { setErr('Failed to create job.'); setSaving(false); }
  }

  return (
    <Modal title="Create Job" onClose={onClose}>
      <div className="grid-two" style={{ gap: 12 }}>
        <Field label="Job Number"><div className="bg-raised border border-line rounded-lg px-3 py-2.5 text-sm text-steel flex items-center">Auto-assigned</div></Field>
        <Field label="Order Number"><input className={FIELD} value={f.orderNumber} onChange={(e) => set('orderNumber', e.target.value)} placeholder="LOT7-01" /></Field>
        <Field label="Fabric"><input className={FIELD} value={f.fabricName} onChange={(e) => set('fabricName', e.target.value)} placeholder="Cotton" /></Field>
        <Field label="Target (mtr)"><input className={FIELD} type="number" value={f.targetProduction} onChange={(e) => set('targetProduction', e.target.value)} placeholder="15000" /></Field>
        <Field label="Stage"><select className={FIELD} value={f.stage} onChange={(e) => setStage(e.target.value)}>{DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}</select></Field>
        <Field label="Machine">
          <select className={FIELD} value={f.machineId} onChange={(e) => setMachine(e.target.value)}>
            <option value="">{stageMachines.length ? '— none —' : 'No machines in this stage'}</option>
            {stageMachines.map((m) => <option key={m._id} value={m._id}>{m.code}</option>)}
          </select>
        </Field>
      </div>

      {/* hand the whole job DOWN your org as a task — drill to the right person */}
      <div className="mt-3.5 pt-3.5 border-t border-line">
        <div className="text-[13px] font-extrabold mb-2 text-primary">Assign this job as a task (optional)</div>
        <OrgCascadePicker onChange={setTaskSel} />
        {taskSel && (
          <div className="text-xs text-steel/60 mt-2">
            Will assign to <b className={B}>{taskSel.name}</b>{taskSel.machineCode ? ` · ${taskSel.machineCode}` : ''} — they get a task linked to this job + a notification.
          </div>
        )}
      </div>

      {err && <div className="text-stopped text-[13px] mt-3">{err}</div>}
      <div className="flex justify-end gap-2.5 mt-4">
        <button onClick={onClose} className={GHOST}>Cancel</button>
        <button onClick={save} disabled={saving} className={PRIMARY}>{saving ? 'Saving…' : taskSel ? 'Create & assign' : 'Create Job'}</button>
      </div>
    </Modal>
  );
}

// ---- track / update modal ----
function TrackModal({ job, onClose, onSaved }: { job: JobRow; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  async function setStatus(status: string) {
    setSaving(true);
    try { await api.patch(`/api/jobs/${job._id}`, { status }); onSaved(); } catch { setSaving(false); }
  }
  return (
    <Modal title={`${job.jobNumber} — Track`} onClose={onClose}>
      <div className="grid-two mb-4" style={{ gap: 10 }}>
        <Info label="Order" value={job.orderNumber} />
        <Info label="Fabric" value={job.fabricName} />
        <Info label="Stage" value={job.stage} />
        <Info label="Machine" value={job.machineCode ?? '—'} />
        <Info label="Operator" value={job.operatorName ?? '—'} />
        <Info label="Supervisor" value={job.supervisorName ?? '—'} />
      </div>
      <div className="mb-2 text-[13px] text-steel">
        Progress: <b className="data font-bold text-primary">{job.achievedProduction.toLocaleString()}</b> / {job.targetProduction.toLocaleString()} mtr ({job.pct}%)
      </div>
      <div className="pbar mb-4"><span style={{ width: `${job.pct}%`, background: TEAL }} /></div>
      <div className="flex gap-2.5 justify-end">
        <button disabled={saving} onClick={() => setStatus('pending')} className={GHOST}>Set Pending</button>
        <button disabled={saving} onClick={() => setStatus('inProgress')} className={GHOST}>In Progress</button>
        <button disabled={saving} onClick={() => setStatus('completed')} className={PRIMARY}>Mark Completed</button>
      </div>
    </Modal>
  );
}

// ---- shared modal shell + bits (used by this page and others, e.g. Dashboard) ----
const OVERLAY = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(15,23,42,.55)] backdrop-blur-sm';

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useModalDismiss(onClose);
  return (
    <div className={OVERLAY} onClick={onClose}>
      <div className={cn('panel flex flex-col max-h-[90vh] overflow-hidden', wide ? 'w-[min(1040px,94vw)]' : 'w-[min(640px,94vw)]')} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-line shrink-0">
          <h2 className="text-lg font-extrabold text-primary">{title}</h2>
          <button onClick={onClose} className="text-steel hover:text-primary transition-colors"><X size={20} /></button>
        </div>
        {/* only the body scrolls — the card frame + title stay pinned (no more whole-modal drift) */}
        <div className="flex-1 min-h-0 overflow-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className={LBL}>{label}</div>
      {children}
    </label>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-raised rounded-card px-3 py-2">
      <div className="text-[10px] font-bold uppercase text-steel">{label}</div>
      <div className="font-bold text-sm text-primary">{value}</div>
    </div>
  );
}