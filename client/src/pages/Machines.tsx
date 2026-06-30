// client/src/pages/Machines.tsx
// ============================================================
//  MACHINES PAGE  —  EKC re-skin (Tailwind + theme tokens)
//  Summary KPIs + filters + dynamic machine cards + 4 modals.
//  Visual layer only — all data hooks, computed values, helper
//  functions and modal logic are unchanged from the original.
//  Cards are `.panel` (bg-surface) so the bg-raised metric tiles
//  read as distinct tiles in both light and dark themes.
// ============================================================
import { useMemo, useState, useEffect } from 'react';
import type { ComponentType } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, ChevronRight, AlertTriangle, Layers, Activity, Pause, Square } from 'lucide-react';
import { useMachines, useJobs, useDowntimeReports, liveSummary, fmtLastSeen, fmtAgo } from '../hooks/useData';
import type { MachineWithState, JobRow, DowntimeReportRow } from '../hooks/useData';
import { StatusPill, LiveDot } from '../components/ekc-ui';
import Sparkline from '../components/Sparkline';
import { useAuth } from '../context/auth';
import { api } from '../api/client';
import { DEPARTMENTS } from '@shared/types';
import { can } from '@shared/permissions';
import { cn } from '../lib/utils';

// EKC accent palette (inline, like the dashboard re-skin)
const TEAL = '#0D9488', AMBER = '#D97706', RED = '#DC2626', INDIGO = '#6366F1', STEEL = '#64748B';
const effColor = (e: number) => (e >= 70 ? TEAL : e >= 40 ? AMBER : RED);
// loosely-typed lucide icon (JCI declares lucide-react as `any`; never import LucideIcon)
type IconType = ComponentType<{ size?: number; className?: string }>;

// shared Tailwind class strings (kept here so the JSX below stays readable)
const INPUT = 'bg-base border border-line rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent';
const B = 'font-semibold text-primary'; // inline bold value inside muted context

// card ordering: running first, then idle, stopped, disconnected
const STATUS_ORDER: Record<string, number> = { running: 0, idle: 1, stopped: 2, disconnected: 3 };
const PAGE_SIZE = 12; // multiple of the 2-col & 3-col grids → every page row fills evenly (symmetric)

