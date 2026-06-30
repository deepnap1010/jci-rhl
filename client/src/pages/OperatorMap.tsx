// ============================================================
//  OPERATOR MAP PAGE  —  machines grouped by operator / supervisor
//  Click a machine to see its live details and reassign its
//  operator / supervisor / shift right from here.
//  EKC re-skin — visual layer only, logic unchanged.
// ============================================================
import { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { useOperatorMap, useMachines, useJobs, usePeople, useOrg } from '../hooks/useData';
import type { OrgNode } from '../hooks/useData';
import { Metric } from '../components/ui';           // pure helper — stays shared
import { StatusPill, Avatar } from '../components/ekc-ui'; // EKC, theme-aware
import { useModalDismiss } from '../hooks/useModalDismiss';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/auth';
import { can } from '@shared/permissions';
import { api } from '../api/client';
import { cn } from '../lib/utils';

// per-status tint for the clickable machine tiles (decorative, theme-aware)
const tileTint = (status: string) =>
  status === 'running' ? 'bg-running/5' :
  status === 'stopped' ? 'bg-stopped/5' :
  status === 'idle' ? 'bg-idle/5' : 'bg-raised';

export default function OperatorMap() {
  const [by, setBy] = useState<'operator' | 'supervisor'>('operator');
  const { data, reload } = useOperatorMap(by);
  const [sel, setSel] = useState<string | null>(null);

  return (
    <div className="px-5 sm:px-7 pt-1 pb-10 space-y-4">
      {/* view toggle — segmented control */}
      <div className="inline-flex items-center gap-1 bg-base border border-line rounded-xl p-1">
        {(['operator', 'supervisor'] as const).map((opt) => (
          <button
            key={opt}
            onClick={() => setBy(opt)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors',
              by === opt ? 'bg-accent text-white shadow-sm' : 'text-steel hover:text-primary',
            )}
          >
            By {opt === 'operator' ? 'Operator' : 'Supervisor'}
          </button>
        ))}
      </div>

      {data.groups.length === 0 ? (
        <div className="panel p-10 text-center text-steel">No assignments in your scope.</div>
      ) : (
        data.groups.map((g) => (
          <div key={g.key} className="panel p-4">
            {/* group header */}
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-3">
                <Avatar name={g.name === '—' ? '' : g.name} size={42} />
                <div>
                  <div className="font-extrabold text-[15px] text-primary">{g.name}</div>
                  <div className="text-xs text-steel">{g.code ?? (by === 'operator' ? 'Operator' : 'Supervisor')}</div>
                </div>
              </div>
              <div className="flex gap-6">
                <Stat label="Machines" value={g.stats.machines} />
                <Stat label="Running" value={g.stats.running} className="text-running" />
                <Stat label="Production" value={`${(g.stats.production / 1000).toFixed(1)}K mtr`} className="text-accent" />
                <Stat label="Avg Eff" value={`${g.stats.avgEff}%`} />
              </div>
            </div>

            {/* machine cards — click to control */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {g.machines.map((m) => (
                <div key={m._id} className={cn('card hoverable p-3 cursor-pointer min-w-0', tileTint(m.status))} onClick={() => setSel(m.code)} title="Open machine controls">
                  <div className="flex justify-between items-center gap-2 min-w-0">
                    <span className="data font-extrabold text-[13px] text-primary truncate">{m.code}</span>
                    <span className="shrink-0"><StatusPill status={m.status} /></span>
                  </div>
                  <div className="text-[11px] text-steel my-1 truncate">{m.type}</div>
                  <div className="data text-xs text-primary">
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
  // fallback so assigning is never dead-ended: if no operators report to the chosen supervisor in
  // the org chart, offer every operator instead (the cascade still leads when the org tree is set up).
  const allOperators = useMemo(() => people.filter((e) => e.role === 'operator').map((e) => ({ _id: e._id, name: e.name })), [people]);
  const operatorOptions = operatorsUnder.length ? operatorsUnder : allOperators;
  const operatorFallback = !!supervisorId && operatorsUnder.length === 0 && allOperators.length > 0;

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
    <div className="fixed inset-0 z-[1000] grid place-items-center p-5 bg-[rgba(15,23,42,.55)] backdrop-blur-sm" onClick={onClose}>
      <div className="panel relative w-full max-w-[560px] max-h-[88vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex justify-between items-center mb-1">
          <h2 className="data text-lg font-extrabold text-primary">{code}{m ? ` — ${m.name}` : ''}</h2>
          <button onClick={onClose} className="text-steel hover:text-primary transition-colors" aria-label="Close"><X size={20} /></button>
        </div>
        <div className="flex items-center gap-2.5 mb-3.5">
          {m && <StatusPill status={m.status} />}
          <span className="text-xs text-steel">{m?.department}</span>
        </div>

        {/* live details */}
        <div className="grid-stats-3 mb-4">
          <Metric label="Production" value={fmtK(s?.production ?? 0)} unit="mtr" />
          <Metric label="Speed" value={s?.speed ?? 0} unit="m/min" />
          <Metric label="Efficiency" value={`${s?.efficiency ?? 0}%`} tone={(s?.efficiency ?? 0) < 1 ? 'warm' : 'plain'} />
          <Metric label="Temperature" value={s?.temperature ?? 0} unit="°c" tone="warm" />
          <Metric label="Water Flow" value={s?.waterFlow ?? 0} unit="L/hr" tone="cool" />
          <Metric label="Downtime" value={Math.round((s?.downtimeSec ?? 0) / 60)} unit="min" tone="warm" />
        </div>

        {/* operator control */}
        <div className="text-[11px] font-extrabold tracking-[.06em] text-accent mt-1 mb-2.5">OPERATOR CONTROL</div>
        <label className="block mb-3"><div className="label mb-1.5">Supervisor</div>
          <select
            className="input"
            value={supervisorId}
            onChange={(e) => { setSupervisorId(e.target.value); setOperatorId(''); }} // clear operator — must belong to the new supervisor
            disabled={!canAssign}
          >
            <option value="">— Select supervisor —</option>
            {supervisors.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
          </select>
        </label>
        <label className="block mb-3"><div className="label mb-1.5">↳ Operator <span className="text-steel/60 font-normal normal-case">(optional)</span></div>
          <select className="input" value={operatorId} onChange={(e) => setOperatorId(e.target.value)} disabled={!canAssign || !supervisorId || operatorOptions.length === 0}>
            <option value="">
              {!supervisorId ? '— select a supervisor first —' : operatorOptions.length ? '— Select operator —' : 'No operators available'}
            </option>
            {operatorOptions.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
          </select>
          {operatorFallback && (
            <div className="text-[11px] text-steel/70 mt-1.5">
              No operators report to <b className="text-steel">{supervisors.find((s) => s._id === supervisorId)?.name || 'this supervisor'}</b> in the org chart — showing all operators so you can still assign.
            </div>
          )}
        </label>
        <label className="block mb-3"><div className="label mb-1.5">Shift</div>
          <select className="input" value={shift} onChange={(e) => setShift(e.target.value)} disabled={!canAssign}>
            <option value="A">Shift A</option><option value="B">Shift B</option><option value="C">Shift C</option>
          </select>
        </label>

        <div className="flex gap-2.5 mt-1">
          {canAssign && <button onClick={save} disabled={saving} className="bg-accent text-white rounded-lg px-4 py-2.5 font-bold text-sm disabled:opacity-60">{saving ? 'Saving…' : '✓ Save'}</button>}
          <button onClick={onClose} className="bg-base border border-line text-steel rounded-lg px-4 py-2.5 font-bold text-sm hover:text-primary transition-colors">{canAssign ? 'Cancel' : 'Close'}</button>
        </div>
        {!canAssign && <div className="text-xs text-steel mt-2.5">View only — you don't have permission to reassign.</div>}
      </div>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="text-right">
      <div className="text-[10px] font-bold tracking-wide uppercase text-steel">{label}</div>
      <div className={cn('data font-extrabold text-sm text-primary', className)}>{value}</div>
    </div>
  );
}
