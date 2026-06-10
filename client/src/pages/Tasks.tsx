// ============================================================
//  TASKS  —  delegated work down the org chart
//  Managers assign tasks to their direct reports; the assignee is
//  notified and works it. Production Head → Production Manager →
//  Supervisor → Operator.
// ============================================================
import { useState, useRef } from 'react';
import { Send, Inbox, ListChecks } from 'lucide-react';
import { useTasks, useJobs } from '../hooks/useData';
import type { TaskRow } from '../hooks/useData';
import type { Role } from '@shared/types';
import { ROLE_LABELS } from '../config/nav';
import { useToast } from '../components/Toast';
import { inputStyle } from '../components/ui';
import OrgCascadePicker from '../components/OrgCascadePicker';
import type { CascadeSelection } from '../components/OrgCascadePicker';

const STATUS: Record<TaskRow['status'], { label: string; bg: string; color: string }> = {
  assigned: { label: 'Pending', bg: '#eef2ff', color: '#3b5bfd' },
  inProgress: { label: 'In Progress', bg: '#fff7e6', color: '#8a5d00' },
  done: { label: 'Completed', bg: '#e7f6ec', color: '#15803d' },
};
// dropdown options (internal value → label)
const STATUS_OPTIONS: { value: TaskRow['status']; label: string }[] = [
  { value: 'assigned', label: 'Pending' },
  { value: 'inProgress', label: 'In Progress' },
  { value: 'done', label: 'Completed' },
];

// a job you can hand down — either an unassigned job or one from a task assigned to you
interface Linkable {
  key: string; jobId: string | null; jobNumber: string; group: 'job' | 'mine';
  label: string; title: string; targetProduction: number; stage: string; machineCode: string | null;
}
// one row of a split — a person + their portion of the target
interface Split { id: string; target: string; sel: CascadeSelection | null }

