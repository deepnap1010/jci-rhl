// ============================================================
//  OPERATOR MAP PAGE  —  machines grouped by operator / supervisor
//  Click a machine to see its live details and reassign its
//  operator / supervisor / shift right from here.
// ============================================================
import { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { useOperatorMap, useMachines, useJobs, usePeople, useOrg } from '../hooks/useData';
import type { OrgNode } from '../hooks/useData';
import { StatusPill, Metric, inputStyle } from '../components/ui';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/auth';
import { can } from '@shared/permissions';
import { api } from '../api/client';

export default function OperatorMap() {
  const [by, setBy] = useState<'operator' | 'supervisor'>('operator');
  const { data, reload } = useOperatorMap(by);
  const [sel, setSel] = useState<string | null>(null);

  return (
    <div style={{ padding: '0 28px 40px' }}>
      {/* toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <Toggle active={by === 'operator'} onClick={() => setBy('operator')}>By Operator</Toggle>
        <Toggle active={by === 'supervisor'} onClick={() => setBy('supervisor')}>By Supervisor</Toggle>
      </div>

      {data.groups.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No assignments in your scope.</div>
      ) : (
        data.groups.map((g) => (
          <div key={g.key} className="card" style={{ padding: 18, marginBottom: 16 }}>
            {/* group header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={avatar(g.name === '—')}>{g.name === '—' ? '—' : g.name.slice(0, 1)}</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{g.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{g.code ?? (by === 'operator' ? 'Operator' : 'Supervisor')}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                <Stat label="Machines" value={g.stats.machines} />
                <Stat label="Running" value={g.stats.running} color="var(--running)" />
                <Stat label="Production" value={`${(g.stats.production / 1000).toFixed(1)}K mtr`} color="var(--brand)" />
                <Stat label="Avg Eff" value={`${g.stats.avgEff}%`} />
              </div>
            </div>

            {/* machine cards — click to control */}
            <div className="auto-cards-sm" style={{ gap: 10 }}>
              {g.machines.map((m) => (
                <div key={m._id} className={`omcard ${m.status}`} style={{ ...omcard(m.status), cursor: 'pointer' }} onClick={() => setSel(m.code)} title="Open machine controls">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="mono" style={{ fontWeight: 800, fontSize: 13 }}>{m.code}</span>
                    <StatusPill status={m.status} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0' }}>{m.type}</div>
                  <div className="mono" style={{ fontSize: 12 }}>
                    {(m.production / 1000).toFixed(1)}K mtr · {m.efficiency}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {sel && <ControlModal code={sel} onClose={() => setSel(null)} onSaved={() => { setSel(null); reload(); }} />}
    </div>
  );
}

// ---- machine control modal: live details + operator/supervisor/shift ----
function ControlModal({ code, onClose, onSaved }: { code: string; onClose: () => void; onSaved: () => void }) {
  useModalDismiss(onClose);
  const { role } = useAuth();
  const canAssign = can(role, 'assignJobs');
  const { machines } = useMachines();
  const { data: jobs } = useJobs();
  const people = usePeople();
  const { data: org } = useOrg();
  const toast = useToast();

  const m = machines.find((x) => x.code === code);
  const job = jobs.find((j) => j.machineCode === code && j.status === 'inProgress') || jobs.find((j) => j.machineCode === code);
  const supervisors = people.filter((e) => e.role === 'supervisor');

  const [operatorId, setOperatorId] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [shift, setShift] = useState('A');
  const [saving, setSaving] = useState(false);

  // flatten the org tree, then resolve "operators reporting to the selected supervisor"
  const flatOrg = useMemo(() => {
    const out: OrgNode[] = [];
    const walk = (ns: OrgNode[]) => ns.forEach((n) => { out.push(n); walk(n.children); });
    walk(org.nodes);
    return out;
  }, [org.nodes]);
  const operatorsUnder = useMemo(() => {
    const node = supervisorId ? flatOrg.find((n) => n.id === supervisorId) : null;
    if (!node) return [] as { _id: string; name: string }[];
    const ops: { _id: string; name: string }[] = [];
    const walk = (ns: OrgNode[]) => ns.forEach((n) => { if (n.role === 'operator') ops.push({ _id: n.id, name: n.name }); walk(n.children); });
    walk(node.children);
    return ops;
  }, [supervisorId, flatOrg]);

  // sync controls once the matching job is available
  useEffect(() => {
    setOperatorId(job?.operatorId ?? '');
    setSupervisorId(job?.supervisorId ?? '');
    setShift(job?.shift ?? 'A');
  }, [job?._id]);

  const s = m?.state;
  const fmtK = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`);

  async function save() {
    if (!m) return;
    setSaving(true);
    try {
      await api.put(`/api/jobs/by-machine/${code}`, {
        orderNumber: job?.orderNumber || '',
        fabricName: job?.fabricName || '',
        stage: m.department,
        targetProduction: job?.targetProduction || 0,
        batchId: job?.batchId || '',
        processType: job?.processType || '',
        loadedAt: job?.loadedAt || null,
        shift,
        operatorId: operatorId || null,
        supervisorId: supervisorId || null,
      });
      toast.success(`${code} updated`);
      onSaved();
    } catch {
      toast.error('Failed to update');
      setSaving(false);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div className="card" style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }} className="mono">{code}{m ? ` — ${m.name}` : ''}</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          {m && <StatusPill status={m.status} />}
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m?.department}</span>
        </div>

        {/* live details */}
        <div className="grid-stats-3" style={{ gap: 8, marginBottom: 16 }}>
          <Metric label="Production" value={fmtK(s?.production ?? 0)} unit="mtr" />
          <Metric label="Speed" value={s?.speed ?? 0} unit="m/min" />
          <Metric label="Efficiency" value={`${s?.efficiency ?? 0}%`} tone={(s?.efficiency ?? 0) < 1 ? 'warm' : 'plain'} />
          <Metric label="Temperature" value={s?.temperature ?? 0} unit="°c" tone="warm" />
          <Metric label="Water Flow" value={s?.waterFlow ?? 0} unit="L/hr" tone="cool" />
          <Metric label="Downtime" value={Math.round((s?.downtimeSec ?? 0) / 60)} unit="min" tone="warm" />
        </div>

        {/* operator control */}
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--brand)', margin: '4px 0 10px' }}>OPERATOR CONTROL</div>
        <label style={block}><div style={lbl}>Supervisor</div>
          <select
            style={field}
            value={supervisorId}
            onChange={(e) => { setSupervisorId(e.target.value); setOperatorId(''); }} // clear operator — must belong to the new supervisor
            disabled={!canAssign}
          >
            <option value="">— Select supervisor —</option>
            {supervisors.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
          </select>
        </label>
        <label style={block}><div style={lbl}>↳ Operator</div>
          <select style={field} value={operatorId} onChange={(e) => setOperatorId(e.target.value)} disabled={!canAssign || !supervisorId || operatorsUnder.length === 0}>
            <option value="">
              {!supervisorId ? '— select a supervisor first —' : operatorsUnder.length ? '— Select operator —' : 'No operators report to this supervisor'}
            </option>
            {operatorsUnder.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
          </select>
        </label>
        <label style={block}><div style={lbl}>Shift</div>
          <select style={field} value={shift} onChange={(e) => setShift(e.target.value)} disabled={!canAssign}>
            <option value="A">Shift A</option><option value="B">Shift B</option><option value="C">Shift C</option>
          </select>
        </label>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          {canAssign && <button onClick={save} disabled={saving} style={saveBtn}>{saving ? 'Saving…' : '✓ Save'}</button>}
          <button onClick={onClose} style={cancelBtn}>{canAssign ? 'Cancel' : 'Close'}</button>
        </div>
        {!canAssign && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 10 }}>View only — you don't have permission to reassign.</div>}
      </div>
    </div>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      border: '1px solid var(--border-strong)', borderRadius: 10, padding: '9px 18px', fontSize: 14, fontWeight: 700,
      background: active ? 'var(--brand)' : 'var(--surface)', color: active ? '#fff' : 'var(--text-muted)',
    }}>{children}</button>
  );
}

function Stat({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', color: 'var(--text-faint)' }}>{label.toUpperCase()}</div>
      <div className="mono" style={{ fontWeight: 800, fontSize: 14, color: color ?? 'var(--text)' }}>{value}</div>
    </div>
  );
}

const avatar = (muted: boolean): React.CSSProperties => ({
  width: 42, height: 42, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 800, color: '#fff',
  background: muted ? 'var(--disconnected)' : 'linear-gradient(135deg,#3b5bfd,#6d83ff)',
});
const omcard = (status: string): React.CSSProperties => ({
  border: '1px solid var(--border)', borderRadius: 10, padding: 12,
  background: status === 'running' ? '#f3fbf6' : status === 'stopped' ? '#fdf3f3' : status === 'idle' ? '#fffaf0' : 'var(--surface-2)',
});
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(20,28,46,.45)', display: 'grid', placeItems: 'start center', paddingTop: '6vh', zIndex: 50, backdropFilter: 'blur(2px)' };
const modal: React.CSSProperties = { width: 'min(560px,92vw)', maxHeight: '84vh', overflowY: 'auto', padding: 24, animation: 'fadeUp .25s ease' };
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 5 };
const block: React.CSSProperties = { display: 'block', marginBottom: 12 };
const field: React.CSSProperties = { ...inputStyle, width: '100%' };
const saveBtn: React.CSSProperties = { background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const cancelBtn: React.CSSProperties = { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
