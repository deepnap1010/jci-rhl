// ============================================================
//  DASHBOARD PAGE  —  KPIs + time KPIs + pipeline + dept charts
// ============================================================
import { useMemo, useState, Fragment } from 'react';
import { useDashboard, useMachines, useJobs, usePeople, liveSummary, fmtLastSeen } from '../hooks/useData';
import type { MachineWithState, JobRow, PersonRow } from '../hooks/useData';
import { KpiCard, BarRow, StatusPill, fmtDuration } from '../components/ui';
import { Modal } from './JobTracking';
import { ROLE_LABELS } from '../config/nav';
import { DEPARTMENTS } from '@shared/types';
import type { Role } from '@shared/types';

type DeptStat = { dept: string; machines: number; production: number; efficiency: number };
type TimeMetric = 'running' | 'idle' | 'stopped' | 'downtime';
const TIME_META: Record<TimeMetric, { label: string; color: string }> = {
  running: { label: 'Running Time', color: 'var(--running)' },
  idle: { label: 'Idle Time', color: 'var(--idle)' },
  stopped: { label: 'Stopped Time', color: 'var(--stopped)' },
  downtime: { label: 'Total Downtime', color: 'var(--accent-pink)' },
};
type KpiKind = 'production' | 'running' | 'efficiency' | 'jobs' | 'employees' | 'alerts';

