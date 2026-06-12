// ============================================================
//  JOB TRACKING PAGE  —  KPIs + jobs table + create / track
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { Search, X, Plus } from 'lucide-react';
import { useJobs, useMachines, useTasks } from '../hooks/useData';
import type { JobRow } from '../hooks/useData';
import OrgCascadePicker from '../components/OrgCascadePicker';
import type { CascadeSelection } from '../components/OrgCascadePicker';
import { KpiCard, inputStyle } from '../components/ui';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { api } from '../api/client';
import { DEPARTMENTS } from '@shared/types';
import { can } from '@shared/permissions';
import { useAuth } from '../context/auth';

const STATUS_STYLE: Record<string, [string, string, string]> = {
  pending: ['#fef5e7', '#b45309', 'Pending'],
  inProgress: ['#eaf3fb', '#2563eb', 'In Progress'],
  completed: ['#e8f7ee', '#16a34a', 'Completed'],
};
const JOBS_PAGE = 10; // jobs per page in the Production Jobs table
function JobStatus({ status }: { status: string }) {
  const [bg, fg, label] = STATUS_STYLE[status] ?? ['var(--surface-2)', 'var(--text-muted)', status];
  return <span style={{ background: bg, color: fg, borderRadius: 99, padding: '3px 11px', fontSize: 12, fontWeight: 700 }}>{label}</span>;
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
    <div style={{ padding: '0 28px 40px' }}>
      <div className="grid-stats-4" style={{ gap: 14 }}>
        <KpiCard label="Total Jobs" value={counts.total} sub="All jobs" accent="var(--accent-blue)" />
        <KpiCard label="In Progress" value={counts.inProgress} sub="Running now" accent="var(--accent-teal)" />
        <KpiCard label="Completed" value={counts.completed} sub="Finished" accent="var(--accent-green)" />
        <KpiCard label="Pending" value={counts.pending} sub="Not started" accent="var(--accent-amber)" />
      </div>

      {/* toolbar */}
      <div className="card" style={{ padding: 14, margin: '18px 0', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-faint)' }} />
          <input placeholder="Search job, order, fabric, machine…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle, paddingLeft: 36, width: '100%' }} />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="inProgress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <label style={dateWrap} title="Allotted from"><span style={dateLbl}>FROM</span><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={dateInput} /></label>
        <label style={dateWrap} title="Allotted to (optional)"><span style={dateLbl}>TO</span><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={dateInput} /></label>
        {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ border: 'none', background: 'none', color: 'var(--brand)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Clear dates</button>}
        {canCreate && <button onClick={() => setShowCreate(true)} style={primaryBtn}><Plus size={16} /> Create Job</button>}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-faint)', fontSize: 11, background: 'var(--surface-2)' }}>
              <th style={th}>JOB</th><th style={th}>ORDER</th><th style={th}>FABRIC</th><th style={th}>STAGE</th><th style={th}>ASSIGNED TO</th>
              <th style={thR}>TARGET</th><th style={thR}>ACHIEVED</th><th style={{ ...th, width: 140 }}>PROGRESS</th><th style={th}>STATUS</th><th style={thR}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {pageJobs.map((j) => (
              <tr key={j._id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ ...td, fontWeight: 700 }} className="mono">{j.jobNumber}</td>
                <td style={td}>{j.orderNumber}</td>
                <td style={td}>{j.fabricName}</td>
                <td style={{ ...td, color: 'var(--text-muted)' }}>{j.stage}</td>
                <td style={td}>
                  {j.operatorName || j.supervisorName ? (
                    <div style={{ lineHeight: 1.35 }}>
                      <div style={{ fontWeight: 700 }}>{j.operatorName ?? '—'}</div>
                      {j.supervisorName && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>under {j.supervisorName}</div>}
                      {j.createdAt && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>allotted {fmtAllot(j.createdAt)}</div>}
                    </div>
                  ) : <span style={{ color: 'var(--text-faint)' }}>Unassigned</span>}
                </td>
                <td style={tdR} className="mono">{j.targetProduction.toLocaleString()}</td>
                <td style={tdR} className="mono">{j.achievedProduction.toLocaleString()}</td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 6, background: 'var(--surface-2)', borderRadius: 99 }}>
                      <div style={{ width: `${j.pct}%`, height: '100%', background: j.pct >= 100 ? 'var(--running)' : 'var(--brand)', borderRadius: 99 }} />
                    </div>
                    <span className="mono" style={{ fontSize: 12, width: 34, textAlign: 'right' }}>{j.pct}%</span>
                  </div>
                </td>
                <td style={td}><JobStatus status={j.status} /></td>
                <td style={tdR}><button onClick={() => setTrack(j)} style={linkBtn}>Track</button></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>No jobs match.</td></tr>
            )}
          </tbody>
        </table>
        {filtered.length > JOBS_PAGE && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Showing <b style={{ color: 'var(--text)' }}>{(safePage - 1) * JOBS_PAGE + 1}–{Math.min(safePage * JOBS_PAGE, filtered.length)}</b> of <b style={{ color: 'var(--text)' }}>{filtered.length}</b>
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} style={jobsPagerBtn(safePage <= 1)}>‹ Prev</button>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', alignSelf: 'center' }}>Page {safePage} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} style={jobsPagerBtn(safePage >= totalPages)}>Next ›</button>
            </div>
          </div>
        )}
      </div>

      {showCreate && <CreateJobModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); reload(); }} />}
      {track && <TrackModal job={track} onClose={() => setTrack(null)} onSaved={() => { setTrack(null); reload(); }} />}
    </div>
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
        <Field label="Job Number"><div style={{ ...fullInput, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>Auto-assigned</div></Field>
        <Field label="Order Number"><input style={fullInput} value={f.orderNumber} onChange={(e) => set('orderNumber', e.target.value)} placeholder="LOT7-01" /></Field>
        <Field label="Fabric"><input style={fullInput} value={f.fabricName} onChange={(e) => set('fabricName', e.target.value)} placeholder="Cotton" /></Field>
        <Field label="Target (mtr)"><input style={fullInput} type="number" value={f.targetProduction} onChange={(e) => set('targetProduction', e.target.value)} placeholder="15000" /></Field>
        <Field label="Stage"><select style={fullInput} value={f.stage} onChange={(e) => setStage(e.target.value)}>{DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}</select></Field>
        <Field label="Machine">
          <select style={fullInput} value={f.machineId} onChange={(e) => setMachine(e.target.value)}>
            <option value="">{stageMachines.length ? '— none —' : 'No machines in this stage'}</option>
            {stageMachines.map((m) => <option key={m._id} value={m._id}>{m.code}</option>)}
          </select>
        </Field>
      </div>

      {/* hand the whole job DOWN your org as a task — drill to the right person */}
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Assign this job as a task (optional)</div>
        <OrgCascadePicker onChange={setTaskSel} />
        {taskSel && (
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 8 }}>
            Will assign to <b style={{ color: 'var(--text)' }}>{taskSel.name}</b>{taskSel.machineCode ? ` · ${taskSel.machineCode}` : ''} — they get a task linked to this job + a notification.
          </div>
        )}
      </div>

      {err && <div style={{ color: 'var(--stopped)', fontSize: 13, marginTop: 12 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button onClick={save} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : taskSel ? 'Create & assign' : 'Create Job'}</button>
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
      <div className="grid-two" style={{ gap: 10, marginBottom: 16 }}>
        <Info label="Order" value={job.orderNumber} />
        <Info label="Fabric" value={job.fabricName} />
        <Info label="Stage" value={job.stage} />
        <Info label="Machine" value={job.machineCode ?? '—'} />
        <Info label="Operator" value={job.operatorName ?? '—'} />
        <Info label="Supervisor" value={job.supervisorName ?? '—'} />
      </div>
      <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-muted)' }}>
        Progress: <b className="mono">{job.achievedProduction.toLocaleString()}</b> / {job.targetProduction.toLocaleString()} mtr ({job.pct}%)
      </div>
      <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 99, marginBottom: 18 }}>
        <div style={{ width: `${job.pct}%`, height: '100%', background: 'var(--brand)', borderRadius: 99 }} />
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button disabled={saving} onClick={() => setStatus('pending')} style={ghostBtn}>Set Pending</button>
        <button disabled={saving} onClick={() => setStatus('inProgress')} style={ghostBtn}>In Progress</button>
        <button disabled={saving} onClick={() => setStatus('completed')} style={primaryBtn}>Mark Completed</button>
      </div>
    </Modal>
  );
}

