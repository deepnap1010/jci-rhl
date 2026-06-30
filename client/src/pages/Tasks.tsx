// client/src/pages/Tasks.tsx
// ============================================================
//  TASKS  —  delegated work down the org chart  (EKC re-skin)
//  Managers assign tasks to their direct reports; the assignee is
//  notified and works it. Production Head → Production Manager →
//  Supervisor → Operator.  Visual layer only — logic unchanged.
// ============================================================
import { useState, useRef } from 'react';
import { Send, Inbox, ListChecks } from 'lucide-react';
import { useTasks, useJobs } from '../hooks/useData';
import type { TaskRow } from '../hooks/useData';
import type { Role } from '@shared/types';
import { ROLE_LABELS } from '../config/nav';
import { useToast } from '../components/Toast';
import OrgCascadePicker from '../components/OrgCascadePicker';
import type { CascadeSelection } from '../components/OrgCascadePicker';
import { cn } from '../lib/utils';

const FIELD = 'w-full bg-base border border-line rounded-lg px-3 py-2.5 text-sm text-primary outline-none focus:border-accent placeholder:text-steel/50';
const LBL = 'text-[11px] font-bold uppercase tracking-wide text-steel mb-1.5';
const B = 'font-semibold text-primary';

// unified status pill — Pending=amber · In Progress=teal · Completed=steel
const STATUS: Record<TaskRow['status'], { label: string; cls: string; text: string }> = {
  assigned: { label: 'Pending', cls: 'bg-idle/10 text-idle', text: 'text-idle' },
  inProgress: { label: 'In Progress', cls: 'bg-running/10 text-running', text: 'text-running' },
  done: { label: 'Completed', cls: 'bg-steel/10 text-steel', text: 'text-steel' },
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

  return (
    <div className="px-5 sm:px-7 pb-10">
      {/* Assign a task */}
      {canAssign && (
        <div className="panel p-5 mb-5">
          <h3 className="flex items-center gap-2 text-base font-extrabold mb-4 text-primary">
            <Send size={18} className="text-accent" /> Assign a task to your team
          </h3>
          {linkable.length > 0 && (
            <div className="mb-3.5">
              <span className="text-xs font-bold text-steel">Link a job to pass down (optional) — auto-fills title, target &amp; stage</span>
              <select className={cn(FIELD, 'mt-1.5')} value={linked?.key || ''} onChange={(e) => linkJob(e.target.value)}>
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
                <div className="text-xs text-steel/60 mt-1.5">
                  Linked to <b className={B}>{linked.jobNumber}</b> · stage <b className={B}>{linked.stage}</b>{linked.machineCode ? ` · ${linked.machineCode}` : ''}
                </div>
              )}
            </div>
          )}
          <form onSubmit={submit}>
            <div className="grid-two mb-4" style={{ gap: 14 }}>
              <Field label="Task / job title">
                <input className={FIELD} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Run batch B-204" />
              </Field>
              <Field label="Notes (optional)">
                <input className={FIELD} value={form.details} onChange={(e) => set('details', e.target.value)} placeholder="Any instructions…" />
              </Field>
            </div>

            <div className="text-[13px] font-extrabold mb-2 text-primary">
              Assign to{splits.length > 1 ? ` — split across ${splits.length} people` : ''}
            </div>
            {splits.map((s, i) => (
              <div key={s.id} className="border border-line rounded-xl p-3.5 mb-2.5 bg-raised">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-[13px] text-steel">Person {i + 1}{s.sel ? ` — ${s.sel.name}` : ''}</span>
                  {splits.length > 1 && (
                    <button type="button" onClick={() => removeSplit(s.id)} className="text-stopped font-bold text-[13px] hover:underline">Remove</button>
                  )}
                </div>
                <OrgCascadePicker onChange={(sel) => setSplitSel(s.id, sel)} />
                <div className="mt-2.5">
                  <span className="text-xs font-bold text-steel">Target for this person (mtr)</span>
                  <input className={cn(FIELD, 'mt-1.5')} type="number" value={s.target} onChange={(e) => setSplitTarget(s.id, e.target.value)} placeholder="0" />
                </div>
              </div>
            ))}

            <div className="flex items-center gap-3.5 mt-1 mb-4 flex-wrap">
              <button type="button" onClick={addSplit} className="border border-dashed border-line bg-base rounded-lg px-3.5 py-2 font-bold text-[13px] text-accent hover:border-accent/40 transition-colors">
                + Split — add another person
              </button>
              {linked && (
                <span className={cn('text-[13px]', assignedTotal === linkedRemaining ? 'text-running' : assignedTotal > linkedRemaining ? 'text-stopped' : 'text-steel')}>
                  Distributing <b className="font-bold">{assignedTotal.toLocaleString()}</b> of <b className="font-bold">{linkedRemaining.toLocaleString()}</b> remaining
                  {linkedAssigned > 0 && <span className="text-steel/60"> (target {linked.targetProduction.toLocaleString()}, {linkedAssigned.toLocaleString()} already assigned)</span>}
                  {assignedTotal === linkedRemaining
                    ? ' · ✓ balanced'
                    : assignedTotal < linkedRemaining
                      ? ` · ${(linkedRemaining - assignedTotal).toLocaleString()} left`
                      : ` · ${(assignedTotal - linkedRemaining).toLocaleString()} over`}
                </span>
              )}
            </div>

            <button type="submit" disabled={busy} className="bg-accent text-white rounded-lg px-5 py-2.5 font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-70">
              {busy ? 'Assigning…' : validCount > 1 ? `Assign to ${validCount} people` : 'Assign task'}
            </button>
          </form>
        </div>
      )}

      {/* Assigned to me */}
      <Section icon={<Inbox size={16} className="text-accent" />} title="Assigned to me" count={toMe.length}>
        {toMe.length === 0 ? (
          <Empty>No tasks assigned to you.</Empty>
        ) : (
          toMe.map((t) => <TaskCard key={t._id} t={t} mine onStatus={setStatus} />)
        )}
      </Section>

      {/* Tasks I assigned */}
      {byMe.length > 0 && (
        <Section icon={<ListChecks size={16} className="text-accent" />} title="Tasks I assigned" count={byMe.length}>
          {byMe.map((t) => <TaskCard key={t._id} t={t} />)}
        </Section>
      )}
    </div>
  );
}

