// ============================================================
//  TASKS  —  delegated work down the org chart
//  Managers assign tasks to their direct reports; the assignee is
//  notified and works it. Production Head → Production Manager →
//  Supervisor → Operator.
// ============================================================
import { useState } from 'react';
import { Send, Inbox, ListChecks } from 'lucide-react';
import { useTasks } from '../hooks/useData';
import type { TaskRow } from '../hooks/useData';
import type { Role } from '@shared/types';
import { ROLE_LABELS } from '../config/nav';
import { useToast } from '../components/Toast';
import { inputStyle } from '../components/ui';

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

export default function Tasks() {
  const { toMe, byMe, reports, assign, setStatus } = useTasks();
  const toast = useToast();
  const canAssign = reports.length > 0;
  const [form, setForm] = useState({ assignedToId: '', title: '', targetProduction: '', details: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.assignedToId || !form.title.trim()) { toast.error('Pick a team member and enter a title'); return; }
    setBusy(true);
    try {
      await assign({
        assignedToId: form.assignedToId,
        title: form.title.trim(),
        details: form.details.trim(),
        targetProduction: Number(form.targetProduction) || 0,
      });
      toast.success('Task assigned — they have been notified');
      setForm({ assignedToId: '', title: '', targetProduction: '', details: '' });
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
          <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14, alignItems: 'end' }}>
            <Field label="Assign to">
              <select style={full} value={form.assignedToId} onChange={(e) => set('assignedToId', e.target.value)}>
                <option value="">— select team member —</option>
                {reports.map((u) => (
                  <option key={u._id} value={u._id}>{u.name} ({ROLE_LABELS[u.role] ?? u.role})</option>
                ))}
              </select>
            </Field>
            <Field label="Task / job title">
              <input style={full} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Run batch B-204 on line 3" />
            </Field>
            <Field label="Target (mtr)">
              <input style={full} type="number" value={form.targetProduction} onChange={(e) => set('targetProduction', e.target.value)} placeholder="0" />
            </Field>
            <Field label="Notes (optional)">
              <input style={full} value={form.details} onChange={(e) => set('details', e.target.value)} placeholder="Any instructions…" />
            </Field>
            <button type="submit" disabled={busy} style={{ background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>
              {busy ? 'Assigning…' : 'Assign task'}
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