export default function Dashboard() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const day = dateFrom || dateTo;        // a single date is enough (whole day)
  const endDay = dateTo || dateFrom;
  const ranged = !!day;
  const rangeLabel = dateFrom && dateTo && dateFrom !== dateTo ? `${dateFrom} → ${dateTo}` : day;
  const fromISO = ranged ? new Date(`${day}T00:00`).toISOString() : undefined;
  const toISO = ranged ? new Date(`${endDay}T23:59`).toISOString() : undefined;
  const kpi = useDashboard(fromISO, toISO);
  const { machines } = useMachines();
  const { data: jobs } = useJobs();
  const people = usePeople();
  const { live: liveNow, lastUpdated } = liveSummary(machines);
  const [deptModal, setDeptModal] = useState<'output' | 'efficiency' | null>(null);
  const [timeModal, setTimeModal] = useState<TimeMetric | null>(null);
  const [kpiModal, setKpiModal] = useState<KpiKind | null>(null);

  // count machines per department for the pipeline strip
  const byDept = useMemo(() => {
    const map = new Map<string, number>();
    machines.forEach((m) => map.set(m.department, (map.get(m.department) || 0) + 1));
    return DEPARTMENTS.map((d) => ({ dept: d, count: map.get(d) || 0 }));
  }, [machines]);

  const deptStats = kpi?.deptStats ?? [];
  const maxOut = Math.max(1, ...deptStats.map((o) => o.production));

  return (
    <div style={{ padding: '0 28px 40px' }}>
      {/* time-range filter — Live by default, or a historical snapshot for a date range */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>View</span>
        {ranged ? (
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)' }}>History · {rangeLabel}</span>
        ) : liveNow ? (
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--running)' }}>● Live</span>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--idle)' }}>● Last updated {fmtLastSeen(lastUpdated)}</span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <span style={dLbl}>DATE</span>
          <input type="date" style={dInput} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span style={dLbl}>TO (optional)</span>
          <input type="date" style={dInput} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ border: 'none', background: 'none', color: 'var(--brand)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Reset to live</button>
          )}
        </div>
      </div>

      {/* KPI row 1 */}
      <div className="grid-stats-6" style={{ gap:12 }}>
        <KpiCard label="Total Production" value={(kpi?.totalProduction ?? 0).toLocaleString()} sub={`${kpi?.totalMachines ?? 0} machines`} accent="var(--accent-blue)" onClick={() => setKpiModal('production')} />
        <KpiCard label="Running" value={`${kpi?.running ?? 0}/${kpi?.totalMachines ?? 0}`} sub={`${kpi?.idle ?? 0} idle`} accent="var(--accent-green)" onClick={() => setKpiModal('running')} />
        <KpiCard label="Avg Efficiency" value={`${kpi?.avgEfficiency ?? 0}%`} sub="From live" accent="var(--accent-amber)" onClick={() => setKpiModal('efficiency')} />
        <KpiCard label="Active Jobs" value={kpi?.activeJobs ?? 0} sub={`${kpi?.pendingJobs ?? 0} pending`} accent="var(--accent-teal)" onClick={() => setKpiModal('jobs')} />
        <KpiCard label="Employees" value={kpi?.employees ?? 0} sub="On the floor" accent="var(--accent-purple)" onClick={() => setKpiModal('employees')} />
        <KpiCard label="Alerts" value={kpi?.alerts ?? 0} sub="Stopped machines" accent="var(--accent-red)" onClick={() => setKpiModal('alerts')} />
      </div>

      {/* KPI row 2 — time based */}
      <div className="grid-stats-4" style={{ gap: 12, marginTop: 12 }}>
        <KpiCard label="Running Time" value={fmtDuration(kpi?.runningSec ?? 0)} sub="Machine-hours today" accent="var(--accent-green)" onClick={() => setTimeModal('running')} />
        <KpiCard label="Idle Time" value={fmtDuration(kpi?.idleSec ?? 0)} sub="Today" accent="var(--accent-amber)" onClick={() => setTimeModal('idle')} />
        <KpiCard label="Stopped Time" value={fmtDuration(kpi?.stoppedSec ?? 0)} sub="Today" accent="var(--accent-red)" onClick={() => setTimeModal('stopped')} />
        <KpiCard label="Total Downtime" value={fmtDuration(kpi?.downtimeSec ?? 0)} sub="Idle + stopped" accent="var(--accent-pink)" onClick={() => setTimeModal('downtime')} />
      </div>

      {/* pipeline */}
      <div className="card" style={{ padding: 18, marginTop: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>🏭 Production Pipeline — {machines.length} Machines</div>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
          {byDept.map((d, i) => {
            const active = d.count > 0;
            return (
              <Fragment key={d.dept}>
                <div style={{
                  flex: 'none', width: 96, minHeight: 80,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                  textAlign: 'center', borderRadius: 12, padding: '10px 8px',
                  border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
                  background: active ? 'var(--surface)' : 'var(--surface-2)',
                }}>
                  <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1, color: active ? PIPE_COLORS[i % PIPE_COLORS.length] : 'var(--text-faint)' }}>{d.count}</div>
                  <div style={{ fontSize: 10.5, lineHeight: 1.2, color: active ? 'var(--text-muted)' : 'var(--text-faint)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{d.dept}</div>
                </div>
                {i < byDept.length - 1 && (
                  <div style={{ flex: 'none', display: 'flex', alignItems: 'center', color: 'var(--text-faint)' }}>→</div>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* dept output + efficiency */}
      <div className="grid-two" style={{ gap: 16, marginTop: 18 }}>
        <div className="card hoverable" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 700 }}>📊 Department Output</div>
            {deptStats.length > 0 && <button onClick={() => setDeptModal('output')} style={detailBtn}>Full detail →</button>}
          </div>
          {deptStats.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No production yet — run the simulator to see live output.</div>
          ) : (
            deptStats.map((o) => <BarRow key={o.dept} label={o.dept} value={o.production} max={maxOut} suffix="mtr" color="#3b5bfd" />)
          )}
        </div>

        <div className="card hoverable" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 700 }}>⚡ Department Efficiency</div>
            {deptStats.length > 0 && <button onClick={() => setDeptModal('efficiency')} style={detailBtn}>Full detail →</button>}
          </div>
          {deptStats.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No data yet.</div>
          ) : (
            deptStats.map((o) => (
              <BarRow key={o.dept} label={o.dept} value={o.efficiency} max={100} suffix="%"
                color={o.efficiency >= 70 ? '#16a34a' : o.efficiency >= 40 ? '#f59e0b' : '#ef4444'} />
            ))
          )}
        </div>
      </div>

      {deptModal && (
        <DeptDetailModal mode={deptModal} deptStats={deptStats} machines={machines} onClose={() => setDeptModal(null)} />
      )}
      {timeModal && <TimeBreakdownModal metric={timeModal} machines={machines} onClose={() => setTimeModal(null)} />}
      {kpiModal && <KpiDetailModal kind={kpiModal} machines={machines} jobs={jobs} people={people} onClose={() => setKpiModal(null)} />}
    </div>
  );
}