// ---- shared modal shell + bits ----
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useModalDismiss(onClose);
  return (
    <div style={overlay} onClick={onClose}>
      <div className="card" style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>{title}</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none' }}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 5 }}>{label}</div>
      {children}
    </label>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '8px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)' }}>{label.toUpperCase()}</div>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{value}</div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 700 };
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '11px 12px' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right' };
const primaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 700, fontSize: 14 };
const ghostBtn: React.CSSProperties = { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '9px 16px', fontWeight: 700, fontSize: 14 };
const linkBtn: React.CSSProperties = { border: 'none', background: 'none', color: 'var(--brand)', fontWeight: 700, fontSize: 13 };
const jobsPagerBtn = (disabled: boolean): React.CSSProperties => ({
  minWidth: 64, height: 32, padding: '0 12px', borderRadius: 8, fontSize: 13, fontWeight: 700,
  border: '1px solid var(--border-strong)', background: 'var(--surface)',
  color: disabled ? 'var(--text-faint)' : 'var(--brand)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
});
const fullInput: React.CSSProperties = { ...inputStyle, width: '100%' };
const dateWrap: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border-strong)', borderRadius: 10, padding: '4px 10px', background: 'var(--surface)' };
const dateLbl: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.05em', color: 'var(--text-faint)' };
const dateInput: React.CSSProperties = { border: 'none', background: 'none', fontSize: 13, color: 'var(--text)', outline: 'none' };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(20,28,46,.45)', display: 'grid', placeItems: 'start center', paddingTop: '6vh', zIndex: 50, backdropFilter: 'blur(2px)' };
const modal: React.CSSProperties = { width: 'min(640px,94vw)', maxHeight: '86vh', overflowY: 'auto', padding: 24, animation: 'fadeUp .25s ease' };