export default function Machines() {
  const { role } = useAuth();
  // capability-driven: supervisors+ may configure/assign within their scope; operators report idle
  const canConfigure = can(role, 'assignJobs');
  const canReport = can(role, 'reportDowntime');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const day = dateFrom || dateTo;        // a single date is enough (whole day)
  const endDay = dateTo || dateFrom;
  const ranged = !!day;
  const rangeLabel = dateFrom && dateTo && dateFrom !== dateTo ? `${dateFrom} → ${dateTo}` : day;
  const fromISO = ranged ? new Date(`${day}T00:00`).toISOString() : undefined;
  const toISO = ranged ? new Date(`${endDay}T23:59`).toISOString() : undefined;
  const { machines, loading } = useMachines(fromISO, toISO);
  const { live: liveNow, lastUpdated } = liveSummary(machines);
  const { data: jobs } = useJobs();
  // map each machine code → its active job (prefer in-progress) for card details
  const jobByMachine = useMemo(() => {
    const map = new Map<string, JobRow>();
    for (const j of jobs) {
      if (!j.machineCode) continue;
      const existing = map.get(j.machineCode);
      if (!existing || (j.status === 'inProgress' && existing.status !== 'inProgress')) map.set(j.machineCode, j);
    }
    return map;
  }, [jobs]);
  // open downtime reports → shown as a persistent idle banner on the machine card
  const { reports: downReports, resolve: resolveReport } = useDowntimeReports();
  const idleByMachine = useMemo(() => {
    const map = new Map<string, DowntimeReportRow>();
    for (const r of downReports) {
      if (r.status === 'open' || r.status === 'escalated') map.set(r.machineId, r);
    }
    return map;
  }, [downReports]);
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('name'); // fixed order by default so cards don't jump on status change
  const [page, setPage] = useState(1);
  // deep-link from a notification (?focus=CBR-01) → pre-fill the search
  const [sp] = useSearchParams();
  const focus = sp.get('focus');
  useEffect(() => { if (focus) setQ(focus); }, [focus]);

  const counts = useMemo(() => ({
    total: machines.length,
    running: machines.filter((m) => m.status === 'running').length,
    idle: machines.filter((m) => m.status === 'idle').length,
    stopped: machines.filter((m) => m.status === 'stopped').length,
  }), [machines]);

  const filtered = machines
    .filter((m) => {
      if (dept && m.department !== dept) return false;
      if (status && m.status !== status) return false;
      if (q && !`${m.code} ${m.name} ${m.department}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === 'name') return a.code.localeCompare(b.code);
      if (sort === 'production') return (b.state?.production ?? 0) - (a.state?.production ?? 0);
      if (sort === 'efficiency') return (a.state?.efficiency ?? 0) - (b.state?.efficiency ?? 0);
      // 'status' (default): running first, then idle, stopped, disconnected
      return (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.code.localeCompare(b.code);
    });

  // pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const fromN = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const toN = Math.min(safePage * PAGE_SIZE, filtered.length);
  // any filter/sort change jumps back to page 1
  useEffect(() => { setPage(1); }, [q, dept, status, sort, dateFrom, dateTo]);

  return (
    <div className="px-5 sm:px-7 pt-1 pb-10 space-y-4">
      {/* summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total Machines" value={counts.total} sub="Registered" color={INDIGO} icon={Layers} />
        <Kpi label="Running" value={counts.running} sub="Currently active" color={counts.running ? TEAL : STEEL} icon={Activity} />
        <Kpi label="Idle" value={counts.idle} sub="Waiting" color={AMBER} icon={Pause} />
        <Kpi label="Stopped" value={counts.stopped} sub="Need attention" color={counts.stopped ? RED : STEEL} icon={Square} />
      </div>

      {/* filters */}
      <div className="panel p-3.5 flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel/60 pointer-events-none" />
          <input
            placeholder="Search machine, job, fabric, order…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={cn(INPUT, 'w-full pl-9')}
          />
        </div>
        <select value={dept} onChange={(e) => setDept(e.target.value)} className={cn(INPUT, 'cursor-pointer')}>
          <option value="">All Departments</option>
          {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={cn(INPUT, 'cursor-pointer')}>
          <option value="">All Statuses</option>
          <option value="running">Running</option>
          <option value="idle">Idle</option>
          <option value="stopped">Stopped</option>
          <option value="disconnected">Disconnected</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className={cn(INPUT, 'cursor-pointer')} title="Sort by">
          <option value="name">Sort: Name (fixed order)</option>
          <option value="status">Sort: Status (running first)</option>
          <option value="production">Sort: Production ↓</option>
          <option value="efficiency">Sort: Efficiency ↑</option>
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={INPUT} title="View machines as of this date" aria-label="Date" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={INPUT} title="Optional end date for a range" aria-label="To (optional)" />
      </div>

      <div className="text-[13px] text-steel flex items-center gap-2.5 flex-wrap">
        <span>
          Showing <b className={B}>{fromN}–{toN}</b> of <b className={B}>{filtered.length}</b> machines ·{' '}
          {ranged
            ? <span className="text-accent font-bold">History · {rangeLabel}</span>
            : liveNow
              ? <span className="inline-flex items-center gap-1.5 text-running font-bold"><LiveDot /> Live</span>
              : <span className="inline-flex items-center gap-1.5 text-idle font-bold"><span className="w-2 h-2 rounded-full bg-idle" /> Last updated {fmtLastSeen(lastUpdated)}</span>}
        </span>
        {ranged && <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-accent font-bold text-[13px] hover:underline">Reset to live</button>}
      </div>

      {loading ? (
        <div className="text-steel py-10 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="panel p-10 text-center text-steel">No machines match your filters.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {pageItems.map((m) => (
              <MachineCard
                key={m._id}
                m={m}
                job={jobByMachine.get(m.code)}
                canConfigure={canConfigure}
                canReport={canReport}
                idleReport={idleByMachine.get(m.code)}
                onResolveIdle={(id) => resolveReport(id)}
              />
            ))}
          </div>
          <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
        </>
      )}

    </div>
  );
}

// ---- summary KPI tile (EKC card look: icon chip + big number) ----
function Kpi({ label, value, sub, color, icon: Icon }: { label: string; value: React.ReactNode; sub: string; color: string; icon: IconType }) {
  return (
    <div className="card p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="label">{label}</div>
        <div className="data text-3xl font-bold mt-1 leading-none" style={{ color }}>{value}</div>
        <div className="text-[11px] text-steel mt-1.5">{sub}</div>
      </div>
      <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}1a`, color }}>
        <Icon size={22} />
      </span>
    </div>
  );
}

