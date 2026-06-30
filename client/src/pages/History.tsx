// ============================================================
//  HISTORY LOG PAGE  —  filterable telemetry log + CSV export
//  Clean filtering: one instant Search (machine/fabric/job/order/
//  operator/supervisor) + structured filters (machine, status,
//  date/time range) applied on demand, with removable filter chips.
//  Fabric/Job/Order/Operator/Supervisor come from each machine's
//  current job (joined client-side, same as the machine cards).
//  EKC re-skin — visual layer only, logic unchanged.
// ============================================================
import { useCallback, useEffect, useMemo, useState, useDeferredValue, Fragment, type ComponentType } from 'react';
import { Filter, Download, ArrowLeft, Plus, Minus, Search, X, SlidersHorizontal, Activity, BarChart3, Zap, LineChart } from 'lucide-react';
import { api } from '../api/client';
import { useMachines, useJobs } from '../hooks/useData';
import { usePagedData } from '../hooks/usePagedData';
import type { HistoryRow, JobRow } from '../hooks/useData';
import { StatCard, StatusPill } from '../components/ekc-ui';
import { Donut, Legend, TrendChart } from '../components/charts';
import Sparkline from '../components/Sparkline';
import { cn } from '../lib/utils';

const TEAL = '#0D9488', AMBER = '#D97706', RED = '#DC2626', SLATE = '#94A3B8';
type IconType = ComponentType<{ size?: number; className?: string }>;