function TaskCard({ t, mine, onStatus }: { t: TaskRow; mine?: boolean; onStatus?: (id: string, s: TaskRow['status']) => void }) {
  const s = STATUS[t.status];
  return (
    <div className="panel p-4 mb-3">
      <div className="flex justify-between gap-3 items-start">
        <div className="min-w-0">
          {(t.taskNumber || t.jobNumber) && (
            <div className="flex items-center gap-2 mb-1">
              {t.taskNumber && <span className="data text-[11px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded">{t.taskNumber}</span>}
              {t.jobNumber && <span className="data text-[11px] text-steel/60">↳ Job {t.jobNumber}</span>}
            </div>
          )}
          <div className="font-extrabold text-[15px] text-primary">{t.title}</div>
          <div className="text-xs text-steel mt-1">
            {mine ? <>from <b className={B}>{t.assignedByName}</b> ({ROLE_LABELS[t.assignedByRole as Role] ?? t.assignedByRole})</>
                  : <>to <b className={B}>{t.assignedToName}</b> ({ROLE_LABELS[t.assignedToRole as Role] ?? t.assignedToRole})</>}
            {t.targetProduction ? <> · target <b className={B}>{t.targetProduction.toLocaleString()} mtr</b></> : null}
          </div>
          {t.details && <div className="text-[13px] text-steel mt-1.5">{t.details}</div>}
        </div>
        <span className={cn('pill shrink-0', s.cls)}>{s.label}</span>
      </div>

      {mine && onStatus && (
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs font-bold text-steel">Status</span>
          <select
            value={t.status}
            onChange={(e) => onStatus(t._id, e.target.value as TaskRow['status'])}
            className={cn('bg-base border border-line rounded-lg px-3 py-1.5 text-sm font-bold outline-none focus:border-accent cursor-pointer', STATUS[t.status].text)}
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
    <div className="mb-6">
      <h3 className="flex items-center gap-2 text-[15px] font-extrabold mt-1.5 mb-3 text-primary">
        {icon} {title} <span className="text-steel/60 font-bold">({count})</span>
      </h3>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className={LBL}>{label}</div>{children}</label>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="panel p-7 text-center text-steel">{children}</div>;
}