// ---- pagination control (windowed page numbers + prev/next) ----
function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const go = (p: number) => {
    onChange(Math.min(totalPages, Math.max(1, p)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return (
    <div className="flex gap-1.5 items-center justify-center mt-5 flex-wrap">
      <button onClick={() => go(page - 1)} disabled={page <= 1} className={pagerCls(false, page <= 1)}>‹ Prev</button>
      {pageRange(page, totalPages).map((it, i) =>
        it === '…' ? (
          <span key={`e${i}`} className="px-1 text-steel/50">…</span>
        ) : (
          <button key={it} onClick={() => go(it as number)} className={pagerCls(it === page, false)}>{it}</button>
        )
      )}
      <button onClick={() => go(page + 1)} disabled={page >= totalPages} className={pagerCls(false, page >= totalPages)}>Next ›</button>
    </div>
  );
}

function pageRange(cur: number, total: number): (number | '…')[] {
  const out: (number | '…')[] = [1];
  const left = Math.max(2, cur - 1);
  const right = Math.min(total - 1, cur + 1);
  if (left > 2) out.push('…');
  for (let i = left; i <= right; i++) out.push(i);
  if (right < total - 1) out.push('…');
  if (total > 1) out.push(total);
  return out;
}

function pagerCls(active: boolean, disabled: boolean) {
  return cn(
    'min-w-9 h-9 px-2.5 rounded-lg text-[13px] font-bold border transition-colors',
    active ? 'bg-accent border-accent text-white' : 'bg-base border-line text-primary hover:border-accent/40',
    disabled && 'opacity-50 cursor-not-allowed'
  );
}

// recent series for a machine's hero metric → drives the card sparkline. Uses the existing
// /api/history endpoint; the trend is decorative, so fetch failures are ignored. Rows come
// newest-first, so we reverse them to chronological order for the line.
function useMachineSeries(code: string, metric: 'production' | 'efficiency', limit = 24): number[] {
  const [series, setSeries] = useState<number[]>([]);
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    api.get<{ rows: Array<Record<string, unknown>> }>('/api/history', { params: { machineId: code, page: 1, limit }, signal: ctrl.signal })
      .then((r) => {
        if (cancelled) return;
        const rows = r.data?.rows ?? [];
        setSeries(rows.map((x) => Number(x[metric]) || 0).reverse());
      })
      .catch(() => { /* decorative — ignore */ });
    return () => { cancelled = true; ctrl.abort(); };
  }, [code, metric, limit]);
  return series;
}