// compact, clickable trend panel for the history analytics row
function TrendPanel({ title, unit, data, color, icon: Icon, onClick }: { title: string; unit?: string; data: number[]; color: string; icon: IconType; onClick?: () => void }) {
  const latest = data.length ? data[data.length - 1] : 0;
  const min = data.length ? Math.min(...data) : 0;
  const max = data.length ? Math.max(...data) : 0;
  return (
    <button type="button" onClick={onClick} className="panel p-5 text-left w-full transition-all hover:border-accent/40 hover:shadow-md group focus:outline-none focus:ring-2 focus:ring-accent/30">
      <div className="flex items-start gap-2 mb-3">
        <span className="w-7 h-7 rounded-lg bg-accent/10 grid place-items-center shrink-0"><Icon size={15} className="text-accent" /></span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-primary leading-tight flex items-center gap-1">{title} <LineChart size={11} className="text-accent opacity-0 group-hover:opacity-100 transition-opacity" /></h3>
          <p className="text-[11px] text-steel mt-0.5">latest {latest.toLocaleString()}{unit ? ` ${unit}` : ''} · min {min.toLocaleString()} · max {max.toLocaleString()}</p>
        </div>
        <span className="text-[10px] text-steel/50 group-hover:text-accent transition-colors shrink-0">Details</span>
      </div>
      {data.length > 1 ? <Sparkline data={data} width={440} height={88} color={color} /> : <div className="text-sm text-steel py-6 text-center">Not enough data to plot.</div>}
    </button>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="card p-3"><div className="label">{label}</div><div className="data text-xl font-bold mt-1" style={{ color }}>{value}</div></div>;
}

// drill-down: the data behind a history trend chart (stats + time-axis chart + recent readings)
function HistoryTrendModal({ rows, metric, label, unit, color, machineLabel, onClose }: { rows: HistoryRow[]; metric: 'production' | 'efficiency'; label: string; unit?: string; color: string; machineLabel?: string; onClose: () => void }) {
  const chrono = [...rows].reverse(); // oldest → newest
  const val = (r: HistoryRow) => Number((r as unknown as Record<string, unknown>)[metric]) || 0;
  const series = chrono.map(val);
  const has = series.length > 1;
  const latest = series.length ? series[series.length - 1] : 0;
  const min = has ? Math.min(...series) : 0;
  const max = has ? Math.max(...series) : 0;
  const avg = has ? Math.round(series.reduce((a, b) => a + b, 0) / series.length) : 0;
  const first = series.length ? series[0] : 0;
  const change = first ? Math.round(((latest - first) / Math.abs(first)) * 100) : 0;
  const u = unit ? ` ${unit}` : '';

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-[rgba(15,23,42,.55)] backdrop-blur-sm" onClick={onClose}>
      <div className="panel flex flex-col max-h-[90vh] overflow-hidden w-[min(760px,94vw)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-line shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-primary truncate">{label} — trend</h2>
            <div className="text-xs text-steel">{machineLabel ? `${machineLabel} · ` : ''}last {series.length} reading{series.length === 1 ? '' : 's'} in view</div>
          </div>
          <button onClick={onClose} className="text-steel hover:text-primary transition-colors shrink-0" aria-label="Close"><X size={20} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-6 py-5 space-y-4">
          {!has ? <div className="text-center text-steel py-12">Not enough data to plot.</div> : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MiniStat label="Latest" value={`${latest.toLocaleString()}${u}`} color={color} />
                <MiniStat label="Average" value={`${avg.toLocaleString()}${u}`} color="#6366F1" />
                <MiniStat label="Min" value={`${min.toLocaleString()}${u}`} color={TEAL} />
                <MiniStat label="Max" value={`${max.toLocaleString()}${u}`} color={RED} />
              </div>
              <div className="rounded-card border border-line bg-base p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="label">{label}{unit ? ` (${unit})` : ''}</span>
                  <span className={cn('data text-xs font-bold', change >= 0 ? 'text-running' : 'text-stopped')}>{change >= 0 ? '▲' : '▼'} {Math.abs(change)}% over window</span>
                </div>
                <TrendChart data={chrono.map((r) => ({ t: new Date(r.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), full: fmtDateTime(r.ts), v: val(r) }))} color={color} unit={unit} height={220} />
              </div>
              <div>
                <div className="label mb-2">Recent readings</div>
                <table className="tbl">
                  <thead><tr><th>TIME</th><th>STATUS</th><th className="r">{label.toUpperCase()}</th></tr></thead>
                  <tbody>
                    {chrono.slice(-40).reverse().map((r) => (
                      <tr key={r._id}><td className="data">{fmtDateTime(r.ts)}</td><td><StatusPill status={r.status} /></td><td className="r data">{val(r).toLocaleString()}{u}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface Resp {
  rows: HistoryRow[];
  kpis: { total: number; runningEntries: number; downtimeEntries: number };
  total: number; page: number; pages: number; limit: number;
}
type Row = HistoryRow & { job?: JobRow };

// structured filters define the dataset (server query); search is instant (client)
const EMPTY = { machineId: '', status: '', dateFrom: '', dateTo: '', timeFrom: '', timeTo: '' };
const PAGE_SIZE = 10; // rows per page — fetched one page at a time from the server

export default function History() {
  const { machines } = useMachines();
  const { data: jobs } = useJobs();
  const [f, setF] = useState({ ...EMPTY });            // live form
  const [applied, setApplied] = useState({ ...EMPTY }); // in effect (drives the fetch)
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);      // smooth instant filtering
  const [showMore, setShowMore] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const jobByMachine = useMemo(() => {
    const map = new Map<string, JobRow>();
    for (const j of jobs) {
      if (!j.machineCode) continue;
      const ex = map.get(j.machineCode);
      if (!ex || (j.status === 'inProgress' && ex.status !== 'inProgress')) map.set(j.machineCode, j);
    }
    return map;
  }, [jobs]);

  // filter params shared by the page fetch and the (separate) breakdown fetch
  const filterParams = useCallback(() => {
    const p: Record<string, string> = {};
    if (applied.machineId) p.machineId = applied.machineId;
    if (applied.status) p.status = applied.status;
    // a single date + a time range should bound WITHIN that day: if one date is blank, reuse the
    // other so "Time To" isn't silently dropped (which left the range open-ended).
    const fromDate = applied.dateFrom || applied.dateTo;
    const toDate = applied.dateTo || applied.dateFrom;
    const from = toISO(fromDate, applied.timeFrom, false);
    const to = toISO(toDate, applied.timeTo, true);
    if (from) p.from = from;
    if (to) p.to = to;
    return p;
  }, [applied]);

  // paginated fetch with next-page prefetch + cache (per filter). Visiting a page you've already
  // seen is served from cache; the cache is dropped when the filter changes or you leave the page.
  const cacheKey = JSON.stringify(filterParams());
  const fetchPage = useCallback((p: number, signal?: AbortSignal) =>
    api.get<Resp>('/api/history', { params: { page: String(p), limit: String(PAGE_SIZE), ...filterParams() }, signal }).then((r) => r.data),
    [filterParams]);
  const { data: paged, loading } = usePagedData(cacheKey, fetchPage, page);
  const data: Resp = paged ?? { rows: [], kpis: { total: 0, runningEntries: 0, downtimeEntries: 0 }, total: 0, page: 1, pages: 1, limit: PAGE_SIZE };

  // running/downtime breakdown is a slow whole-set scan → fetch it separately so it never blocks
  // the table. Keyed on the filter only (not the page), so paging doesn't refetch it.
  const [breakdown, setBreakdown] = useState({ running: 0, downtime: 0, loading: true });
  useEffect(() => {
    let cancelled = false;
    setBreakdown((b) => ({ ...b, loading: true }));
    api.get<{ runningEntries: number; downtimeEntries: number }>('/api/history', { params: { breakdown: '1', ...filterParams() } })
      .then((res) => { if (!cancelled) setBreakdown({ running: res.data.runningEntries ?? 0, downtime: res.data.downtimeEntries ?? 0, loading: false }); })
      .catch(() => { if (!cancelled) setBreakdown((b) => ({ ...b, loading: false })); });
    return () => { cancelled = true; };
  }, [filterParams]);

  // ── analytics chart data: a recent sample of the filtered set (machine + date range, ignoring the
  // status filter so the status mix stays meaningful). Capped to stay light on the M0 tier.
  const [chart, setChart] = useState<{ rows: HistoryRow[]; loading: boolean }>({ rows: [], loading: true });
  useEffect(() => {
    let cancelled = false;
    setChart((c) => ({ ...c, loading: true }));
    const p: Record<string, string> = { limit: '300' };
    if (applied.machineId) p.machineId = applied.machineId;
    const from = toISO(applied.dateFrom || applied.dateTo, applied.timeFrom, false);
    const to = toISO(applied.dateTo || applied.dateFrom, applied.timeTo, true);
    if (from) p.from = from;
    if (to) p.to = to;
    api.get<Resp>('/api/history', { params: p })
      .then((res) => { if (!cancelled) setChart({ rows: res.data.rows || [], loading: false }); })
      .catch(() => { if (!cancelled) setChart({ rows: [], loading: false }); });
    return () => { cancelled = true; };
  }, [applied]);

  const analytics = useMemo(() => {
    const counts = { running: 0, idle: 0, stopped: 0, disconnected: 0 };
    for (const r of chart.rows) {
      if (r.status === 'running') counts.running++;
      else if (r.status === 'idle') counts.idle++;
      else if (r.status === 'stopped') counts.stopped++;
      else counts.disconnected++;
    }
    const chrono = [...chart.rows].reverse(); // oldest → newest
    return { counts, prod: chrono.map((r) => Number(r.production) || 0), eff: chrono.map((r) => Number(r.efficiency) || 0), n: chart.rows.length };
  }, [chart.rows]);
  const statusSeg = [
    { label: 'Running', value: analytics.counts.running, color: TEAL },
    { label: 'Idle', value: analytics.counts.idle, color: AMBER },
    { label: 'Stopped', value: analytics.counts.stopped, color: RED },
    { label: 'Disconnected', value: analytics.counts.disconnected, color: SLATE },
  ].filter((s) => s.value > 0);
  const [trend, setTrend] = useState<{ metric: 'production' | 'efficiency'; label: string; unit: string; color: string } | null>(null);
  const selMachineLabel = applied.machineId ? machines.find((m) => m._id === applied.machineId)?.code : undefined;

  // the server already returns just this page; join each row's current job,
  // then refine within the page using the instant search box
  const pageRows: Row[] = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const joined = data.rows.map((r) => ({ ...r, job: jobByMachine.get(r.machineCode) }));
    if (!q) return joined;
    return joined.filter((r) =>
      `${r.machineCode} ${r.job?.fabricName || ''} ${r.job?.jobNumber || ''} ${r.job?.orderNumber || ''} ${r.job?.operatorName || ''} ${r.job?.supervisorName || ''}`
        .toLowerCase().includes(q)
    );
  }, [data.rows, jobByMachine, deferredSearch]);

  // KPIs reflect the WHOLE filtered dataset — total comes with the (fast) page; the running/downtime
  // breakdown streams in separately so it doesn't hold up the table
  const kpis = { total: data.kpis.total, running: breakdown.running, downtime: breakdown.downtime };

  const totalPages = Math.max(1, data.pages);
  const safePage = Math.min(page, totalPages);
  const total = data.total;
  const hasRows = data.rows.length > 0;

  function apply() { setApplied({ ...f }); setPage(1); setOpen(new Set()); }
  function clear() { setF({ ...EMPTY }); setApplied({ ...EMPTY }); setSearch(''); setPage(1); setOpen(new Set()); }
  function clearKeys(...keys: (keyof typeof EMPTY)[]) {
    setF((p) => { const n = { ...p }; keys.forEach((k) => (n[k] = '')); return n; });
    setApplied((p) => { const n = { ...p }; keys.forEach((k) => (n[k] = '')); return n; });
    setPage(1);
  }
  function toggle(id: string) {
    // accordion: opening a row collapses any other open one (at most one expanded at a time)
    setOpen((p) => (p.has(id) ? new Set() : new Set([id])));
  }

  // removable chips for what's actually in effect
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (applied.machineId) chips.push({ key: 'm', label: `Machine: ${applied.machineId}`, onRemove: () => clearKeys('machineId') });
  if (applied.status) chips.push({ key: 's', label: `Status: ${cap(applied.status)}`, onRemove: () => clearKeys('status') });
  if (applied.dateFrom || applied.dateTo) {
    const a = applied.dateFrom, b = applied.dateTo;
    const dLabel = a && b ? (a === b ? `Date: ${a}` : `Date: ${a} → ${b}`) : `Date: ${a || b}`; // single date when only one set
    chips.push({ key: 'd', label: dLabel, onRemove: () => clearKeys('dateFrom', 'dateTo') });
  }
  if (applied.timeFrom || applied.timeTo) chips.push({ key: 't', label: `Time: ${applied.timeFrom || '…'} → ${applied.timeTo || '…'}`, onRemove: () => clearKeys('timeFrom', 'timeTo') });
  if (deferredSearch.trim()) chips.push({ key: 'q', label: `Search: "${deferredSearch.trim()}"`, onRemove: () => setSearch('') });

  const dirty = JSON.stringify(f) !== JSON.stringify(applied);

  const [exporting, setExporting] = useState(false);
  async function exportCSV() {
    // the table is paginated (10/page); for export, pull the whole filtered set (capped) in one shot
    setExporting(true);
    try {
      const params: Record<string, string> = { limit: '1000' };
      if (applied.machineId) params.machineId = applied.machineId;
      if (applied.status) params.status = applied.status;
      const from = toISO(applied.dateFrom || applied.dateTo, applied.timeFrom, false);
      const to = toISO(applied.dateTo || applied.dateFrom, applied.timeTo, true);
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await api.get<Resp>('/api/history', { params }); // no `page` → legacy single-shot path
      const q = deferredSearch.trim().toLowerCase();
      const all = res.data.rows
        .map((r) => ({ ...r, job: jobByMachine.get(r.machineCode) }))
        .filter((r) => !q || `${r.machineCode} ${r.job?.fabricName || ''} ${r.job?.jobNumber || ''} ${r.job?.orderNumber || ''} ${r.job?.operatorName || ''} ${r.job?.supervisorName || ''}`.toLowerCase().includes(q));
      const head = ['Date & Time', 'Machine', 'Status', 'Speed', 'Production', 'Fabric', 'Job No.', 'Order No.', 'Operator', 'Supervisor'];
      const lines = all.map((r) => [
        new Date(r.ts).toISOString(), r.machineCode, r.status, r.speed, r.production,
        r.job?.fabricName ?? '', r.job?.jobNumber ?? '', r.job?.orderNumber ?? '',
        r.job?.operatorName ?? '', r.job?.supervisorName ?? '',
      ].join(','));
      const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'machine-history.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ } finally { setExporting(false); }
  }

  return (
    <div className="px-5 sm:px-7 pt-1 pb-10 space-y-4">
      {/* header: back + title + export */}
      <div className="flex items-center gap-4">
        <button onClick={() => window.history.back()} className="inline-flex items-center gap-1.5 bg-surface border border-line rounded-lg px-3 py-2 text-sm font-semibold text-primary hover:border-accent/40 transition-colors"><ArrowLeft size={16} /> Back</button>
        <div className="flex-1 min-w-0">
          <div className="text-xl font-extrabold text-primary">Machine History</div>
          <div className="text-[13px] text-steel">Detailed production log with full filters</div>
        </div>
        <button onClick={exportCSV} disabled={exporting} className={cn('inline-flex items-center gap-1.5 bg-accent text-white rounded-lg px-4 py-2 text-sm font-semibold', exporting && 'opacity-60')}>
          <Download size={16} /> {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {/* filters */}
      <div className="panel p-4">
        {/* primary row: search + machine + status */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex-[2_1_300px]">
            <Lbl label="Search">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel/60 pointer-events-none" />
                <input className="input pl-9" placeholder="Search machine, fabric, job, order, operator, supervisor…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </Lbl>
          </div>
          <div className="flex-[1_1_170px]">
            <Lbl label="Machine">
              <select className="input" value={f.machineId} onChange={(e) => set('machineId', e.target.value)}>
                <option value="">All Machines</option>
                {machines.map((m) => <option key={m._id} value={m._id}>{m.code} — {m.name}</option>)}
              </select>
            </Lbl>
          </div>
          <div className="flex-[1_1_150px]">
            <Lbl label="Status">
              <select className="input" value={f.status} onChange={(e) => set('status', e.target.value)}>
                <option value="">All Statuses</option>
                <option value="running">Running</option>
                <option value="idle">Idle</option>
                <option value="stopped">Stopped</option>
                <option value="disconnected">Disconnected</option>
              </select>
            </Lbl>
          </div>
        </div>

        {/* date range (+ optional time under "More filters") */}
        <div className="flex gap-3 flex-wrap mt-3">
          <div className="flex-[1_1_180px]"><Lbl label="Date From"><input type="date" className="input" value={f.dateFrom} onChange={(e) => set('dateFrom', e.target.value)} /></Lbl></div>
          <div className="flex-[1_1_180px]"><Lbl label="Date To"><input type="date" className="input" value={f.dateTo} onChange={(e) => set('dateTo', e.target.value)} /></Lbl></div>
          {showMore && <div className="flex-[1_1_160px]"><Lbl label="Time From"><input type="time" className="input" value={f.timeFrom} onChange={(e) => set('timeFrom', e.target.value)} /></Lbl></div>}
          {showMore && <div className="flex-[1_1_160px]"><Lbl label="Time To"><input type="time" className="input" value={f.timeTo} onChange={(e) => set('timeTo', e.target.value)} /></Lbl></div>}
        </div>

        {/* actions */}
        <div className="flex gap-2.5 mt-3.5 items-center flex-wrap">
          <button onClick={apply} disabled={!dirty} className={cn('inline-flex items-center gap-1.5 bg-accent text-white rounded-lg px-4 py-2 text-sm font-semibold', !dirty && 'opacity-55')}><Filter size={14} /> Apply Filters</button>
          <button onClick={clear} className="bg-surface border border-line rounded-lg px-3 py-2 text-sm font-semibold text-steel hover:text-primary transition-colors">Clear all</button>
          <button onClick={() => setShowMore((v) => !v)} className="ml-auto inline-flex items-center gap-1.5 text-accent text-[13px] font-semibold hover:underline">
            <SlidersHorizontal size={13} /> {showMore ? 'Fewer filters' : 'More filters'}
          </button>
        </div>

        {/* active filter chips */}
        {chips.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-3.5 pt-3.5 border-t border-line">
            {chips.map((c) => (
              <span key={c.key} className="pill bg-accent/10 text-accent pr-1.5">
                {c.label}
                <button onClick={c.onRemove} className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-accent/15 text-accent hover:bg-accent/25 transition-colors" aria-label="Remove filter"><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid-stats-3">
        <StatCard label="Total Records" value={kpis.total} sub={`${kpis.total} matched · ${PAGE_SIZE}/page`} accent="accent" />
        <StatCard label="Running Entries" value={breakdown.loading ? '…' : kpis.running} sub="Rows where status was running" accent="accent" />
        <StatCard label="Downtime Entries" value={breakdown.loading ? '…' : kpis.downtime} sub="Idle or stopped rows" accent="stopped" />
      </div>

      {/* analytics — visual breakdown of the filtered history (status mix + trends) */}
      {!chart.loading && analytics.n > 0 && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="panel p-5">
            <div className="flex items-start gap-2 mb-4">
              <span className="w-7 h-7 rounded-lg bg-accent/10 grid place-items-center shrink-0"><Activity size={15} className="text-accent" /></span>
              <div><h3 className="font-semibold text-sm text-primary leading-tight">Status mix</h3><p className="text-[11px] text-steel mt-0.5">Last {analytics.n} readings in view</p></div>
            </div>
            <div className="flex items-center gap-4">
              <Donut segments={statusSeg} size={120} thickness={15} emptyColor={SLATE}>
                <span className="data text-xl font-bold text-primary leading-none">{analytics.n}</span>
                <span className="label mt-1">reads</span>
              </Donut>
              <div className="flex-1 min-w-0">
                {statusSeg.length === 0 ? <div className="text-sm text-steel">No status data.</div> : <Legend rows={statusSeg} total={analytics.n} format={(v) => String(v)} scroll={false} />}
              </div>
            </div>
          </div>
          {applied.machineId ? (
            <>
              <TrendPanel title="Production trend" unit="mtr" data={analytics.prod} color={TEAL} icon={BarChart3} onClick={() => setTrend({ metric: 'production', label: 'Production', unit: 'mtr', color: TEAL })} />
              <TrendPanel title="Efficiency trend" unit="%" data={analytics.eff} color={TEAL} icon={Zap} onClick={() => setTrend({ metric: 'efficiency', label: 'Efficiency', unit: '%', color: TEAL })} />
            </>
          ) : (
            <div className="panel p-5 lg:col-span-2 flex items-center justify-center text-center text-sm text-steel">
              Select a machine above to see its production &amp; efficiency trends over time.
            </div>
          )}
        </div>
      )}

      {trend && (
        <HistoryTrendModal rows={chart.rows} metric={trend.metric} label={trend.label} unit={trend.unit} color={trend.color} machineLabel={selMachineLabel} onClose={() => setTrend(null)} />
      )}

      {/* table */}
      <div className="panel p-0 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="w-9"></th>
              <th>DATE &amp; TIME</th><th>MACHINE</th><th>STATUS</th>
              <th>SPEED</th><th>PRODUCTION</th><th>FABRIC</th>
              <th>JOB NO.</th><th>ORDER NO.</th><th>OPERATOR</th><th>SUPERVISOR</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} className="text-center py-8 text-steel">Loading history…</td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={11} className="text-center py-8 text-steel">{deferredSearch.trim() ? 'No rows on this page match your search — clear it or change page.' : 'No records match — adjust filters or let the simulator build history.'}</td></tr>
            ) : pageRows.map((r, idx) => {
              const j = r.job;
              const isOpen = open.has(r._id);
              const prev = pageRows[idx + 1]; // rows are newest-first → the next one is the previous reading
              return (
                <Fragment key={r._id}>
                  <tr className={cn(isOpen && 'bg-raised')}>
                    <td>
                      <button onClick={() => toggle(r._id)} className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-line bg-surface text-accent hover:border-accent/40 transition-colors" aria-label="Toggle details">
                        {isOpen ? <Minus size={14} /> : <Plus size={14} />}
                      </button>
                    </td>
                    <td className="data whitespace-nowrap">{fmtDateTime(r.ts)}</td>
                    <td className="data font-bold whitespace-nowrap">{r.machineCode}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td className="data whitespace-nowrap">{r.speed} <span className="text-[11px] text-steel">m/min</span></td>
                    <td className="data whitespace-nowrap">{fmtK(r.production)} <span className="text-[11px] text-steel">mtr</span></td>
                    <td className="whitespace-nowrap">{j?.fabricName || '—'}</td>
                    <td className="data whitespace-nowrap">{j?.jobNumber || '—'}</td>
                    <td className="data whitespace-nowrap">{j?.orderNumber || '—'}</td>
                    <td className="whitespace-nowrap">{j?.operatorName || '—'}</td>
                    <td className="whitespace-nowrap">{j?.supervisorName || '—'}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-raised">
                      <td></td>
                      <td colSpan={10} className="px-4 py-3">
                        <div className="text-[11px] font-bold text-steel mb-2">
                          {prev
                            ? <>Change vs previous reading <span className="data text-steel/70">({fmtDateTime(prev.ts)})</span></>
                            : 'Oldest reading in view — no earlier record on this page to compare'}
                        </div>
                        <div className="grid-stats-4">
                          <DeltaTile label="Speed" value={r.speed} prev={prev?.speed} unit="m/min" />
                          <DeltaTile label="Production" value={r.production} prev={prev?.production} unit="mtr" />
                          <DeltaTile label="Temperature" value={r.temperature} prev={prev?.temperature} unit="°C" />
                          <DeltaTile label="Water Flow" value={r.waterFlow} prev={prev?.waterFlow} unit="L/hr" />
                          <DeltaTile label="Efficiency" value={r.efficiency} prev={prev?.efficiency} unit="%" />
                          <Detail label="Department" value={r.department} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* pagination footer */}
      {!loading && hasRows && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[13px] text-steel">
            Showing <b className="text-primary">{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, total)}</b> of <b className="text-primary">{total.toLocaleString()}</b>
          </div>
          <HistoryPagination page={safePage} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  );
}

// ---- windowed pagination control (prev / numbers / next) ----
function HistoryPagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const go = (p: number) => {
    onChange(Math.min(totalPages, Math.max(1, p)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return (
    <div className="flex gap-1.5 items-center flex-wrap">
      <button onClick={() => go(page - 1)} disabled={page <= 1} className={pagerBtn(false, page <= 1)}>‹ Prev</button>
      {pageRange(page, totalPages).map((it, i) =>
        it === '…' ? (
          <span key={`e${i}`} className="px-1 text-steel/50">…</span>
        ) : (
          <button key={it} onClick={() => go(it as number)} className={pagerBtn(it === page, false)}>{it}</button>
        )
      )}
      <button onClick={() => go(page + 1)} disabled={page >= totalPages} className={pagerBtn(false, page >= totalPages)}>Next ›</button>
    </div>
  );
}

// windowed page numbers with … gaps: 1 … 4 5 [6] 7 8 … 20
function pageRange(page: number, total: number): (number | '…')[] {
  const out: (number | '…')[] = [];
  const push = (n: number) => out.push(n);
  const lo = Math.max(2, page - 1);
  const hi = Math.min(total - 1, page + 1);
  push(1);
  if (lo > 2) out.push('…');
  for (let i = lo; i <= hi; i++) push(i);
  if (hi < total - 1) out.push('…');
  if (total > 1) push(total);
  return out;
}
function pagerBtn(active: boolean, disabled: boolean): string {
  return cn(
    'min-w-[34px] h-[34px] px-2.5 rounded-lg text-[13px] font-bold border transition-colors',
    active ? 'bg-accent border-accent text-white' : 'bg-surface border-line',
    !active && (disabled ? 'text-steel/50 cursor-not-allowed opacity-55' : 'text-steel hover:border-accent/40'),
  );
}

// build "06 Jun, 11:13 am" from an ISO timestamp
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toLowerCase();
  return `${date}, ${time}`;
}
function fmtK(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}
function cap(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : s; }
// combine a date (yyyy-mm-dd) + optional time (HH:mm) into an ISO bound
function toISO(date: string, time: string, endOfDay: boolean): string {
  if (!date) return '';
  const t = time || (endOfDay ? '23:59' : '00:00');
  const d = new Date(`${date}T${t}`);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

function Lbl({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><div className="label mb-1.5">{label}</div>{children}</label>;
}
function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card p-2">
      <div className="label">{label}</div>
      <div className="data text-sm font-bold mt-0.5 text-primary">{value}</div>
    </div>
  );
}

// a value tile that also shows how it changed from the previous reading (▲ up / ▼ down / no change)
const numFmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : Number(n.toFixed(2)).toLocaleString());
function DeltaTile({ label, value, prev, unit }: { label: string; value: number; prev?: number; unit?: string }) {
  const d = prev != null ? value - prev : null;
  const up = (d ?? 0) > 0;
  const deltaColor = d == null ? 'text-steel/60' : d === 0 ? 'text-steel/60' : up ? 'text-running' : 'text-stopped';
  return (
    <div className="card p-2">
      <div className="label">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className="data text-sm font-bold text-primary">{numFmt(value)}{unit ? ` ${unit}` : ''}</span>
      </div>
      <div className={cn('data text-[11px] font-bold mt-0.5', deltaColor)}>
        {d == null ? '—' : d === 0 ? 'no change' : `${up ? '▲' : '▼'} ${numFmt(Math.abs(d))}`}
      </div>
    </div>
  );
}
