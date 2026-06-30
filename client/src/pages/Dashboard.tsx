// client/src/pages/Dashboard.tsx
// ============================================================
//  DASHBOARD PAGE  —  EKC re-skin (Tailwind + theme tokens)
//  KPIs + time KPIs + production pipeline + dept charts + 4 modals.
//  Visual layer only — all data hooks, computed values, modal
//  logic and date-range behaviour are unchanged from the original.
// ============================================================
import { useMemo, useState, Fragment, type ReactNode, type ComponentType, type CSSProperties } from 'react';
import { useDashboard, useMachines, useJobs, usePeople, liveSummary, fmtLastSeen } from '../hooks/useData';
import type { MachineWithState, JobRow, PersonRow } from '../hooks/useData';
import { fmtDuration } from '../components/ui';           // pure helper — stays shared
import { StatusPill, LiveDot } from '../components/ekc-ui'; // EKC, theme-aware
import { Donut, Legend, Distribution, CategoryBars } from '../components/charts';
import { Modal } from './JobTracking';
import { cn } from '../lib/utils';
import { ROLE_LABELS } from '../config/nav';
import { DEPARTMENTS } from '@shared/types';
import type { Role, MachineBreakdown } from '@shared/types';
import {
  Package, Activity, Gauge, ClipboardList, Users, Bell,
  Play, Pause, CircleSlash, Clock, Factory, BarChart3, Zap,
  AlertTriangle, ArrowUpRight, Cpu,
} from 'lucide-react';

// EKC accent palette (applied inline like EKC's own dashboard does).
const TEAL = '#0D9488', AMBER = '#D97706', RED = '#DC2626', STEEL = '#64748B', SLATE = '#94A3B8', INDIGO = '#6366F1', VIOLET = '#8B5CF6';
// loosely-typed lucide icon (JCI declares lucide-react as `any`; never import LucideIcon)
type IconType = ComponentType<{ size?: number; className?: string; style?: CSSProperties }>;
const effColor = (e: number) => (e >= 70 ? TEAL : e >= 40 ? AMBER : RED);
// per-stage accents for the pipeline strip (decorative, EKC-leaning hues)
const PIPE_COLORS = [TEAL, INDIGO, AMBER, VIOLET, '#0EA5E9', '#EC4899', RED, '#06B6D4'];

type DeptStat = { dept: string; machines: number; production: number; efficiency: number };
type TimeMetric = 'running' | 'idle' | 'stopped' | 'downtime';
const TIME_META: Record<TimeMetric, { label: string; color: string }> = {
  running: { label: 'Running Time', color: TEAL },
  idle: { label: 'Idle Time', color: AMBER },
  stopped: { label: 'Stopped Time', color: RED },
  downtime: { label: 'Total Downtime', color: AMBER },
};
type KpiKind = 'production' | 'running' | 'efficiency' | 'jobs' | 'employees' | 'alerts';

