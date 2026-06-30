// ============================================================
//  REPORTS  —  production, efficiency & downtime summaries over a
//  date range, with CSV export. Composed from the existing dashboard
//  aggregates (deptStats + per-machine breakdown) — no new endpoints.
// ============================================================
import { useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { FileBarChart, Download, BarChart3, Zap, Clock, AlertTriangle, X } from 'lucide-react';
import type { MachineBreakdown } from '@shared/types';
import { useDashboard } from '../hooks/useData';
import { StatCard, StatusPill } from '../components/ekc-ui';
import { Distribution, CategoryBars } from '../components/charts';
import { fmtDuration } from '../components/ui';

const TEAL = '#0D9488', AMBER = '#D97706', RED = '#DC2626';
const effColor = (e: number) => (e >= 70 ? TEAL : e >= 40 ? AMBER : RED);
type IconType = ComponentType<{ size?: number; className?: string }>;

export default function Reports() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dept, setDept] = useState<string | null>(null);
  const day = dateFrom || dateTo;
  const endDay = dateTo || dateFrom;
  const ranged = !!day;
  const rangeLabel = dateFrom && dateTo && dateFrom !== dateTo ? `${dateFrom} → ${dateTo}` : day;
  const fromISO = ranged ? new Date(`${day}T00:00`).toISOString() : undefined;
  const toISO = ranged ? new Date(`${endDay}T23:59`).toISOString() : undefined;
  const kpi = useDashboard(fromISO, toISO);

  const deptStats = kpi?.deptStats ?? [];
  const rows = kpi?.machineBreakdown ?? [];
  const stale = !ranged && !!kpi?.stale;
  const asOf = kpi?.lastUpdated ? new Date(kpi.lastUpdated).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const totalProd = deptStats.reduce((s, d) => s + d.production, 0);
  const avgEff = deptStats.length ? Math.round(deptStats.reduce((s, d) => s + d.efficiency, 0) / deptStats.length) : 0;
  const periodTxt = ranged ? rangeLabel : stale ? 'last recorded day' : 'today';

  function exportCSV() {
    const header = ['Machine', 'Department', 'Status', 'Production', 'Efficiency %', 'Downtime (min)'];
    const lines = rows.map((r) => [r.code, r.department, r.status, r.production, r.efficiency, Math.round((r.downtimeSec || 0) / 60)].join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jaincord-report-${(rangeLabel || 'today').replace(/[^\w-]+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="px-5 sm:px-7 pt-1 pb-10 space-y-4">
      {/* range + export */}
      <div className="panel px-4 py-3 flex flex-wrap items-end gap-3">
        <div><div className="label mb-1">From</div><input type="date" className="bg-base border border-line rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
        <div><div className="label mb-1">To</div><input type="date" className="bg-base border border-line rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
        {ranged && <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-accent text-sm font-semibold hover:underline mb-2">Reset to live</button>}
        <span className="text-xs text-steel mb-2">Period: <b className="text-primary">{periodTxt}</b></span>
        <button onClick={exportCSV} disabled={rows.length === 0} className="ml-auto inline-flex items-center gap-1.5 bg-accent text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"><Download size={15} /> Export CSV</button>
      </div>

      {stale && (
        <div className="rounded-card border border-idle/30 bg-idle/10 text-idle px-4 py-2.5 text-sm font-medium flex items-center gap-2">
          <AlertTriangle size={15} className="shrink-0" /> Live feed offline — figures are the last recorded day{asOf ? ` (as of ${asOf})` : ''}.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Production" value={`${totalProd.toLocaleString()} mtr`} sub={periodTxt} accent="accent" icon={BarChart3} />
        <StatCard label="Avg Efficiency" value={`${avgEff}%`} sub={`${deptStats.length} departments`} accent={avgEff >= 70 ? 'accent' : 'idle'} icon={Zap} />
        <StatCard label="Total Downtime" value={fmtDuration(kpi?.downtimeSec ?? 0)} sub="Idle + stopped" accent="stopped" icon={Clock} />
        <StatCard label="Machines" value={kpi?.totalMachines ?? 0} sub={`${kpi?.running ?? 0} running`} accent="steel" icon={FileBarChart} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="panel p-5">
          <PanelHead icon={BarChart3} title="Production by Department" subtitle={`${totalProd.toLocaleString()} mtr total · click a department for its machines`} />
          {deptStats.length === 0 ? <Empty /> : <Distribution rows={deptStats.map((d) => ({ label: d.dept, value: d.production }))} total={totalProd} color={TEAL} unit="mtr" onRowClick={setDept} />}
        </div>
        <div className="panel p-5">
          <PanelHead icon={Zap} title="Efficiency by Department" subtitle={`Avg ${avgEff}% · click a department for its machines`} />
          {deptStats.length === 0 ? <Empty /> : <CategoryBars data={deptStats.map((d) => ({ label: d.dept, value: d.efficiency, color: effColor(d.efficiency) }))} max={100} suffix="%" onRowClick={setDept} />}
        </div>
      </div>

      {dept && <DeptMachinesModal dept={dept} rows={rows} periodTxt={periodTxt} onClose={() => setDept(null)} />}

      <div className="panel p-5">
        <PanelHead icon={FileBarChart} title="Machine Performance" subtitle={`${rows.length} machines · ${periodTxt}`} />
        {rows.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>MACHINE</th><th>DEPARTMENT</th><th>STATUS</th><th className="r">PRODUCTION</th><th className="r">EFFICIENCY</th><th className="r">DOWNTIME</th></tr></thead>
              <tbody>
                {[...rows].sort((a, b) => b.production - a.production).map((r) => (
                  <tr key={r.code}>
                    <td className="data font-bold">{r.code}</td>
                    <td className="text-steel">{r.department}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td className="r data">{r.production.toLocaleString()}</td>
                    <td className="r data font-bold" style={{ color: effColor(r.efficiency) }}>{r.efficiency}%</td>
                    <td className="r data" style={{ color: (r.downtimeSec || 0) > 0 ? RED : undefined }}>{fmtDuration(r.downtimeSec || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PanelHead({ icon: Icon, title, subtitle }: { icon: IconType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-2 mb-4">
      <span className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0"><Icon size={15} className="text-accent" /></span>
      <div><h2 className="font-semibold text-sm text-primary leading-tight">{title}</h2>{subtitle && <p className="text-[11px] text-steel mt-0.5">{subtitle}</p>}</div>
    </div>
  );
}
function Empty() { return <div className="text-sm text-steel py-4">No data for this period.</div>; }

// Department drill-down: the machines that make up a department's production /
// efficiency number, sorted by contribution. Each machine links to its detail
// page (Overview / History tabs) so the owner can trace the value to its source.
function DeptMachinesModal({ dept, rows, periodTxt, onClose }: { dept: string; rows: MachineBreakdown[]; periodTxt: string; onClose: () => void }) {
  const list = [...rows].filter((r) => r.department === dept).sort((a, b) => b.production - a.production);
  const totalProd = list.reduce((s, r) => s + r.production, 0);
  const avgEff = list.length ? Math.round(list.reduce((s, r) => s + r.efficiency, 0) / list.length) : 0;
  const totalDown = list.reduce((s, r) => s + (r.downtimeSec || 0), 0);
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-[rgba(15,23,42,.55)] backdrop-blur-sm" onClick={onClose}>
      <div className="panel flex flex-col max-h-[90vh] w-[min(880px,95vw)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-line shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0"><BarChart3 size={15} className="text-accent" /></span>
              <h2 className="text-lg font-extrabold text-primary truncate">{dept}</h2>
            </div>
            <p className="text-xs text-steel mt-1">{list.length} machine{list.length === 1 ? '' : 's'} contributing · {periodTxt} · click a machine for full history</p>
          </div>
          <button onClick={onClose} className="text-steel hover:text-primary transition-colors shrink-0" aria-label="Close"><X size={20} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <StatBox label="Production" value={`${totalProd.toLocaleString()} mtr`} color={TEAL} />
            <StatBox label="Avg Efficiency" value={`${avgEff}%`} color={effColor(avgEff)} />
            <StatBox label="Total Downtime" value={fmtDuration(totalDown)} color={RED} />
          </div>
          {list.length === 0 ? (
            <div className="text-sm text-steel py-8 text-center">No machines recorded for this department in this period.</div>
          ) : (
            <table className="tbl">
              <thead><tr><th>MACHINE</th><th>STATUS</th><th className="r">PRODUCTION</th><th className="r">SHARE</th><th className="r">EFFICIENCY</th><th className="r">DOWNTIME</th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.code}>
                    <td>
                      <Link to={`/machines/${r.code}`} className="data font-bold text-accent hover:underline">{r.code}</Link>
                      {r.name && <div className="text-[11px] text-steel truncate max-w-[200px]">{r.name}</div>}
                    </td>
                    <td><StatusPill status={r.status} /></td>
                    <td className="r data">{r.production.toLocaleString()}</td>
                    <td className="r data text-steel">{totalProd ? Math.round((r.production / totalProd) * 100) : 0}%</td>
                    <td className="r data font-bold" style={{ color: effColor(r.efficiency) }}>{r.efficiency}%</td>
                    <td className="r data" style={{ color: (r.downtimeSec || 0) > 0 ? RED : undefined }}>{fmtDuration(r.downtimeSec || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="card p-3"><div className="label">{label}</div><div className="data text-xl font-bold mt-1" style={{ color }}>{value}</div></div>;
}