// ---- one machine card ----
function MachineCard({
  m, job, canConfigure, canReport, idleReport, onResolveIdle,
}: { m: MachineWithState; job?: JobRow; canConfigure: boolean; canReport: boolean; idleReport?: DowntimeReportRow; onResolveIdle: (id: string) => void }) {
  const s = m.state;
  const fresh = m.status !== 'disconnected';
  const isReactive = isReactiveSteamer(m.machineType?.name, m.department, m.code);
  const isDyeing = isDyeingMachine(m.machineType?.name, m.department, m.code);
  const production = s?.production ?? 0;
  const target = job?.targetProduction ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((production / target) * 100)) : 0;
  const downtimeMin = Math.round((s?.downtimeSec ?? 0) / 60);

  // adaptive production metrics — broad aliases so each machine's real fields resolve.
  // If a machine reports none of these (e.g. WASH-RANGE sends only trim %), fall back to
  // showing its own meaningful parameters instead of a grid of zeros.
  const dProd = dataNum(s?.data, ['production', 'fabricLength', 'length', 'length_Production', 'counter']);
  const dSpeed = dataNum(s?.data, ['speed', 'machineSpeed', 'fabricSpeed', 'reelSpeed']);
  const dTemp = dataNum(s?.data, ['temperature', 'temp', 'bathTemp', 'actualTemp', 'chamberTemperature', 'steamerTempActual']);
  const dWater = dataNum(s?.data, ['waterLPH', 'waterFlow', 'water', 'mainWater', 'mainWaterTotal', 'flow', 'steamFlowTotal', 'steamFlow']);
  const fitsProduction = [dProd, dSpeed, dTemp, dWater].filter((x) => x != null && x !== 0).length >= 2;
  const dynTiles = fitsProduction ? [] : dynamicMetricTiles(s?.data);

  // live dyeing readings (MAXI / cold-dyeing / soft-flow report these) — prefer over the
  // job's configured values so the batch card reflects the machine, not just the setup
  const liveStage = typeof s?.data?.stage === 'string' ? (s!.data!.stage as string) : '';
  const liveLiquor = dataNum(s?.data, ['liquorRatio']);
  const liveBathTemp = dataNum(s?.data, ['bathTemp', 'liquorTemp', 'actualTemp', 'temperature', 'temp']);
  const liveWaterPump = dataNum(s?.data, ['waterFlow', 'flow', 'water', 'fillLevelLitre']);
  const liveTurns = dataNum(s?.data, ['turns']);
  const liveDyeDosed = dataNum(s?.data, ['dyeDosed', 'dyeDosing', 'dosed']);
  // batch dyeing machines (MAXI / cold-dyeing) report live readings rather than a loaded-fabric
  // setup — show those instead of the job-config tiles (Loaded Meter / GLM / Loaded Time).
  // Keyed off batch-specific fields so soft-flow machines (which only send actualTemp etc.)
  // still use the loaded-fabric card.
  const hasLiveDyeing = liveTurns != null || liveDyeDosed != null || (dProd != null && dProd > 0);

  // ── EKC machine-card additions: live-signal awareness + hero metric + trend ──
  const fields = m.machineType?.fields ?? [];
  const isLiveVal = (v: unknown) => (typeof v === 'number' && v !== 0) || (typeof v === 'string' && v.trim() !== '');
  const sigTotal = fields.length || (s?.data ? Object.keys(s.data).length : 0);
  const sigLive = fields.length
    ? fields.filter((f) => isLiveVal(s?.data?.[f.key])).length
    : (s?.data ? Object.values(s.data).filter(isLiveVal).length : 0);
  // hero = the machine's headline metric (production/length), else efficiency — shown with a recent trend
  const heroProd = dataNum(s?.data, ['production', 'fabricLength', 'length', 'length_Production', 'lengthProduction', 'counter']);
  const heroHasProd = heroProd != null && heroProd !== 0;
  const hero = heroHasProd
    ? { label: isReactive ? 'Length / Production' : 'Production', value: fmtK(heroProd as number), unit: 'mtr', color: TEAL }
    : { label: 'Efficiency', value: `${s?.efficiency ?? 0}%`, unit: '', color: effColor(s?.efficiency ?? 0) };
  const series = useMachineSeries(m.code, heroHasProd ? 'production' : 'efficiency');

  return (
    <Link
      to={`/machines/${m.code}`}
      className="card p-3.5 flex flex-col h-full transition-all hover:shadow-md hover:border-accent/30 hover:-translate-y-0.5 group"
    >
      {/* header: code + name/dept, status pill, freshness */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="data font-extrabold text-sm text-primary group-hover:text-accent transition-colors truncate">{m.code}</div>
          <div className="text-[11px] text-steel mt-0.5 truncate" title={`${m.name} · ${m.department}`}>{m.name} · {m.department}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatusPill status={m.status} />
          <span className={cn('text-[10px] font-semibold inline-flex items-center gap-1', fresh ? 'text-running' : 'text-steel/60')}>
            {s ? (fresh ? <><LiveDot /> {fmtAgo(s.updatedAt)}</> : `Last ${fmtLastSeen(s.updatedAt)}`) : 'No data'}
          </span>
        </div>
      </div>

      {/* signals-live pill */}
      {sigTotal > 0 && (
        <div className="mt-2">
          <span className="pill bg-accent/10 text-accent">
            <span className={cn('w-1.5 h-1.5 rounded-full', fresh ? 'bg-accent' : 'bg-steel')} />
            {sigLive}/{sigTotal} signals live
          </span>
        </div>
      )}

      {/* persistent idle banner — stays until the downtime is resolved */}
      {idleReport && (
        <div className={cn(
          'mt-2 px-2.5 py-2 rounded-md border text-[11px]',
          idleReport.status === 'escalated' ? 'bg-stopped/10 border-stopped/30 text-stopped' : 'bg-idle/10 border-idle/30 text-idle'
        )}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-extrabold inline-flex items-center gap-1.5">
              <AlertTriangle size={12} />{idleReport.status === 'escalated' ? 'Idle (escalated)' : 'Reported idle'}
            </span>
            <span className="text-[10px] opacity-80">{idleReport.startedAt ? fmtAgo(idleReport.startedAt) : ''}</span>
          </div>
          <div className="mt-1 font-semibold truncate" title={`${idleReport.reason}${idleReport.note ? ` — ${idleReport.note}` : ''}`}>{idleReport.reason}{idleReport.note ? ` — ${idleReport.note}` : ''}</div>
          <div className="mt-0.5 text-[10px] opacity-85 truncate">
            by {idleReport.operatorName || 'operator'}{idleReport.escalatedToName ? ` · escalated to ${idleReport.escalatedToName}` : ''}
          </div>
          {(canConfigure || canReport) && (
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onResolveIdle(idleReport._id); }} className="mt-1.5 bg-accent text-white rounded-md px-2.5 py-1 text-[11px] font-bold hover:opacity-90 transition-opacity">
              ✓ Mark resolved
            </button>
          )}
        </div>
      )}

      {/* hero metric + inline sparkline */}
      <div className="mt-2.5 rounded-xl border border-line bg-base px-3.5 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="label">{hero.label}</div>
          <div className="flex items-baseline gap-1">
            <span className="data text-2xl font-bold leading-none" style={{ color: hero.color }}>{hero.value}</span>
            {hero.unit && <span className="text-sm font-medium text-steel">{hero.unit}</span>}
          </div>
        </div>
        {series.length > 1 && (
          <div className="w-24 h-11 shrink-0 self-center"><Sparkline data={series} height={44} color={hero.color} /></div>
        )}
      </div>

      {/* adaptive body — three branches, dense 3-up micro-tile strips */}
      {isReactive ? (
        <>
          <div className="grid grid-cols-3 gap-1.5 mt-2.5">
            <ReTile label="Length / Prod" v={dataNum(s?.data, ['length_Production', 'lengthProduction', 'length', 'production'])} unit="mtr" k />
            <ReTile label="Fabric Speed" v={dataNum(s?.data, ['fabricSpeed', 'speed', 'machineSpeed'])} unit="m/min" />
            <ReTile label="Chamber Temp" v={dataNum(s?.data, ['chamberTemperature', 'chamberTemp'])} unit="°c" tone="warm" />
            <ReTile label="Roof Temp" v={dataNum(s?.data, ['roofTemperature', 'roofTemp'])} unit="°c" tone="warm" />
            <ReTile label="Steam Pressure" v={dataNum(s?.data, ['steamPressure'])} unit="bar" />
            <ReTile label="Steam Flow" v={dataNum(s?.data, ['steamFlow', 'flow'])} unit="L/hr" tone="cool" />
          </div>
          {job ? (
            <div className="mt-2.5 pt-2.5 border-t border-line text-[11px] text-steel truncate" title={`Fabric: ${job.fabricName} · Job: ${job.jobNumber} · Order: ${job.orderNumber} · Operator: ${job.operatorName || '—'} · Supervisor: ${job.supervisorName || '—'}`}>
              <b className={B}>{job.fabricName}</b> · {job.jobNumber} · {job.orderNumber} · Op: <b className={B}>{job.operatorName || '—'}</b> · Sup: <b className={B}>{job.supervisorName || '—'}</b>
            </div>
          ) : (
            <div className="mt-2.5 pt-2.5 border-t border-line text-[11px] text-steel/60">No job assigned · use Configure</div>
          )}
        </>
      ) : isDyeing ? (
        <>
          {(job?.batchId || job?.processType) && (
            <div className="flex gap-1.5 mt-2.5 flex-wrap">
              {job?.batchId && <span className="bg-accent/10 text-accent rounded-md px-2 py-0.5 text-[11px] font-bold">Batch: {job.batchId}</span>}
              {job?.processType && <span className="bg-idle/10 text-idle rounded-md px-2 py-0.5 text-[11px] font-bold">{job.processType}</span>}
            </div>
          )}
          {hasLiveDyeing ? (
            <div className="grid grid-cols-3 gap-1.5 mt-2.5">
              <ReTile label="Production" v={dProd} unit="mtr" k />
              <ReTile label="Bath Temp" v={liveBathTemp} unit="°c" tone="warm" />
              <MetricTile label="Liquor Ratio" value={liveLiquor && liveLiquor > 0 ? `1:${liveLiquor}` : (job?.liquorRatio || '—')} />
              <ReTile label="Turns" v={liveTurns} />
              <ReTile label="Dye Dosed" v={liveDyeDosed} unit="L" />
              <ReTile label="Speed" v={dSpeed} unit="m/min" tone="cool" />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 mt-2.5">
              <MetricTile label="Loaded Meter" value={fmtK(target)} unit="mtr" />
              <MetricTile label="Stage" value={liveStage || job?.dyeStage || cap(m.status)} />
              <MetricTile label="GLM (Weight)" value={fmtK(job?.glm ?? 0)} unit="kg" />
              <MetricTile label="Liquor Ratio" value={liveLiquor && liveLiquor > 0 ? `1:${liveLiquor}` : (job?.liquorRatio || '—')} />
              <MetricTile label="Loaded" value={job?.loadedAt ? `${fmtLoaded(job.loadedAt)} · ${fmtSince(job.loadedAt)}` : '—'} tone={job?.loadedAt ? 'cool' : 'plain'} />
              <ReTile label="Water (Pump)" v={fresh ? liveWaterPump : null} unit="L" tone="cool" />
              <ReTile label="Temperature" v={fresh ? liveBathTemp : null} unit="°c" tone="warm" />
            </div>
          )}
          <div className="mt-2.5 pt-2.5 border-t border-line text-[11px] text-steel truncate" title={`Operator: ${job?.operatorName || '—'} · Supervisor: ${job?.supervisorName || '—'}`}>
            Op: <b className={B}>{job?.operatorName || '—'}</b> · Sup: <b className={B}>{job?.supervisorName || '—'}</b>
          </div>
        </>
      ) : (
        <>
          {fitsProduction ? (
            <div className="grid grid-cols-3 gap-1.5 mt-2.5">
              <ReTile label="Production" v={dProd} unit="mtr" k />
              <ReTile label="Speed" v={dSpeed} unit="m/min" />
              <ReTile label="Temperature" v={dTemp} unit="°c" tone="warm" />
              <MetricTile label="Efficiency" value={`${s?.efficiency ?? 0}%`} tone={(s?.efficiency ?? 0) < 1 ? 'warm' : 'plain'} />
              <ReTile label="Water Flow" v={dWater} unit="L/hr" tone="cool" k />
              <MetricTile label="Downtime" value={downtimeMin} unit="min" tone="warm" />
            </div>
          ) : dynTiles.length > 0 ? (
            <div className="grid grid-cols-3 gap-1.5 mt-2.5">
              {dynTiles.map((t) => <MetricTile key={t.label} label={t.label} value={t.value} />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 mt-2.5">
              <MetricTile label="Efficiency" value={`${s?.efficiency ?? 0}%`} tone={(s?.efficiency ?? 0) < 1 ? 'warm' : 'plain'} />
              <MetricTile label="Downtime" value={downtimeMin} unit="min" tone="warm" />
            </div>
          )}

          {/* production → target: slim inline secondary bar */}
          {fitsProduction && target > 0 && production > 0 ? (
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-steel">Prod <b className={B}>{fmtK(production)}</b> / <b className={B}>{fmtK(target)} mtr</b></span>
                <span className="data font-bold shrink-0" style={{ color: pct >= 100 ? TEAL : AMBER }}>{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-line overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: pct >= 100 ? TEAL : AMBER }} />
              </div>
            </div>
          ) : fitsProduction && target > 0 ? (
            <div className="mt-2.5 text-[11px] text-steel">
              Target: <b className={B}>{fmtK(target)} mtr</b> · <span className="text-steel/60">no output yet</span>
            </div>
          ) : null}

          {job ? (
            <div className="mt-2.5 pt-2.5 border-t border-line text-[11px] text-steel truncate" title={`Fabric: ${job.fabricName} · Job: ${job.jobNumber} · Order: ${job.orderNumber} · Operator: ${job.operatorName || '—'} · Supervisor: ${job.supervisorName || '—'}`}>
              <b className={B}>{job.fabricName}</b> · {job.jobNumber} · {job.orderNumber} · Op: <b className={B}>{job.operatorName || '—'}</b> · Sup: <b className={B}>{job.supervisorName || '—'}</b>
            </div>
          ) : (
            <div className="mt-2.5 pt-2.5 border-t border-line text-[11px] text-steel/60">No job assigned · use Configure</div>
          )}
        </>
      )}

      {/* footer — mt-auto pins to the card bottom; chevron slides on hover */}
      <div className="mt-auto pt-2.5 border-t border-line flex items-center justify-between text-[10px]">
        <span className="text-steel/70 truncate">{s ? fmtLastSeen(s.updatedAt) : '—'}</span>
        <span className="inline-flex items-center gap-0.5 text-accent/80 font-medium group-hover:text-accent transition-colors">
          View dashboard <ChevronRight size={11} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

// compact number: 47800 → "47.8K", 980 → "980"
export function fmtK(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

// BATCH dyeing machines (soft-flow, maxi, jet, cold-dyeing) get the batch-style card.
// Continuous machines — CBR, mercerizer, menzel, washer, AND reactive process steamers —
// get the production card (Production/Speed/Temp/Efficiency/Water/Downtime).
// Match across type, department AND the machine code/name, so records with missing
// type/department metadata (e.g. "colddyeing03") are still detected by their name.
export function isDyeingMachine(type?: string | null, department?: string, code?: string): boolean {
  const hay = `${type || ''} ${department || ''} ${code || ''}`.toLowerCase();
  // reactive process steamers get their own card (below), not the batch one
  if (isReactiveSteamer(type, department, code)) return false;
  return /maxi|jet|soft|cold[\s_-]?dy|dye|dying/.test(hay);
}
// reactive process steamers send steam/chamber params instead of production/temp/water
export function isReactiveSteamer(type?: string | null, department?: string, code?: string): boolean {
  const hay = `${type || ''} ${department || ''} ${code || ''}`.toLowerCase();
  return /reactive|steamer/.test(hay);
}
// read a numeric field from the raw PLC blob by any of several candidate keys (case-insensitive)
export function dataNum(data: Record<string, unknown> | undefined | null, keys: string[]): number | null {
  if (!data) return null;
  const lower: Record<string, unknown> = {};
  for (const k in data) lower[k.toLowerCase()] = data[k];
  for (const key of keys) {
    const v = lower[key.toLowerCase()];
    if (typeof v === 'number' && !isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);
  }
  return null;
}
// ---- compact micro-tile for the dense 3-up card grid (replaces the bulky Metric on cards) ----
// Mirrors Metric's tone palette but in a much shorter box so ~3 cards fit per xl row.
// Truncates long values with a title-tooltip so no field is silently lost.
function MetricTile({
  label, value, unit, tone = 'plain',
}: { label: string; value: React.ReactNode; unit?: string; tone?: 'plain' | 'warm' | 'cool' | 'bad' }) {
  const box =
    tone === 'warm' ? 'bg-idle/10' :
    tone === 'cool' ? 'bg-[#0EA5E9]/10' :
    tone === 'bad'  ? 'bg-stopped/10' : 'bg-base';
  const val =
    tone === 'warm' ? 'text-idle' :
    tone === 'cool' ? 'text-[#0EA5E9]' :
    tone === 'bad'  ? 'text-stopped' : 'text-primary';
  return (
    <div className={cn('rounded-md px-2 py-1.5 border border-line overflow-hidden', box)}>
      <div className="text-[9px] font-bold uppercase tracking-wide text-steel truncate" title={label}>{label}</div>
      <div className={cn('data text-xs font-semibold mt-0.5 truncate', val)} title={`${value}${unit ? ` ${unit}` : ''}`}>
        {value}{unit && <span className="text-[10px] font-normal text-steel/70 ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}

// raw-value variant — same "missing → —", k-compact, toFixed(2) rules as the old ReMetric,
// so per-branch numeric fields keep IDENTICAL formatting to the previous card; only the box shrinks.
function ReTile({ label, v, unit, tone = 'plain', k = false }: { label: string; v: number | null; unit?: string; tone?: 'plain' | 'warm' | 'cool' | 'bad'; k?: boolean }) {
  const display = v == null ? '—' : k ? fmtK(v) : Number.isInteger(v) ? String(v) : v.toFixed(2);
  return <MetricTile label={label} value={display} unit={unit} tone={tone} />;
}

// "fabricSpeed" → "Fabric Speed", "dosing1PidPct" → "Dosing1 Pid %"
export function humanizeKey(k: string): string {
  return k
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\bPct\b/gi, '%')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
// When a machine doesn't report the standard production metrics, surface its own most
// meaningful numeric parameters instead of a grid of zeros. Skips setpoints/counters/flags.
export function dynamicMetricTiles(data?: Record<string, unknown> | null, limit = 6): { label: string; value: string }[] {
  if (!data) return [];
  const skip = /setpoint|sp$|count$|tol$|mapped|seconds$|^set|actual$|target$/i;
  const out: { label: string; value: string }[] = [];
  for (const key of Object.keys(data)) {
    if (out.length >= limit) break;
    const v = data[key];
    if (typeof v !== 'number' || isNaN(v) || skip.test(key)) continue;
    out.push({ label: humanizeKey(key), value: Number.isInteger(v) ? String(v) : v.toFixed(2) });
  }
  return out;
}

// the 4 most relevant CURRENT readings for a machine — adapts to its family, mirroring the card
export function snapshotTiles(m: MachineWithState): { label: string; value: string }[] {
  const d = m.state?.data;
  const n = (keys: string[], k = false): string => {
    const v = dataNum(d, keys);
    return v == null ? '—' : k ? fmtK(v) : Number.isInteger(v) ? String(v) : v.toFixed(1);
  };
  const liquor = dataNum(d, ['liquorRatio']);
  const liquorStr = liquor && liquor > 0 ? `1:${liquor}` : '—';
  if (isReactiveSteamer(m.machineType?.name, m.department, m.code)) {
    return [
      { label: 'Length / Prod', value: n(['length_Production', 'lengthProduction', 'length', 'production'], true) },
      { label: 'Fabric Speed', value: n(['fabricSpeed', 'speed']) },
      { label: 'Chamber Temp', value: n(['chamberTemperature']) },
      { label: 'Steam Pressure', value: n(['steamPressure']) },
    ];
  }
  if (isDyeingMachine(m.machineType?.name, m.department, m.code)) {
    const turns = dataNum(d, ['turns']);
    const dyeDosed = dataNum(d, ['dyeDosed', 'dyeDosing']);
    const prod = dataNum(d, ['production', 'fabricLength', 'length']);
    if (turns != null || dyeDosed != null || (prod != null && prod > 0)) {
      return [
        { label: 'Production', value: n(['production', 'fabricLength', 'length'], true) },
        { label: 'Bath Temp', value: n(['bathTemp', 'temperature', 'temp']) },
        { label: 'Liquor Ratio', value: liquorStr },
        { label: 'Turns', value: n(['turns']) },
      ];
    }
    return [
      { label: 'Stage', value: typeof d?.stage === 'string' ? (d.stage as string) : '—' },
      { label: 'Liquor Ratio', value: liquorStr },
      { label: 'Temperature', value: n(['actualTemp', 'liquorTemp', 'bathTemp', 'temperature']) },
      { label: 'Reel Speed', value: n(['reelSpeed', 'speed']) },
    ];
  }
  const prod = dataNum(d, ['production', 'fabricLength', 'length', 'counter']);
  const speed = dataNum(d, ['speed', 'machineSpeed', 'fabricSpeed']);
  const temp = dataNum(d, ['temperature', 'temp', 'bathTemp']);
  const water = dataNum(d, ['waterLPH', 'waterFlow', 'water', 'mainWaterTotal', 'flow', 'steamFlowTotal']);
  if ([prod, speed, temp, water].filter((x) => x != null && x !== 0).length >= 2) {
    return [
      { label: 'Production', value: prod == null ? '—' : fmtK(prod) },
      { label: 'Speed', value: speed == null ? '—' : String(speed) },
      { label: 'Temperature', value: temp == null ? '—' : Number.isInteger(temp) ? String(temp) : temp.toFixed(1) },
      { label: 'Water', value: water == null ? '—' : fmtK(water) },
    ];
  }
  return dynamicMetricTiles(d, 4);
}

// "15 Apr 2026, 03:37 pm" — when fabric was loaded
export function fmtLoaded(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
  return `${date}, ${time}`;
}
// elapsed since loaded → "1345h 46m"
export function fmtSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!(ms > 0)) return '0h 0m';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}
export const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

// "06 Jun, 3:14:09 PM" — date + time for the history rows
export function fmtHistDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  return `${date}, ${time}`;
}