export default function Dashboard() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const day = dateFrom || dateTo;        // a single date is enough (whole day)
  const endDay = dateTo || dateFrom;
  const ranged = !!day;
  const rangeLabel = dateFrom && dateTo && dateFrom !== dateTo ? `${dateFrom} → ${dateTo}` : day;
  // compact range for the small KPI sub-lines, e.g. "07 Jun – 11 Jun"
  const fmtD = (s: string) => new Date(`${s}T00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const periodShort = ranged ? (dateFrom && dateTo && dateFrom !== dateTo ? `${fmtD(dateFrom)} – ${fmtD(endDay)}` : fmtD(day)) : '';
  const fromISO = ranged ? new Date(`${day}T00:00`).toISOString() : undefined;
  const toISO = ranged ? new Date(`${endDay}T23:59`).toISOString() : undefined;
  const kpi = useDashboard(fromISO, toISO);
  // live feed offline → server returns the last available day's values; relabel so "today" isn't a lie
  const stale = !ranged && !!kpi?.stale;
  const asOfLabel = kpi?.lastUpdated
    ? new Date(kpi.lastUpdated).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';
  const asOfDate = kpi?.lastUpdated ? new Date(kpi.lastUpdated).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '';
  // label used in the drill-down titles: a date range, the last recorded day, or "today" when live
  const modalPeriod = ranged ? periodShort : stale ? asOfDate : 'today';
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
  // machine-status mix for the EKC-style donut + department distribution totals
  const totalMachines = kpi?.totalMachines ?? 0;
  const offline = Math.max(0, totalMachines - (kpi?.running ?? 0) - (kpi?.idle ?? 0) - (kpi?.stopped ?? 0));
  const statusSeg = [
    { label: 'Running', value: kpi?.running ?? 0, color: TEAL },
    { label: 'Idle', value: kpi?.idle ?? 0, color: AMBER },
    { label: 'Stopped', value: kpi?.stopped ?? 0, color: RED },
    { label: 'Offline', value: offline, color: SLATE },
  ].filter((s) => s.value > 0);
  const totalProd = deptStats.reduce((s, d) => s + d.production, 0);
  const avgEff = deptStats.length ? Math.round(deptStats.reduce((s, d) => s + d.efficiency, 0) / deptStats.length) : 0;

  return (
    <div className="px-5 sm:px-7 pt-1 pb-10 space-y-4">
      {/* time-range filter — Live by default, or a historical snapshot for a date range */}
      <div className="panel px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="label">View</span>
        {ranged ? (
          <span className="text-xs font-bold text-accent">History · {rangeLabel}</span>
        ) : liveNow ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-running"><LiveDot /> Live</span>
        ) : (
          <span title={`Last updated ${fmtLastSeen(lastUpdated)}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-idle">
            <span className="w-2 h-2 rounded-full bg-idle" /> Last updated {fmtLastSeen(lastUpdated)}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <span className="label">Date</span>
          <input type="date" className="bg-base border border-line rounded-lg px-2.5 py-1.5 text-sm text-primary outline-none focus:border-accent" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span className="label">To (optional)</span>
          <input type="date" className="bg-base border border-line rounded-lg px-2.5 py-1.5 text-sm text-primary outline-none focus:border-accent" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-accent text-xs font-semibold hover:underline">Reset to live</button>
          )}
        </div>
      </div>

      {/* live feed offline → values shown are the last recorded day, not "today" */}
      {stale && (
        <div className="rounded-card border border-idle/30 bg-idle/10 text-idle px-4 py-2.5 text-sm font-medium flex items-center gap-2">
          <AlertTriangle size={15} className="shrink-0" />
          Live feed offline — showing the last recorded values{asOfLabel ? ` as of ${asOfLabel}` : ''}. They&rsquo;ll refresh automatically when telemetry resumes.
        </div>
      )}

      {/* KPI row 1 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label={ranged ? 'Total Production' : stale ? 'Production (last day)' : 'Production Today'} value={(kpi?.todayProduction ?? 0).toLocaleString()} sub={ranged ? `${periodShort} · ${kpi?.totalMachines ?? 0} machines` : stale ? `as of ${asOfLabel}` : `${kpi?.totalMachines ?? 0} machines`} color={INDIGO} icon={Package} onClick={() => setKpiModal('production')} />
        <KpiCard label="Running" value={`${kpi?.running ?? 0}/${kpi?.totalMachines ?? 0}`} sub={stale ? `${kpi?.idle ?? 0} idle · last seen` : `${kpi?.idle ?? 0} idle`} color={kpi?.running ? TEAL : STEEL} icon={Activity} onClick={() => setKpiModal('running')} />
        <KpiCard label="Avg Efficiency" value={`${kpi?.avgEfficiency ?? 0}%`} sub={ranged ? 'Time-weighted · period' : stale ? 'Time-weighted · last day' : 'Time-weighted · today'} color={effColor(kpi?.avgEfficiency ?? 0)} icon={Gauge} onClick={() => setKpiModal('efficiency')} />
        <KpiCard label="Active Jobs" value={kpi?.activeJobs ?? 0} sub={`${kpi?.pendingJobs ?? 0} pending`} color={VIOLET} icon={ClipboardList} onClick={() => setKpiModal('jobs')} />
        <KpiCard label="Employees" value={kpi?.employees ?? 0} sub="On the floor" color={INDIGO} icon={Users} onClick={() => setKpiModal('employees')} />
        <KpiCard label="Alerts" value={kpi?.alerts ?? 0} sub="Stopped machines" color={kpi?.alerts ? RED : TEAL} icon={Bell} onClick={() => setKpiModal('alerts')} />
      </div>

      {/* KPI row 2 — time based (plain tiles, for hierarchy below the tinted hero row) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard tint={false} label="Running Time" value={fmtDuration(kpi?.runningSec ?? 0)} sub={ranged ? `Machine-hours · ${periodShort}` : stale ? 'Machine-hours · last day' : 'Machine-hours today'} color={TEAL} icon={Play} onClick={() => setTimeModal('running')} />
        <KpiCard tint={false} label="Idle Time" value={fmtDuration(kpi?.idleSec ?? 0)} sub={ranged ? periodShort : stale ? 'Last recorded day' : 'Today'} color={AMBER} icon={Pause} onClick={() => setTimeModal('idle')} />
        <KpiCard tint={false} label="Stopped Time" value={fmtDuration(kpi?.stoppedSec ?? 0)} sub={ranged ? periodShort : stale ? 'Last recorded day' : 'Today'} color={RED} icon={CircleSlash} onClick={() => setTimeModal('stopped')} />
        <KpiCard tint={false} label="Total Downtime" value={fmtDuration(kpi?.downtimeSec ?? 0)} sub={ranged ? `Idle + stopped · ${periodShort}` : stale ? 'Idle + stopped · last day' : 'Idle + stopped · today'} color={AMBER} icon={Clock} onClick={() => setTimeModal('downtime')} />
      </div>

      {/* EKC-style insight row — machine-status donut + department distributions */}
      <div className="grid lg:grid-cols-3 gap-5">
        <InsightPanel icon={Cpu} title="Machine Status" subtitle={`${totalMachines} machines · ${kpi?.running ?? 0} running now`} onClick={() => setKpiModal('running')}>
          <div className="flex items-center gap-4">
            <Donut segments={statusSeg} size={132} thickness={17} emptyColor={SLATE}>
              <span className="data text-2xl font-bold text-primary leading-none">{totalMachines}</span>
              <span className="label mt-1">machines</span>
            </Donut>
            <div className="flex-1 min-w-0">
              {statusSeg.length === 0
                ? <div className="text-sm text-steel">No machines in scope.</div>
                : <Legend rows={statusSeg} total={totalMachines} format={(v) => String(v)} scroll={false} />}
            </div>
          </div>
        </InsightPanel>

        <InsightPanel icon={BarChart3} title="Department Output" subtitle={`${deptStats.length} stages · ${totalProd.toLocaleString()} mtr`} onClick={() => deptStats.length > 0 && setDeptModal('output')}>
          {deptStats.length === 0
            ? <div className="text-sm text-steel">No production yet — run the simulator to see live output.</div>
            : <Distribution rows={deptStats.map((d) => ({ label: d.dept, value: d.production }))} total={totalProd} color={TEAL} unit="mtr" />}
        </InsightPanel>

        <InsightPanel icon={Zap} title="Department Efficiency" subtitle={`Avg ${avgEff}% · ${deptStats.length} stages`} onClick={() => deptStats.length > 0 && setDeptModal('efficiency')}>
          {deptStats.length === 0
            ? <div className="text-sm text-steel">No data yet.</div>
            : <CategoryBars data={deptStats.map((d) => ({ label: d.dept, value: d.efficiency, color: effColor(d.efficiency) }))} max={100} suffix="%" />}
        </InsightPanel>
      </div>

      {/* production pipeline */}
      <div className="panel p-5">
        <PanelHead icon={Factory} title="Production Pipeline" subtitle={`${machines.length} machines across ${byDept.length} stages`} />
        <div className="flex items-stretch gap-1.5 overflow-x-auto pb-2">
          {byDept.map((d, i) => {
            const active = d.count > 0;
            return (
              <Fragment key={d.dept}>
                <div className={cn(
                  'flex-none w-24 min-h-[80px] flex flex-col items-center justify-center gap-1 text-center rounded-card px-2 py-2.5 border',
                  active ? 'border-line bg-surface' : 'border-line/60 bg-raised',
                )}>
                  <div className="text-[22px] font-extrabold leading-none" style={{ color: active ? PIPE_COLORS[i % PIPE_COLORS.length] : SLATE }}>{d.count}</div>
                  <div className={cn('text-[10.5px] leading-tight line-clamp-2', active ? 'text-steel' : 'text-steel/50')}>{d.dept}</div>
                </div>
                {i < byDept.length - 1 && (
                  <div className="flex-none flex items-center text-steel/40">→</div>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      {deptModal && (
        <DeptDetailModal mode={deptModal} deptStats={deptStats} machines={machines} onClose={() => setDeptModal(null)} />
      )}
      {timeModal && <TimeBreakdownModal metric={timeModal} breakdown={kpi?.machineBreakdown ?? []} period={modalPeriod} onClose={() => setTimeModal(null)} />}
      {kpiModal && <KpiDetailModal kind={kpiModal} breakdown={kpi?.machineBreakdown ?? []} jobs={jobs} people={people} period={modalPeriod} onClose={() => setKpiModal(null)} />}
    </div>
  );
}

// ── EKC-style building blocks ───────────────────────────────

// Clickable KPI tile: EKC `card` look (label + colored icon, mono value,
// tiny sub) plus the clickable affordances EKC uses on drill-down panels.
function KpiCard({ label, value, sub, color, icon: Icon, onClick, tint = true }: {
  label: string; value: ReactNode; sub?: ReactNode; color: string; icon?: IconType; onClick?: () => void; tint?: boolean;
}) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
      style={tint ? { backgroundColor: `${color}14` } : undefined}
      className={cn('card p-3.5', clickable && 'cursor-pointer transition-all hover:border-accent/40 hover:shadow-md group focus:outline-none focus:ring-2 focus:ring-accent/30')}
    >
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        {Icon && <Icon size={15} style={{ color }} className="shrink-0 opacity-90 group-hover:scale-110 transition-transform" />}
      </div>
      <div className="data text-2xl font-bold mt-1.5 truncate" style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] text-steel mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

// EKC panel header: icon chip + title/subtitle + optional right action.
function PanelHead({ icon: Icon, title, subtitle, action }: { icon: IconType; title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start gap-2 mb-4">
      <span className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0"><Icon size={15} className="text-accent" /></span>
      <div className="flex-1 min-w-0">
        <h2 className="font-semibold text-sm text-primary leading-tight">{title}</h2>
        {subtitle && <p className="text-[11px] text-steel mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// EKC clickable insight panel — icon chip + title/subtitle + "Details ↗".
function InsightPanel({ icon: Icon, title, subtitle, onClick, children }: {
  icon: IconType; title: string; subtitle?: ReactNode; onClick?: () => void; children: ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
      className="panel p-5 cursor-pointer transition-all hover:border-accent/40 hover:shadow-md group focus:outline-none focus:ring-2 focus:ring-accent/30"
    >
      <PanelHead icon={Icon} title={title} subtitle={subtitle}
        action={<span className="text-[11px] font-medium text-steel/40 group-hover:text-accent transition-colors inline-flex items-center gap-0.5 shrink-0">Details <ArrowUpRight size={12} /></span>} />
      {children}
    </div>
  );
}

// ---- drill-down for the 6 top KPI cards ----
function KpiDetailModal({
  kind, breakdown, jobs, people, period, onClose,
}: { kind: KpiKind; breakdown: MachineBreakdown[]; jobs: JobRow[]; people: PersonRow[]; period: string; onClose: () => void }) {
  // ---- Active Jobs ----
  if (kind === 'jobs') {
    const order = { inProgress: 0, pending: 1, completed: 2 } as const;
    const rows = [...jobs].sort((a, b) => order[a.status] - order[b.status] || b.pct - a.pct);
    const active = jobs.filter((j) => j.status === 'inProgress').length;
    const pending = jobs.filter((j) => j.status === 'pending').length;
    return (
      <Modal wide title="Jobs — full list" onClose={onClose}>
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          <Mini label="Active" value={String(active)} />
          <Mini label="Pending" value={String(pending)} />
          <Mini label="Total jobs" value={String(jobs.length)} />
        </div>
        <table className="tbl">
          <thead><tr><th>JOB</th><th>FABRIC</th><th>STAGE</th><th>MACHINE</th><th>OPERATOR</th><th className="r">TARGET</th><th className="r">DONE</th><th className="r">PROGRESS</th><th>STATUS</th></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-6 text-steel">No jobs yet.</td></tr>
            ) : rows.map((j) => (
              <tr key={j._id}>
                <td className="mono font-bold">{j.jobNumber}</td>
                <td>{j.fabricName || '—'}</td>
                <td className="text-steel">{j.stage}</td>
                <td className="mono">{j.machineCode || '—'}</td>
                <td>{j.operatorName || '—'}</td>
                <td className="r mono">{j.targetProduction.toLocaleString()}</td>
                <td className="r mono">{j.achievedProduction.toLocaleString()}</td>
                <td className="r mono font-bold" style={{ color: j.pct >= 100 ? TEAL : j.pct >= 50 ? AMBER : STEEL }}>{j.pct}%</td>
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
      <Modal wide title="On the floor" onClose={onClose}>
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          <Mini label="On the floor" value={String(floor.length)} />
          <Mini label="Operators" value={String(operators)} />
          <Mini label="Supervisors" value={String(supervisors)} />
        </div>
        <table className="tbl">
          <thead><tr><th>NAME</th><th>ROLE</th><th className="r">MACHINES</th><th>EMAIL</th></tr></thead>
          <tbody>
            {floor.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-6 text-steel">No operators or supervisors in your scope.</td></tr>
            ) : floor.map((p) => (
              <tr key={p._id}>
                <td className="font-bold">{p.name}</td>
                <td className="text-steel">{ROLE_LABELS[p.role as Role] ?? p.role}</td>
                <td className="r mono">{p.assignedMachineIds.length}</td>
                <td className="text-steel">{p.email || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>
    );
  }

  // ---- machine-based: production / efficiency / running / alerts (windowed values) ----
  let rows = breakdown.map((m) => ({
    code: m.code, department: m.department, status: m.status,
    today: m.production, total: m.productionTotal, efficiency: m.efficiency, downtime: m.downtimeSec,
  }));
  let title = '';
  let highlight: 'today' | 'efficiency' | null = null;
  if (kind === 'production') {
    rows.sort((a, b) => b.today - a.today); title = `Production (${period}) — by machine`; highlight = 'today';
  } else if (kind === 'efficiency') {
    rows.sort((a, b) => b.efficiency - a.efficiency); title = `Avg Efficiency (${period}) — by machine`; highlight = 'efficiency';
  } else if (kind === 'running') {
    const ord: Record<string, number> = { running: 0, idle: 1, stopped: 2, disconnected: 3 };
    rows.sort((a, b) => (ord[a.status] ?? 9) - (ord[b.status] ?? 9) || b.today - a.today);
    title = 'Machine status';
  } else {
    rows = rows.filter((r) => r.status === 'stopped' || r.status === 'disconnected').sort((a, b) => b.downtime - a.downtime);
    title = 'Alerts — stopped / offline machines';
  }
  const todayProd = rows.reduce((s, r) => s + r.today, 0);
  const runningCount = rows.filter((r) => r.status === 'running').length;
  const summary = kind === 'alerts'
    ? [<Mini key="a" label="Needs attention" value={String(rows.length)} />, <Mini key="b" label="Stopped" value={String(rows.filter((r) => r.status === 'stopped').length)} />, <Mini key="c" label="Offline" value={String(rows.filter((r) => r.status === 'disconnected').length)} />]
    : [<Mini key="a" label={period === 'today' ? 'Produced today' : 'Produced (period)'} value={`${todayProd.toLocaleString()} mtr`} />, <Mini key="b" label="Machines" value={String(rows.length)} />, <Mini key="c" label="Running" value={String(runningCount)} />];
  return (
    <Modal wide title={title} onClose={onClose}>
      <div className="grid grid-cols-3 gap-2.5 mb-4">{summary}</div>
      <table className="tbl">
        <thead><tr><th>MACHINE</th><th>DEPARTMENT</th><th>STATUS</th><th className="r">{period === 'today' ? 'TODAY' : 'PERIOD'}</th><th className="r" title="Live PLC counter reading (raw; can wrap)">COUNTER</th><th className="r">EFFICIENCY</th><th className="r">DOWNTIME</th></tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="text-center py-6 text-steel">{kind === 'alerts' ? 'No alerts — everything is running. 🎉' : 'No machines in your scope.'}</td></tr>
          ) : rows.map((r) => (
            <tr key={r.code}>
              <td className="mono font-bold">{r.code}</td>
              <td className="text-steel">{r.department}</td>
              <td><StatusPill status={r.status} /></td>
              <td className={cn('r mono', highlight === 'today' && 'bg-raised font-extrabold')}>{r.today.toLocaleString()}</td>
              <td className="r mono text-steel">{r.total.toLocaleString()}</td>
              <td className={cn('r mono font-bold', highlight === 'efficiency' && 'bg-raised font-extrabold')} style={{ color: effColor(r.efficiency) }}>{r.efficiency}%</td>
              <td className="r mono" style={{ color: r.downtime > 0 ? RED : SLATE }}>{fmtDuration(r.downtime)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

function JobStatusPill({ status }: { status: JobRow['status'] }) {
  const map = {
    inProgress: { label: 'In progress', cls: 'bg-running/10 text-running' },
    pending: { label: 'Pending', cls: 'bg-idle/10 text-idle' },
    completed: { label: 'Completed', cls: 'bg-steel/10 text-steel' },
  } as const;
  const m = map[status];
  return <span className={cn('pill', m.cls)}><span className="w-1.5 h-1.5 rounded-full bg-current" />{m.label}</span>;
}

// ---- per-machine time breakdown (opened by clicking a time KPI) ----
interface TRow { code: string; department: string; status: MachineWithState['status']; running: number; idle: number; stopped: number; downtime: number }
function TimeBreakdownModal({ metric, breakdown, period, onClose }: { metric: TimeMetric; breakdown: MachineBreakdown[]; period: string; onClose: () => void }) {
  const meta = TIME_META[metric];
  const rows: TRow[] = breakdown
    .map((m) => ({ code: m.code, department: m.department, status: m.status, running: m.runningSec, idle: m.idleSec, stopped: m.stoppedSec, downtime: m.downtimeSec }))
    .filter((r) => r.running || r.idle || r.stopped || r.downtime)
    .sort((a, b) => b[metric] - a[metric]);
  const tot = rows.reduce(
    (t, r) => ({ running: t.running + r.running, idle: t.idle + r.idle, stopped: t.stopped + r.stopped, downtime: t.downtime + r.downtime }),
    { running: 0, idle: 0, stopped: 0, downtime: 0 }
  );
  const cell = (key: TimeMetric, v: number) => (
    <td className={cn('r mono', key === metric && 'bg-raised font-extrabold')} style={key === metric ? { color: meta.color } : undefined}>{fmtDuration(v)}</td>
  );
  return (
    <Modal wide title={`${meta.label} — by machine · ${period}`} onClose={onClose}>
      <div className="grid grid-cols-3 gap-2.5 mb-4">
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
            <tr><td colSpan={7} className="text-center py-6 text-steel">No machine time recorded for this view.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.code}>
              <td className="mono font-bold">{r.code}</td>
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
            <tr className="border-t-2 border-line font-extrabold">
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
    <Modal wide title={isOutput ? 'Department Output — full detail' : 'Department Efficiency — full detail'} onClose={onClose}>
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <Mini label="Departments" value={String(depts.length)} />
        <Mini label="Total Production" value={`${totalProd.toLocaleString()} mtr`} />
        <Mini label="Avg Efficiency" value={`${avgEff}%`} />
      </div>
      <div className="label mb-2">By department · {totalMachines} machines</div>
      <table className="tbl mb-5">
        <thead><tr><th>DEPARTMENT</th><th className="r">MACHINES</th><th className="r">PRODUCTION</th><th className="r">EFFICIENCY</th><th className="w-1/3">{isOutput ? 'OUTPUT' : 'EFFICIENCY'}</th></tr></thead>
        <tbody>
          {depts.map((d) => {
            const metric = isOutput ? d.production : d.efficiency;
            const w = Math.max(2, (metric / maxMetric) * 100);
            const barColor = isOutput ? TEAL : effColor(d.efficiency);
            return (
              <tr key={d.dept}>
                <td className="font-bold">{d.dept}</td>
                <td className="r mono">{d.machines}</td>
                <td className="r mono">{d.production.toLocaleString()}</td>
                <td className="r mono font-bold" style={{ color: effColor(d.efficiency) }}>{d.efficiency}%</td>
                <td><div className="pbar"><span style={{ width: `${w}%`, background: barColor }} /></div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="label mb-2">By machine</div>
      <table className="tbl">
        <thead><tr><th>MACHINE</th><th>DEPARTMENT</th><th>STATUS</th><th className="r">PRODUCTION</th><th className="r">EFF</th></tr></thead>
        <tbody>
          {rankedMachines.map((m) => (
            <tr key={m._id}>
              <td className="mono font-bold">{m.code}</td>
              <td className="text-steel">{m.department}</td>
              <td><StatusPill status={m.status} /></td>
              <td className="r mono">{(m.state?.production ?? 0).toLocaleString()}</td>
              <td className="r mono font-bold" style={{ color: effColor(m.state?.efficiency ?? 0) }}>{m.state?.efficiency ?? 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

// small stat tile used inside the modals
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-raised rounded-card px-3 py-2.5">
      <div className="text-[10px] font-bold tracking-wide uppercase text-steel/60">{label}</div>
      <div className="data text-[17px] font-extrabold mt-0.5 text-primary">{value}</div>
    </div>
  );
}