export default function Tasks() {
  const { toMe, byMe, reports, assign, setStatus } = useTasks();
  const { data: jobs } = useJobs();
  const toast = useToast();
  const canAssign = reports.length > 0;

  // jobs you can hand down: ones created with nobody assigned, PLUS jobs from
  // tasks assigned to YOU (so you can pass your own work further down the chain).
  const fromJobs: Linkable[] = jobs
    .filter((j) => !j.operatorId && !j.supervisorId)
    .map((j) => ({
      key: `job:${j._id}`, jobId: j._id, jobNumber: j.jobNumber, group: 'job',
      label: `${j.jobNumber} · ${j.fabricName || '—'} · ${j.stage} · ${(j.targetProduction || 0).toLocaleString()} mtr`,
      title: `${j.jobNumber}${j.fabricName && j.fabricName !== '—' ? ` — ${j.fabricName}` : ''}`,
      targetProduction: j.targetProduction || 0, stage: j.stage, machineCode: j.machineId,
    }));
  const jobNums = new Set(fromJobs.map((x) => x.jobNumber));
  const fromMine: Linkable[] = toMe
    .filter((t) => t.jobNumber && !jobNums.has(t.jobNumber))
    .map((t) => ({
      key: `task:${t._id}`, jobId: t.jobId, jobNumber: t.jobNumber, group: 'mine',
      label: `${t.jobNumber} · ${t.title} · ${(t.targetProduction || 0).toLocaleString()} mtr`,
      title: t.title, targetProduction: t.targetProduction || 0, stage: t.department, machineCode: t.machineId,
    }));
  const linkable = [...fromJobs, ...fromMine];

  const [linked, setLinked] = useState<Linkable | null>(null);
  const [form, setForm] = useState({ title: '', details: '' });
  const [splits, setSplits] = useState<Split[]>([{ id: 's1', target: '', sel: null }]);
  const nextId = useRef(2);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // how much of a job's target is already handed out (tasks I assigned for it)
  const assignedForJob = (jobNumber: string) =>
    byMe.filter((t) => t.jobNumber === jobNumber).reduce((s, t) => s + (t.targetProduction || 0), 0);

  function linkJob(key: string) {
    const item = linkable.find((x) => x.key === key) || null;
    setLinked(item);
    if (item) {
      const remaining = Math.max(0, (item.targetProduction || 0) - assignedForJob(item.jobNumber));
      setForm((p) => ({ ...p, title: item.title }));
      setSplits([{ id: 's1', target: String(remaining || ''), sel: null }]);
      nextId.current = 2;
    }
  }
  const addSplit = () => setSplits((s) => [...s, { id: `s${nextId.current++}`, target: '', sel: null }]);
  const removeSplit = (id: string) => setSplits((s) => s.filter((x) => x.id !== id));
  const setSplitSel = (id: string, sel: CascadeSelection | null) => setSplits((s) => s.map((x) => (x.id === id ? { ...x, sel } : x)));
  const setSplitTarget = (id: string, target: string) => setSplits((s) => s.map((x) => (x.id === id ? { ...x, target } : x)));
  const assignedTotal = splits.reduce((sum, s) => sum + (Number(s.target) || 0), 0);
  const validCount = splits.filter((s) => s.sel?.userId).length;
  const linkedAssigned = linked ? assignedForJob(linked.jobNumber) : 0;
  const linkedRemaining = linked ? Math.max(0, linked.targetProduction - linkedAssigned) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const valid = splits.filter((s) => s.sel?.userId);
    if (valid.length === 0 || !form.title.trim()) { toast.error('Pick at least one person and a title'); return; }
    setBusy(true);
    try {
      for (const s of valid) {
        await assign({
          assignedToId: s.sel!.userId,
          title: form.title.trim(),
          details: form.details.trim(),
          targetProduction: Number(s.target) || 0,
          machineId: s.sel!.machineCode || linked?.machineCode || null,
          department: linked?.stage,
          jobId: linked?.jobId || undefined,
          jobNumber: linked?.jobNumber || undefined,
        });
      }
      toast.success(valid.length > 1 ? `Split into ${valid.length} tasks — everyone notified` : 'Task assigned — they have been notified');
      setForm({ title: '', details: '' });
      setSplits([{ id: 's1', target: '', sel: null }]);
      nextId.current = 2;
      setLinked(null);
    } catch (err) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to assign');
    } finally {
      setBusy(false);
    }
  }

  const full: React.CSSProperties = { ...inputStyle, width: '100%' };

  return (
    <div style={{ padding: '0 28px 40px' }}>
      {/* Assign a task */}
      {canAssign && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 800, marginBottom: 16 }}>
            <Send size={18} /> Assign a task to your team
          </h3>
          {linkable.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Link a job to pass down (optional) — auto-fills title, target &amp; stage</span>
              <select style={{ ...full, marginTop: 5 }} value={linked?.key || ''} onChange={(e) => linkJob(e.target.value)}>
                <option value="">— none (write a new task) —</option>
                {fromJobs.length > 0 && (
                  <optgroup label="Unassigned jobs">
                    {fromJobs.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </optgroup>
                )}
                {fromMine.length > 0 && (
                  <optgroup label="Assigned to me — pass down or keep">
                    {fromMine.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </optgroup>
                )}
              </select>
              {linked && (
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6 }}>
                  Linked to <b className="mono" style={{ color: 'var(--text)' }}>{linked.jobNumber}</b> · stage <b style={{ color: 'var(--text)' }}>{linked.stage}</b>{linked.machineCode ? ` · ${linked.machineCode}` : ''}
                </div>
              )}
            </div>
          )}
          <form onSubmit={submit}>
            <div className="grid-two" style={{ gap: 14, marginBottom: 16 }}>
              <Field label="Task / job title">
                <input style={full} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Run batch B-204" />
              </Field>
              <Field label="Notes (optional)">
                <input style={full} value={form.details} onChange={(e) => set('details', e.target.value)} placeholder="Any instructions…" />
              </Field>
            </div>

            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
              Assign to{splits.length > 1 ? ` — split across ${splits.length} people` : ''}
            </div>
            {splits.map((s, i) => (
              <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)' }}>Person {i + 1}{s.sel ? ` — ${s.sel.name}` : ''}</span>
                  {splits.length > 1 && (
                    <button type="button" onClick={() => removeSplit(s.id)} style={{ border: 'none', background: 'none', color: 'var(--stopped)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Remove</button>
                  )}
                </div>
                <OrgCascadePicker onChange={(sel) => setSplitSel(s.id, sel)} />
                <div style={{ marginTop: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Target for this person (mtr)</span>
                  <input style={{ ...full, marginTop: 5 }} type="number" value={s.target} onChange={(e) => setSplitTarget(s.id, e.target.value)} placeholder="0" />
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, marginBottom: 16, flexWrap: 'wrap' }}>
              <button type="button" onClick={addSplit} style={{ border: '1px dashed var(--border-strong)', background: 'var(--surface)', borderRadius: 10, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', color: 'var(--brand)' }}>
                + Split — add another person
              </button>
              {linked && (
                <span style={{ fontSize: 13, color: assignedTotal === linkedRemaining ? 'var(--running)' : assignedTotal > linkedRemaining ? 'var(--stopped)' : 'var(--text-muted)' }}>
                  Distributing <b>{assignedTotal.toLocaleString()}</b> of <b>{linkedRemaining.toLocaleString()}</b> remaining
                  {linkedAssigned > 0 && <span style={{ color: 'var(--text-faint)' }}> (target {linked.targetProduction.toLocaleString()}, {linkedAssigned.toLocaleString()} already assigned)</span>}
                  {assignedTotal === linkedRemaining
                    ? ' · ✓ balanced'
                    : assignedTotal < linkedRemaining
                      ? ` · ${(linkedRemaining - assignedTotal).toLocaleString()} left`
                      : ` · ${(assignedTotal - linkedRemaining).toLocaleString()} over`}
                </span>
              )}
            </div>

            <button type="submit" disabled={busy} style={{ background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>
              {busy ? 'Assigning…' : validCount > 1 ? `Assign to ${validCount} people` : 'Assign task'}
            </button>
          </form>
        </div>
      )}

      {/* Assigned to me */}
      <Section icon={<Inbox size={16} />} title="Assigned to me" count={toMe.length}>
        {toMe.length === 0 ? (
          <Empty>No tasks assigned to you.</Empty>
        ) : (
          toMe.map((t) => <TaskCard key={t._id} t={t} mine onStatus={setStatus} />)
        )}
      </Section>

      {/* Tasks I assigned */}
      {byMe.length > 0 && (
        <Section icon={<ListChecks size={16} />} title="Tasks I assigned" count={byMe.length}>
          {byMe.map((t) => <TaskCard key={t._id} t={t} />)}
        </Section>
      )}
    </div>
  );
}

function TaskCard({ t, mine, onStatus }: { t: TaskRow; mine?: boolean; onStatus?: (id: string, s: TaskRow['status']) => void }) {
  const s = STATUS[t.status];
  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          {(t.taskNumber || t.jobNumber) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              {t.taskNumber && <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', background: 'var(--brand-soft)', padding: '2px 7px', borderRadius: 6 }}>{t.taskNumber}</span>}
              {t.jobNumber && <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>↳ Job {t.jobNumber}</span>}
            </div>
          )}
          <div style={{ fontWeight: 800, fontSize: 15 }}>{t.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
            {mine ? <>from <b style={{ color: 'var(--text)' }}>{t.assignedByName}</b> ({ROLE_LABELS[t.assignedByRole as Role] ?? t.assignedByRole})</>
                  : <>to <b style={{ color: 'var(--text)' }}>{t.assignedToName}</b> ({ROLE_LABELS[t.assignedToRole as Role] ?? t.assignedToRole})</>}
            {t.targetProduction ? <> · target <b style={{ color: 'var(--text)' }}>{t.targetProduction.toLocaleString()} mtr</b></> : null}
          </div>
          {t.details && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>{t.details}</div>}
        </div>
        <span style={{ flex: 'none', background: s.bg, color: s.color, borderRadius: 99, padding: '4px 11px', fontSize: 12, fontWeight: 700 }}>{s.label}</span>
      </div>

      {mine && onStatus && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Status</span>
          <select
            value={t.status}
            onChange={(e) => onStatus(t._id, e.target.value as TaskRow['status'])}
            style={{ ...inputStyle, width: 'auto', padding: '7px 12px', fontWeight: 700, color: STATUS[t.status].color }}
          >
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

function Section({ icon, title, count, children }: { icon: React.ReactNode; title: string; count: number; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, margin: '6px 0 12px' }}>
        {icon} {title} <span style={{ color: 'var(--text-faint)', fontWeight: 700 }}>({count})</span>
      </h3>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 5 }}>{label}</div>{children}</label>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)' }}>{children}</div>;
}
