// ============================================================
//  DASHBOARD PAGE  —  KPIs + time KPIs + pipeline + dept charts
// ============================================================
import { useMemo, useState, Fragment } from 'react';
import { useDashboard, useMachines, liveSummary, fmtLastSeen } from '../hooks/useData';
import type { MachineWithState } from '../hooks/useData';
import { KpiCard, BarRow, StatusPill, fmtDuration } from '../components/ui';
import { Modal } from './JobTracking';
import { DEPARTMENTS } from '@shared/types';

type DeptStat = { dept: string; machines: number; production: number; efficiency: number };

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
  const { live: liveNow, lastUpdated } = liveSummary(machines);
  const [deptModal, setDeptModal] = useState<'output' | 'efficiency' | null>(null);

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
        <KpiCard label="Total Production" value={(kpi?.totalProduction ?? 0).toLocaleString()} sub={`${kpi?.totalMachines ?? 0} machines`} accent="var(--accent-blue)" />
        <KpiCard label="Running" value={`${kpi?.running ?? 0}/${kpi?.totalMachines ?? 0}`} sub={`${kpi?.idle ?? 0} idle`} accent="var(--accent-green)" />
        <KpiCard label="Avg Efficiency" value={`${kpi?.avgEfficiency ?? 0}%`} sub="From live" accent="var(--accent-amber)" />
        <KpiCard label="Active Jobs" value={kpi?.activeJobs ?? 0} sub={`${kpi?.pendingJobs ?? 0} pending`} accent="var(--accent-teal)" />
        <KpiCard label="Employees" value={kpi?.employees ?? 0} sub="On the floor" accent="var(--accent-purple)" />
        <KpiCard label="Alerts" value={kpi?.alerts ?? 0} sub="Stopped machines" accent="var(--accent-red)" />
      </div>

      {/* KPI row 2 — time based */}
      <div className="grid-stats-4" style={{ gap: 12, marginTop: 12 }}>
        <KpiCard label="Running Time" value={fmtDuration(kpi?.runningSec ?? 0)} sub="Machine-hours today" accent="var(--accent-green)" />
        <KpiCard label="Idle Time" value={fmtDuration(kpi?.idleSec ?? 0)} sub="Today" accent="var(--accent-amber)" />
        <KpiCard label="Stopped Time" value={fmtDuration(kpi?.stoppedSec ?? 0)} sub="Today" accent="var(--accent-red)" />
        <KpiCard label="Total Downtime" value={fmtDuration(kpi?.downtimeSec ?? 0)} sub="Idle + stopped" accent="var(--accent-pink)" />
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
    </div>
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