// ---- drill-down for the 6 top KPI cards ----
function KpiDetailModal({
  kind, machines, jobs, people, onClose,
}: { kind: KpiKind; machines: MachineWithState[]; jobs: JobRow[]; people: PersonRow[]; onClose: () => void }) {
  // ---- Active Jobs ----
  if (kind === 'jobs') {
    const order = { inProgress: 0, pending: 1, completed: 2 } as const;
    const rows = [...jobs].sort((a, b) => order[a.status] - order[b.status] || b.pct - a.pct);
    const active = jobs.filter((j) => j.status === 'inProgress').length;
    const pending = jobs.filter((j) => j.status === 'pending').length;
    return (
      <Modal title="📋 Jobs — full list" onClose={onClose}>
        <div className="grid-stats-3" style={{ gap: 10, marginBottom: 18 }}>
          <Mini label="Active" value={String(active)} />
          <Mini label="Pending" value={String(pending)} />
          <Mini label="Total jobs" value={String(jobs.length)} />
        </div>
        <table className="tbl">
          <thead><tr><th>JOB</th><th>FABRIC</th><th>STAGE</th><th>MACHINE</th><th>OPERATOR</th><th className="r">TARGET</th><th className="r">DONE</th><th className="r">PROGRESS</th><th>STATUS</th></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No jobs yet.</td></tr>
            ) : rows.map((j) => (
              <tr key={j._id}>
                <td className="mono" style={{ fontWeight: 700 }}>{j.jobNumber}</td>
                <td>{j.fabricName || '—'}</td>
                <td style={{ color: 'var(--text-muted)' }}>{j.stage}</td>
                <td className="mono">{j.machineCode || '—'}</td>
                <td>{j.operatorName || '—'}</td>
                <td className="r mono">{j.targetProduction.toLocaleString()}</td>
                <td className="r mono">{j.achievedProduction.toLocaleString()}</td>
                <td className="r mono" style={{ fontWeight: 700, color: j.pct >= 100 ? 'var(--running)' : j.pct >= 50 ? 'var(--accent-amber)' : 'var(--text-muted)' }}>{j.pct}%</td>
                <td><JobStatusPill status={j.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>
    );
  }

  // ---- Employees on the floor ----
  if (kind === 'employees') {
    const order: Record<string, number> = { plantHead: 0, prodManager: 1, supervisor: 2, operator: 3 };
    const floor = [...people]
      .filter((p) => p.role === 'operator' || p.role === 'supervisor')
      .sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || a.name.localeCompare(b.name));
    const operators = floor.filter((p) => p.role === 'operator').length;
    const supervisors = floor.filter((p) => p.role === 'supervisor').length;
    return (
      <Modal title="👷 On the floor" onClose={onClose}>
        <div className="grid-stats-3" style={{ gap: 10, marginBottom: 18 }}>
          <Mini label="On the floor" value={String(floor.length)} />
          <Mini label="Operators" value={String(operators)} />
          <Mini label="Supervisors" value={String(supervisors)} />
        </div>
        <table className="tbl">
          <thead><tr><th>NAME</th><th>ROLE</th><th className="r">MACHINES</th><th>EMAIL</th></tr></thead>
          <tbody>
            {floor.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No operators or supervisors in your scope.</td></tr>
            ) : floor.map((p) => (
              <tr key={p._id}>
                <td style={{ fontWeight: 700 }}>{p.name}</td>
                <td style={{ color: 'var(--text-muted)' }}>{ROLE_LABELS[p.role as Role] ?? p.role}</td>
                <td className="r mono">{p.assignedMachineIds.length}</td>
                <td style={{ color: 'var(--text-muted)' }}>{p.email || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>
    );
  }

  // ---- machine-based: production / efficiency / running / alerts ----
  let rows = machines.map((m) => ({
    code: m.code, department: m.department, status: m.status,
    production: m.state?.production ?? 0, efficiency: m.state?.efficiency ?? 0,
    downtime: m.state?.downtimeSec ?? ((m.state?.idleSec ?? 0) + (m.state?.stoppedSec ?? 0)),
  }));
  let title = '';
  let highlight: 'production' | 'efficiency' | null = null;
  if (kind === 'production') {
    rows.sort((a, b) => b.production - a.production); title = '📦 Total Production — by machine'; highlight = 'production';
  } else if (kind === 'efficiency') {
    rows.sort((a, b) => b.efficiency - a.efficiency); title = '⚡ Avg Efficiency — by machine'; highlight = 'efficiency';
  } else if (kind === 'running') {
    const ord: Record<string, number> = { running: 0, idle: 1, stopped: 2, disconnected: 3 };
    rows.sort((a, b) => (ord[a.status] ?? 9) - (ord[b.status] ?? 9) || b.production - a.production);
    title = '🟢 Machine status';
  } else {
    rows = rows.filter((r) => r.status === 'stopped' || r.status === 'disconnected').sort((a, b) => b.downtime - a.downtime);
    title = '🔔 Alerts — stopped / offline machines';
  }
  const totalProd = rows.reduce((s, r) => s + r.production, 0);
  const avgEff = rows.length ? Math.round(rows.reduce((s, r) => s + r.efficiency, 0) / rows.length) : 0;
  const runningCount = rows.filter((r) => r.status === 'running').length;
  const summary = kind === 'alerts'
    ? [<Mini key="a" label="Needs attention" value={String(rows.length)} />, <Mini key="b" label="Stopped" value={String(rows.filter((r) => r.status === 'stopped').length)} />, <Mini key="c" label="Offline" value={String(rows.filter((r) => r.status === 'disconnected').length)} />]
    : [<Mini key="a" label="Machines" value={String(rows.length)} />, <Mini key="b" label="Running" value={String(runningCount)} />, kind === 'efficiency' ? <Mini key="c" label="Avg efficiency" value={`${avgEff}%`} /> : <Mini key="c" label="Total production" value={`${totalProd.toLocaleString()} mtr`} />];
  return (
    <Modal title={title} onClose={onClose}>
      <div className="grid-stats-3" style={{ gap: 10, marginBottom: 18 }}>{summary}</div>
      <table className="tbl">
        <thead><tr><th>MACHINE</th><th>DEPARTMENT</th><th>STATUS</th><th className="r">PRODUCTION</th><th className="r">EFFICIENCY</th><th className="r">DOWNTIME</th></tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>{kind === 'alerts' ? 'No alerts — everything is running. 🎉' : 'No machines in your scope.'}</td></tr>
          ) : rows.map((r) => (
            <tr key={r.code}>
              <td className="mono" style={{ fontWeight: 700 }}>{r.code}</td>
              <td style={{ color: 'var(--text-muted)' }}>{r.department}</td>
              <td><StatusPill status={r.status} /></td>
              <td className="r mono" style={highlight === 'production' ? { fontWeight: 800, background: 'var(--surface-2)' } : undefined}>{r.production.toLocaleString()}</td>
              <td className="r mono" style={{ color: effColor(r.efficiency), fontWeight: highlight === 'efficiency' ? 800 : 700, background: highlight === 'efficiency' ? 'var(--surface-2)' : undefined }}>{r.efficiency}%</td>
              <td className="r mono" style={{ color: r.downtime > 0 ? 'var(--stopped)' : 'var(--text-faint)' }}>{fmtDuration(r.downtime)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

function JobStatusPill({ status }: { status: JobRow['status'] }) {
  const map = {
    inProgress: { label: 'In progress', color: 'var(--running)' },
    pending: { label: 'Pending', color: 'var(--accent-amber)' },
    completed: { label: 'Completed', color: 'var(--text-muted)' },
  } as const;
  const m = map[status];
  return <span style={{ fontSize: 12, fontWeight: 700, color: m.color }}>● {m.label}</span>;
}

// ---- per-machine time breakdown (opened by clicking a time KPI) ----
interface TRow { code: string; department: string; status: MachineWithState['status']; running: number; idle: number; stopped: number; downtime: number }
function TimeBreakdownModal({ metric, machines, onClose }: { metric: TimeMetric; machines: MachineWithState[]; onClose: () => void }) {
  const meta = TIME_META[metric];
  const rows: TRow[] = machines
    .map((m) => {
      const running = m.state?.runningSec || 0;
      const idle = m.state?.idleSec || 0;
      const stopped = m.state?.stoppedSec || 0;
      const downtime = m.state?.downtimeSec || idle + stopped;
      return { code: m.code, department: m.department, status: m.status, running, idle, stopped, downtime };
    })
    .filter((r) => r.running || r.idle || r.stopped || r.downtime)
    .sort((a, b) => b[metric] - a[metric]);
  const tot = rows.reduce(
    (t, r) => ({ running: t.running + r.running, idle: t.idle + r.idle, stopped: t.stopped + r.stopped, downtime: t.downtime + r.downtime }),
    { running: 0, idle: 0, stopped: 0, downtime: 0 }
  );
  const cell = (key: TimeMetric, v: number) => (
    <td className="r mono" style={key === metric ? { color: meta.color, fontWeight: 800, background: 'var(--surface-2)' } : undefined}>{fmtDuration(v)}</td>
  );
  return (
    <Modal title={`⏱ ${meta.label} — by machine`} onClose={onClose}>
      <div className="grid-stats-3" style={{ gap: 10, marginBottom: 18 }}>
        <Mini label="Machines with time" value={String(rows.length)} />
        <Mini label={meta.label} value={fmtDuration(tot[metric])} />
        <Mini label="Total Downtime" value={fmtDuration(tot.downtime)} />
      </div>
      <table className="tbl">
        <thead><tr>
          <th>MACHINE</th><th>DEPARTMENT</th><th>STATUS</th>
          <th className="r">RUNNING</th><th className="r">IDLE</th><th className="r">STOPPED</th><th className="r">DOWNTIME</th>
        </tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No machine time recorded for this view.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.code}>
              <td className="mono" style={{ fontWeight: 700 }}>{r.code}</td>
              <td>{r.department}</td>
              <td><StatusPill status={r.status} /></td>
              {cell('running', r.running)}
              {cell('idle', r.idle)}
              {cell('stopped', r.stopped)}
              {cell('downtime', r.downtime)}
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border-strong)', fontWeight: 800 }}>
              <td colSpan={3}>TOTAL</td>
              <td className="r mono">{fmtDuration(tot.running)}</td>
              <td className="r mono">{fmtDuration(tot.idle)}</td>
              <td className="r mono">{fmtDuration(tot.stopped)}</td>
              <td className="r mono">{fmtDuration(tot.downtime)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </Modal>
  );
}

// ---- full-detail modal for Department Output / Efficiency ----
const effColor = (e: number) => (e >= 70 ? 'var(--running)' : e >= 40 ? 'var(--accent-amber)' : 'var(--stopped)');

function DeptDetailModal({
  mode, deptStats, machines, onClose,
}: { mode: 'output' | 'efficiency'; deptStats: DeptStat[]; machines: MachineWithState[]; onClose: () => void }) {
  const isOutput = mode === 'output';
  const depts = [...deptStats].sort((a, b) => (isOutput ? b.production - a.production : b.efficiency - a.efficiency));
  const maxMetric = Math.max(1, ...depts.map((d) => (isOutput ? d.production : d.efficiency)));
  const totalProd = depts.reduce((s, d) => s + d.production, 0);
  const totalMachines = depts.reduce((s, d) => s + d.machines, 0);
  const avgEff = depts.length ? Math.round(depts.reduce((s, d) => s + d.efficiency, 0) / depts.length) : 0;
  const rankedMachines = [...machines].sort((a, b) =>
    isOutput ? (b.state?.production ?? 0) - (a.state?.production ?? 0) : (b.state?.efficiency ?? 0) - (a.state?.efficiency ?? 0)
  );
  return (
    <Modal title={isOutput ? '📊 Department Output — Full Detail' : '⚡ Department Efficiency — Full Detail'} onClose={onClose}>
      <div className="grid-stats-3" style={{ gap: 10, marginBottom: 18 }}>
        <Mini label="Departments" value={String(depts.length)} />
        <Mini label="Total Production" value={`${totalProd.toLocaleString()} mtr`} />
        <Mini label="Avg Efficiency" value={`${avgEff}%`} />
      </div>
      <div style={sectionLabel}>BY DEPARTMENT · {totalMachines} machines</div>
      <table className="tbl" style={{ marginBottom: 18 }}>
        <thead><tr><th>DEPARTMENT</th><th className="r">MACHINES</th><th className="r">PRODUCTION</th><th className="r">EFFICIENCY</th><th style={{ width: '34%' }}>{isOutput ? 'OUTPUT' : 'EFFICIENCY'}</th></tr></thead>
        <tbody>
          {depts.map((d) => {
            const metric = isOutput ? d.production : d.efficiency;
            const w = Math.max(2, (metric / maxMetric) * 100);
            const barColor = isOutput ? 'var(--brand)' : effColor(d.efficiency);
            return (
              <tr key={d.dept}>
                <td style={{ fontWeight: 700 }}>{d.dept}</td>
                <td className="r mono">{d.machines}</td>
                <td className="r mono">{d.production.toLocaleString()}</td>
                <td className="r mono" style={{ color: effColor(d.efficiency), fontWeight: 700 }}>{d.efficiency}%</td>
                <td><div className="pbar"><span style={{ width: `${w}%`, background: barColor }} /></div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={sectionLabel}>BY MACHINE</div>
      <table className="tbl">
        <thead><tr><th>MACHINE</th><th>DEPARTMENT</th><th>STATUS</th><th className="r">PRODUCTION</th><th className="r">EFF</th></tr></thead>
        <tbody>
          {rankedMachines.map((m) => (
            <tr key={m._id}>
              <td className="mono" style={{ fontWeight: 700 }}>{m.code}</td>
              <td style={{ color: 'var(--text-muted)' }}>{m.department}</td>
              <td><StatusPill status={m.status} /></td>
              <td className="r mono">{(m.state?.production ?? 0).toLocaleString()}</td>
              <td className="r mono" style={{ color: effColor(m.state?.efficiency ?? 0), fontWeight: 700 }}>{m.state?.efficiency ?? 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', color: 'var(--text-faint)' }}>{label.toUpperCase()}</div>
      <div className="mono" style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

const detailBtn: React.CSSProperties = { border: 'none', background: 'none', color: 'var(--brand)', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text-faint)', marginBottom: 8 };

const PIPE_COLORS = ['#3b5bfd', '#f59e0b', '#16a34a', '#0d9488', '#8b5cf6', '#ec4899', '#ef4444', '#06b6d4'];
const dLbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-faint)' };
const dInput: React.CSSProperties = { border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 10px', fontSize: 13, background: 'var(--surface)', color: 'var(--text)', outline: 'none' };
