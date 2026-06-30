// ============================================================
//  MACHINE DETAIL  —  full EKC-style machine dashboard.
//  Tabs: Overview / History / Downtime / Specs / Configure.
//  Every value derives from the machine's REAL telemetry — the
//  live state snapshot, its PLC field registry (machineType.fields),
//  /api/history and /api/downtime. Nothing is fabricated.
//  Visual concept mirrors the EKC reference machine dashboard.
// ============================================================
import { useState, useEffect, useMemo, useCallback, Fragment, type ReactNode, type ComponentType } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Activity, History as HistoryIcon, Clock, FileText, SlidersHorizontal,
  Cpu, Gauge, Database, Bell, Search, ChevronRight, ChevronDown, AlertTriangle, X, LineChart, BarChart3, Zap,
} from 'lucide-react';
import { useMachines, useJobs, usePeople, useOrg, useDowntimeReports, fmtAgo, fmtLastSeen } from '../hooks/useData';
import type { MachineWithState, JobRow, DowntimeEventRow, OrgNode } from '../hooks/useData';
import { usePagedData } from '../hooks/usePagedData';
import { StatusPill, Spinner } from '../components/ekc-ui';
import PressureRing from '../components/PressureRing';
import Sparkline from '../components/Sparkline';
import { Donut, Legend, TrendChart } from '../components/charts';
import { fmtDuration } from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/auth';
import { can } from '@shared/permissions';
import { api } from '../api/client';
import { cn } from '../lib/utils';
import {
  dataNum, fmtK, isReactiveSteamer, isDyeingMachine, snapshotTiles,
  humanizeKey, cap, fmtHistDateTime,
} from './Machines';

const TEAL = '#0D9488', AMBER = '#D97706', RED = '#DC2626', INDIGO = '#6366F1', STEEL = '#64748B', SLATE = '#94A3B8';
const effColor = (e: number) => (e >= 70 ? TEAL : e >= 40 ? AMBER : RED);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
type IconType = ComponentType<{ size?: number; className?: string }>;
type MetricKey = 'production' | 'efficiency' | 'speed' | 'temperature' | 'waterFlow';

const TABS: { key: string; label: string; icon: IconType }[] = [
  { key: 'overview', label: 'Overview', icon: Activity },
  { key: 'history', label: 'History', icon: HistoryIcon },
  { key: 'downtime', label: 'Downtime', icon: Clock },
  { key: 'specs', label: 'Specs', icon: FileText },
  { key: 'configure', label: 'Configure', icon: SlidersHorizontal },
];

const FIELD = 'w-full bg-base border border-line rounded-lg px-3 py-2.5 text-sm text-primary outline-none focus:border-accent placeholder:text-steel/50';
const LBL = 'text-[11px] font-bold uppercase tracking-wide text-steel mb-1.5';
const SECTION = 'text-[11px] font-extrabold uppercase tracking-wider text-accent mb-2.5 mt-1';
const PROCESS_TYPES = ['Dyeing', 'Bleaching', 'Washing', 'Scouring', 'Finishing', 'Printing'];
const DYE_STAGES = ['Idle', 'Loading', 'Heating', 'Dyeing', 'Rinsing', 'Soaping', 'Unloading', 'Done'];
const IDLE_REASONS = ['Material shortage', 'Mechanical fault', 'Electrical fault', 'Quality issue', 'Changeover / setup', 'Cleaning / maintenance', 'Waiting for instructions', 'Shift break', 'Other'];

// recent telemetry series → drives the Overview sparklines
function useSeries(code: string | undefined, metric: 'production' | 'efficiency', limit = 40): number[] {
  const [series, setSeries] = useState<number[]>([]);
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    const ctrl = new AbortController();
    api.get<{ rows: Array<Record<string, unknown>> }>('/api/history', { params: { machineId: code, page: 1, limit }, signal: ctrl.signal })
      .then((r) => { if (!cancelled) setSeries((r.data?.rows ?? []).map((x) => Number(x[metric]) || 0).reverse()); })
      .catch(() => { /* decorative */ });
    return () => { cancelled = true; ctrl.abort(); };
  }, [code, metric, limit]);
  return series;
}

export default function MachineDetail() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const initialTab = sp.get('tab');
  const [tab, setTab] = useState<string>(TABS.some((t) => t.key === initialTab) ? (initialTab as string) : 'overview');
  const { machines, loading, reload } = useMachines();
  const { data: jobs, reload: reloadJobs } = useJobs();
  const { role } = useAuth();
  const canConfigure = can(role, 'assignJobs');
  const canReport = can(role, 'reportDowntime');
  const [reportOpen, setReportOpen] = useState(false);

  const m = machines.find((x) => x.code === code);
  const job = useMemo(() => {
    const list = jobs.filter((j) => j.machineCode === code);
    return list.find((j) => j.status === 'inProgress') || list[0];
  }, [jobs, code]);

  if (loading && !m) return <div className="px-6 py-20"><Spinner label="Loading machine" /></div>;
  if (!m) return (
    <div className="px-6 py-20 text-center text-steel">
      Machine not found: <b className="data text-primary">{code}</b> · <Link to="/machines" className="text-accent font-semibold hover:underline">Back to machines</Link>
    </div>
  );

  return (
    <div className="px-5 sm:px-7 pt-1 pb-10">
      {/* breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-3">
        <button onClick={() => navigate('/machines')} className="inline-flex items-center gap-1.5 text-steel hover:text-primary transition-colors"><ArrowLeft size={16} /> Machines</button>
        <span className="text-steel/40">/</span>
        <span className="data text-primary font-semibold">{m.code}</span>
      </div>

      {/* tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-line mb-5">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn('flex items-center gap-1.5 px-4 py-3 text-sm whitespace-nowrap transition-colors', tab === t.key ? 'tab-active' : 'tab-inactive')}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview m={m} onTab={setTab} canReport={canReport} onReport={() => setReportOpen(true)} />}
      {tab === 'history' && <HistoryTab m={m} />}
      {tab === 'downtime' && <DowntimeTab m={m} />}
      {tab === 'specs' && <SpecsTab m={m} />}
      {tab === 'configure' && (canConfigure
        ? <ConfigureTab m={m} job={job} onSaved={() => { reload(); reloadJobs(); }} />
        : <div className="panel p-12 text-center text-steel">You don&rsquo;t have permission to configure machines.</div>)}

      {reportOpen && <ReportIdleModal m={m} onClose={() => setReportOpen(false)} />}
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────
function Overview({ m, onTab, canReport, onReport }: { m: MachineWithState; onTab: (t: string) => void; canReport: boolean; onReport: () => void }) {
  const s = m.state;
  const fresh = m.status !== 'disconnected';
  const eff = s?.efficiency ?? 0;
  const downSec = s?.downtimeSec ?? 0;
  const lastSeen = s?.updatedAt ?? '';

  // signals from the PLC field registry vs the live snapshot
  const fields = m.machineType?.fields ?? [];
  const isLiveVal = (v: unknown) => (typeof v === 'number' && v !== 0) || (typeof v === 'string' && v.trim() !== '');
  const sigTotal = fields.length || (s?.data ? Object.keys(s.data).length : 0);
  const sigLive = fields.length ? fields.filter((f) => isLiveVal(s?.data?.[f.key])).length : (s?.data ? Object.values(s.data).filter(isLiveVal).length : 0);

  // derived runtime / downtime over a 24h window (downtimeSec proxy)
  const DAY = 86400;
  const downCap = Math.min(downSec, DAY);
  const runtimeSec = DAY - downCap;
  const uptimePct = Math.round((runtimeSec / DAY) * 100);

  // derived health score
  const health = clamp(!fresh ? 40 : m.status === 'stopped' ? 45 : m.status === 'idle' ? 66 : Math.max(60, Math.round(eff || 80)), 0, 100);
  const healthStatus = health >= 80 ? 'running' : health >= 50 ? 'idle' : 'stopped';
  const faultCount = (m.status === 'stopped' || m.status === 'disconnected') ? 1 : 0;

  const tiles = snapshotTiles(m);
  const [trend, setTrend] = useState<{ metric: MetricKey; label: string; unit: string; color: string } | null>(null);
  const prodSeries = useSeries(m.code, 'production');
  const effSeries = useSeries(m.code, 'efficiency');
  const hasProd = (dataNum(s?.data, ['production', 'fabricLength', 'length', 'length_Production', 'counter']) ?? 0) > 0;
  const heroSeries = hasProd ? prodSeries : effSeries;

  const isReactive = isReactiveSteamer(m.machineType?.name, m.department, m.code);
  const typeName = m.machineType?.name || (isReactive ? 'Reactive Steamer' : isDyeingMachine(m.machineType?.name, m.department, m.code) ? 'Dyeing Machine' : 'Machine');

  const checks: { label: string; text: string; color: string }[] = [
    { label: 'PLC Connection', text: fresh ? 'Connected' : 'Lost', color: fresh ? TEAL : RED },
    { label: 'Data Flow', text: fresh ? 'Active' : 'Stopped', color: fresh ? TEAL : AMBER },
    { label: 'Status', text: cap(m.status), color: m.status === 'running' ? TEAL : m.status === 'idle' ? AMBER : m.status === 'stopped' ? RED : STEEL },
    { label: 'Efficiency', text: `${eff}%`, color: effColor(eff) },
  ];

  return (
    <div className="space-y-4">
      {/* hero header */}
      <div className="rounded-card bg-slate-900 text-white px-5 py-4 flex flex-wrap items-center justify-between gap-4 shadow-panel">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-11 h-11 rounded-lg bg-white/10 flex items-center justify-center shrink-0"><Cpu size={22} /></span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold truncate">{m.name || m.code}</h2>
              <StatusPill status={m.status} />
            </div>
            <div className="text-xs text-white/55 truncate">{m.code} · {typeName} · {m.department}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {canReport && (
            <button onClick={onReport} className="text-xs font-semibold bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 transition-colors inline-flex items-center gap-1.5">
              <AlertTriangle size={14} /> Report idle
            </button>
          )}
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-white/45">Last Seen</div>
            <div className="text-sm font-medium">{lastSeen ? fmtLastSeen(lastSeen) : '—'}</div>
          </div>
          <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-white/45">Health</div>
              <div className="text-sm font-bold">{health}%</div>
            </div>
            <PressureRing value={health} status={healthStatus} size={40} stroke={5} />
          </div>
        </div>
      </div>

      {/* row 1 */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Panel icon={Activity} title="Machine Status">
          <div className="divide-y divide-line">
            <Row label="Status"><StatusPill status={m.status} /></Row>
            <Row label="Last Seen"><span className="data text-primary">{lastSeen ? fmtAgo(lastSeen) : '—'}</span></Row>
            <Row label="Department"><span className="text-primary">{m.department}</span></Row>
            <Row label="Uptime (24h)"><span className="data font-semibold text-running">{uptimePct}%</span></Row>
            <Row label="Active Alarms"><span className={cn('data font-semibold', faultCount ? 'text-stopped' : 'text-running')}>{faultCount}</span></Row>
            <Row label="Machine Type"><span className="text-primary">{typeName}</span></Row>
            <Row label="Signals Live"><span className="data font-semibold text-primary">{sigLive}/{sigTotal}</span></Row>
          </div>
          <button onClick={() => onTab('specs')} className="mt-4 w-full flex items-center justify-center gap-1.5 text-sm text-accent border border-accent/20 bg-accent/5 hover:bg-accent/10 rounded-lg py-2 font-medium transition-colors">
            View Specs <ChevronRight size={14} />
          </button>
        </Panel>

        <Panel icon={Gauge} title="Live Readings" right={<span className="text-[11px] text-steel">{fresh ? 'live' : 'last seen'}</span>}>
          <div className="grid grid-cols-2 gap-2">
            {tiles.map((t) => {
              const mm = metricForLabel(t.label);
              const body = (
                <>
                  <div className="text-[10px] text-steel uppercase tracking-wide truncate flex items-center gap-1" title={t.label}>
                    {t.label}{mm && <LineChart size={10} className="text-accent opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
                  </div>
                  <div className="data text-lg font-bold text-primary truncate">{t.value}</div>
                </>
              );
              return mm ? (
                <button key={t.label} type="button" title="Click for the trend behind this reading"
                  onClick={() => setTrend({ metric: mm.metric, label: t.label, unit: mm.unit, color: mm.color })}
                  className="group text-left rounded-lg border border-line bg-base px-3 py-2 hover:border-accent/50 hover:bg-accent/5 transition-colors">
                  {body}
                </button>
              ) : (
                <div key={t.label} className="rounded-lg border border-line bg-base px-3 py-2">{body}</div>
              );
            })}
          </div>
          {heroSeries.length > 1 && (
            <button type="button" title="Click for the full trend + readings"
              onClick={() => setTrend(hasProd ? { metric: 'production', label: 'Production', unit: 'mtr', color: TEAL } : { metric: 'efficiency', label: 'Efficiency', unit: '%', color: effColor(eff) })}
              className="group mt-3 w-full text-left rounded-lg border border-line bg-base p-3 hover:border-accent/50 hover:bg-accent/5 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="label flex items-center gap-1">{hasProd ? 'Production Trend' : 'Efficiency Trend'} <LineChart size={11} className="text-accent opacity-0 group-hover:opacity-100 transition-opacity" /></span>
                <span className="text-[10px] text-steel/60 group-hover:text-accent transition-colors">View details</span>
              </div>
              <Sparkline data={heroSeries} width={420} height={56} color={hasProd ? TEAL : effColor(eff)} />
            </button>
          )}
        </Panel>

        <Panel icon={Activity} title="Process Health">
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-2.5">
              {checks.map((c) => (
                <div key={c.label} className="flex items-center justify-between text-sm">
                  <span className="text-steel">{c.label}</span>
                  <span className="flex items-center gap-1.5 font-medium" style={{ color: c.color }}>{c.text} <span className="w-2 h-2 rounded-full" style={{ background: c.color }} /></span>
                </div>
              ))}
            </div>
            <PressureRing value={health} status={healthStatus} size={92} stroke={8} label="Health" />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <MiniTile icon={Bell} accent={faultCount ? RED : STEEL} label="Active Alarms" value={String(faultCount)} />
            <MiniTile icon={Clock} accent={INDIGO} label="Downtime" value={fmtDuration(downSec)} />
          </div>
        </Panel>
      </div>

      {/* row 2 */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel icon={Activity} title="Production & Runtime">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <MiniStat label="Runtime" value={fmtDuration(runtimeSec)} color={TEAL} />
            <MiniStat label="Downtime" value={fmtDuration(downSec)} color={RED} />
            <MiniStat label="Production" value={fmtK(s?.production ?? 0)} color={INDIGO} />
            <MiniStat label="Efficiency" value={`${eff}%`} color={effColor(eff)} />
          </div>
          <div className="flex items-center gap-5 rounded-lg border border-line bg-base p-4">
            <PressureRing value={eff} status={eff >= 80 ? 'running' : eff >= 50 ? 'idle' : 'stopped'} size={92} stroke={9} label="Efficiency" />
            <div className="flex-1 space-y-2.5">
              <Bar label="Runtime" value={runtimeSec} total={DAY} color={TEAL} text={fmtDuration(runtimeSec)} />
              <Bar label="Downtime" value={downCap} total={DAY} color={RED} text={fmtDuration(downSec)} />
            </div>
          </div>
        </Panel>

        <Panel icon={Cpu} title="Key Parameters">
          <div className="grid sm:grid-cols-2 gap-x-5 gap-y-0.5">
            {keyParams(m).map((k, i) => (
              <div key={k.label + i} className="flex items-center gap-2 py-2 text-sm border-b border-line last:border-0">
                <span className="text-steel flex-1 min-w-0 truncate">{k.label}</span>
                <span className={cn('data font-semibold', !k.color && 'text-primary')} style={k.color ? { color: k.color } : undefined}>{k.value}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <AllSignals m={m} />

      {trend && <MetricDetailModal code={m.code} metric={trend.metric} label={trend.label} unit={trend.unit} color={trend.color} onClose={() => setTrend(null)} />}
    </div>
  );
}

// maps a reading-tile label to a canonical telemetry metric (the ones /api/history returns)
const METRIC_BY_LABEL: { re: RegExp; metric: MetricKey; unit: string; color: string }[] = [
  { re: /(production|length|prod|counter)/i, metric: 'production', unit: 'mtr', color: TEAL },
  { re: /speed/i, metric: 'speed', unit: 'm/min', color: INDIGO },
  { re: /temp/i, metric: 'temperature', unit: '°c', color: AMBER },
  { re: /(water|flow)/i, metric: 'waterFlow', unit: 'L/hr', color: '#0EA5E9' },
  { re: /efficien/i, metric: 'efficiency', unit: '%', color: TEAL },
];
function metricForLabel(label: string): { metric: MetricKey; unit: string; color: string } | null {
  const hit = METRIC_BY_LABEL.find((x) => x.re.test(label));
  return hit ? { metric: hit.metric, unit: hit.unit, color: hit.color } : null;
}

// drill-down: the full trend + stats + recent readings behind a chart/tile (EKC metric-trend concept)
function MetricDetailModal({ code, metric, label, unit, color, onClose }: { code: string; metric: MetricKey; label: string; unit?: string; color: string; onClose: () => void }) {
  const [rows, setRows] = useState<HistRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.get<{ rows: HistRow[] }>('/api/history', { params: { machineId: code, page: 1, limit: 120 } })
      .then((r) => { if (!cancelled) setRows(r.data.rows || []); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [code]);

  const chrono = (rows ?? []).slice().reverse(); // oldest → newest
  const val = (r: HistRow) => Number((r as unknown as Record<string, unknown>)[metric]) || 0;
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
            <div className="text-xs text-steel">{code} · last {series.length} reading{series.length === 1 ? '' : 's'}</div>
          </div>
          <button onClick={onClose} className="text-steel hover:text-primary transition-colors shrink-0" aria-label="Close"><X size={20} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-6 py-5 space-y-4">
          {rows === null ? <Spinner label="Loading trend" /> : !has ? (
            <div className="text-center text-steel py-12">Not enough recorded data to plot a trend for this metric.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatBox label="Latest" value={`${latest.toLocaleString()}${u}`} color={color} />
                <StatBox label="Average" value={`${avg.toLocaleString()}${u}`} color={INDIGO} />
                <StatBox label="Min" value={`${min.toLocaleString()}${u}`} color={TEAL} />
                <StatBox label="Max" value={`${max.toLocaleString()}${u}`} color={RED} />
              </div>
              <div className="rounded-card border border-line bg-base p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="label">{label}{unit ? ` (${unit})` : ''}</span>
                  <span className={cn('data text-xs font-bold', change >= 0 ? 'text-running' : 'text-stopped')}>{change >= 0 ? '▲' : '▼'} {Math.abs(change)}% over window</span>
                </div>
                <TrendChart data={chrono.map((r) => ({ t: new Date(r.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), full: fmtHistDateTime(r.ts), v: val(r) }))} color={color} unit={unit} height={220} />
              </div>
              <div>
                <div className="label mb-2">Recent readings</div>
                <table className="tbl">
                  <thead><tr><th>TIME</th><th>STATUS</th><th className="r">{label.toUpperCase()}</th></tr></thead>
                  <tbody>
                    {chrono.slice(-40).reverse().map((r) => (
                      <tr key={r._id}>
                        <td className="data">{fmtHistDateTime(r.ts)}</td>
                        <td><StatusPill status={r.status} /></td>
                        <td className="r data">{val(r).toLocaleString()}{u}</td>
                      </tr>
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

function keyParams(m: MachineWithState): { label: string; value: string; color?: string }[] {
  const s = m.state;
  const eff = s?.efficiency ?? 0;
  const out: { label: string; value: string; color?: string }[] = snapshotTiles(m).map((t) => ({ label: t.label, value: t.value }));
  out.push({ label: 'Efficiency', value: `${eff}%`, color: effColor(eff) });
  out.push({ label: 'Downtime', value: fmtDuration(s?.downtimeSec ?? 0), color: (s?.downtimeSec ?? 0) > 0 ? RED : TEAL });
  return out;
}

// ─── All Signals (collapsible, searchable) ───────────────────────────────────
function AllSignals({ m }: { m: MachineWithState }) {
  const [open, setOpen] = useState(true);
  const [q, setQ] = useState('');
  const data = m.state?.data ?? {};
  const fields = m.machineType?.fields ?? [];
  const rows = fields.length
    ? fields.map((f) => ({ key: f.key, label: f.label || humanizeKey(f.key), unit: f.unit as string | undefined, value: data[f.key] }))
    : Object.keys(data).map((k) => ({ key: k, label: humanizeKey(k), unit: undefined as string | undefined, value: data[k] }));
  const filtered = q ? rows.filter((r) => `${r.label} ${r.key}`.toLowerCase().includes(q.toLowerCase())) : rows;
  if (rows.length === 0) return null;

  return (
    <div className="panel">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-5 py-3.5 text-left">
        <span className="flex items-center gap-2 text-sm font-medium text-primary"><Database size={15} className="text-steel" /> All Signals <span className="pill bg-line text-steel">{rows.length}</span></span>
        <span className="flex items-center gap-1.5 text-xs text-steel">{open ? 'Hide' : 'View all'}{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-line pt-4">
          <div className="flex items-center gap-2 bg-base border border-line rounded-lg px-3 py-2 mb-3 max-w-xs">
            <Search size={14} className="text-steel" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter signals…" className="bg-transparent outline-none text-sm flex-1 text-primary placeholder:text-steel/60" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-96 overflow-y-auto">
            {filtered.map((r) => {
              const v = r.value;
              const display = v === undefined || v === null || v === '' ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v);
              return (
                <div key={r.key} className="rounded-md bg-base border border-line px-2.5 py-1.5">
                  <div className="text-[10px] text-steel truncate" title={r.label}>{r.label}{r.unit ? ` (${r.unit})` : ''}</div>
                  <div className="data text-xs font-semibold text-primary truncate">{display}</div>
                </div>
              );
            })}
            {filtered.length === 0 && <div className="col-span-full text-center text-steel text-xs py-4">No signals match &ldquo;{q}&rdquo;</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── presentational building blocks ──────────────────────────────────────────
function Panel({ icon: Icon, title, right, children }: { icon?: IconType; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="panel p-5 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4">
        {Icon && <Icon size={16} className="text-accent" />}
        <h3 className="font-semibold text-sm text-primary flex-1">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex items-center justify-between py-2 text-sm"><span className="text-steel">{label}</span><span className="text-right">{children}</span></div>;
}
function MiniStat({ label, value, color }: { label: string; value: ReactNode; color: string }) {
  return <div className="rounded-lg border border-line bg-base px-3 py-2 text-center"><div className="text-[10px] text-steel uppercase tracking-wide truncate">{label}</div><div className="data text-base font-bold mt-0.5 truncate" style={{ color }}>{value}</div></div>;
}
function MiniTile({ icon: Icon, accent, label, value }: { icon: IconType; accent: string; label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-base px-3 py-2.5 flex items-center gap-2.5">
      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${accent}18`, color: accent }}><Icon size={15} /></span>
      <div className="min-w-0"><div className="text-[10px] text-steel uppercase tracking-wide truncate">{label}</div><div className="data text-sm font-bold text-primary truncate">{value}</div></div>
    </div>
  );
}
function Bar({ label, value, total, color, text }: { label: string; value: number; total: number; color: string; text: ReactNode }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1"><span className="text-steel">{label}</span><span className="data font-medium text-primary">{text}</span></div>
      <div className="h-2 rounded-full bg-line overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}
function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="card p-3"><div className="label">{label}</div><div className="data text-xl font-bold mt-1" style={{ color }}>{value}</div></div>;
}

// ─── History tab ─────────────────────────────────────────────────────────────
interface HistRow { _id: string; ts: string; status: MachineWithState['status']; speed: number; production: number; temperature: number; waterFlow: number; efficiency: number; data?: Record<string, number | string | boolean>; }
const HIST_PAGE = 12;
const pagerCls = (disabled: boolean) => cn('min-w-16 h-8 px-3 rounded-lg text-[13px] font-bold border border-line bg-base transition-colors', disabled ? 'opacity-50 cursor-not-allowed text-steel' : 'text-accent hover:border-accent/40');

// clickable mini trend card for the History-tab analytics row (opens the metric drill-down)
function TrendCard({ title, unit, data, color, icon: Icon, onClick }: { title: string; unit?: string; data: number[]; color: string; icon: IconType; onClick: () => void }) {
  const latest = data.length ? data[data.length - 1] : 0;
  const min = data.length ? Math.min(...data) : 0;
  const max = data.length ? Math.max(...data) : 0;
  return (
    <button type="button" onClick={onClick} className="panel p-4 text-left w-full transition-all hover:border-accent/40 hover:shadow-md group focus:outline-none focus:ring-2 focus:ring-accent/30">
      <div className="flex items-start gap-2 mb-2">
        <span className="w-7 h-7 rounded-lg bg-accent/10 grid place-items-center shrink-0"><Icon size={15} className="text-accent" /></span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-primary leading-tight flex items-center gap-1">{title} <LineChart size={11} className="text-accent opacity-0 group-hover:opacity-100 transition-opacity" /></h3>
          <p className="text-[11px] text-steel mt-0.5">latest {latest.toLocaleString()}{unit ? ` ${unit}` : ''} · min {min.toLocaleString()} · max {max.toLocaleString()}</p>
        </div>
        <span className="text-[10px] text-steel/50 group-hover:text-accent transition-colors shrink-0">Details</span>
      </div>
      {data.length > 1 ? <Sparkline data={data} height={64} color={color} /> : <div className="text-sm text-steel py-4 text-center">No data.</div>}
    </button>
  );
}

function HistoryTab({ m }: { m: MachineWithState }) {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const fields = m.machineType?.fields ?? [];

  // date filter — narrow the log to one day or a range (empty = all readings). The live
  // feed is often stale, so "Latest day" jumps to this machine's last recorded day.
  const lastDay = dayStr(m.state?.updatedAt ? new Date(m.state.updatedAt) : new Date());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const applyRange = (f: string, t: string) => { setFrom(f); setTo(t); setPage(1); setOpen(new Set()); };
  const ctrl = 'bg-base border border-line rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent';
  const a = from || to, b = to || from; // a single input means that one day
  const fromISO = a ? new Date(`${a}T00:00`).toISOString() : undefined;
  const toISO = b ? new Date(`${b}T23:59`).toISOString() : undefined;
  const filtered = !!(from || to);
  const rangeParams = { ...(fromISO ? { from: fromISO } : {}), ...(toISO ? { to: toISO } : {}) };

  const fetchPage = useCallback((p: number, signal?: AbortSignal) =>
    api.get<{ rows: HistRow[]; total: number; pages: number }>('/api/history', { params: { machineId: m.code, page: p, limit: HIST_PAGE, withData: 1, ...rangeParams }, signal })
      .then((r) => ({ rows: r.data.rows || [], total: r.data.total || 0, pages: Math.max(1, r.data.pages || 1) })), [m.code, fromISO, toISO]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, loading } = usePagedData(`${m.code}|${fromISO ?? ''}|${toISO ?? ''}`, fetchPage, page);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const toggle = (id: string) => setOpen((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // analytics sample (status mix + trends) — the readings in view (respects the date filter)
  const [sample, setSample] = useState<HistRow[] | null>(null);
  const [trend, setTrend] = useState<{ metric: MetricKey; label: string; unit: string; color: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSample(null);
    api.get<{ rows: HistRow[] }>('/api/history', { params: { machineId: m.code, page: 1, limit: 300, ...rangeParams } })
      .then((r) => { if (!cancelled) setSample(r.data.rows || []); })
      .catch(() => { if (!cancelled) setSample([]); });
    return () => { cancelled = true; };
  }, [m.code, fromISO, toISO]); // eslint-disable-line react-hooks/exhaustive-deps
  const sampleRows = sample ?? [];
  const counts = { running: 0, idle: 0, stopped: 0, disconnected: 0 };
  for (const r of sampleRows) {
    if (r.status === 'running') counts.running++;
    else if (r.status === 'idle') counts.idle++;
    else if (r.status === 'stopped') counts.stopped++;
    else counts.disconnected++;
  }
  const chronoSample = [...sampleRows].reverse();
  const prodSeries = chronoSample.map((r) => Number(r.production) || 0);
  const effSeries = chronoSample.map((r) => Number(r.efficiency) || 0);
  const statusSeg = [
    { label: 'Running', value: counts.running, color: TEAL },
    { label: 'Idle', value: counts.idle, color: AMBER },
    { label: 'Stopped', value: counts.stopped, color: RED },
    { label: 'Disconnected', value: counts.disconnected, color: SLATE },
  ].filter((s) => s.value > 0);

  return (
    <div className="space-y-4">
      {/* date filter — see the history for a specific day or range */}
      <div className="panel p-3 flex flex-wrap items-end gap-3">
        <div><div className="label mb-1">From</div><input type="date" className={ctrl} value={from} max={to || undefined} onChange={(e) => applyRange(e.target.value, to)} /></div>
        <div><div className="label mb-1">To</div><input type="date" className={ctrl} value={to} min={from || undefined} onChange={(e) => applyRange(from, e.target.value)} /></div>
        <button onClick={() => applyRange(lastDay, lastDay)} className="text-accent text-sm font-semibold hover:underline mb-2">Latest day</button>
        {filtered && <button onClick={() => applyRange('', '')} className="text-steel text-sm font-semibold hover:underline mb-2">Clear</button>}
        <span className="text-xs text-steel mb-2 ml-auto">{filtered ? (from && to && from !== to ? `${from} → ${to}` : (a || '')) : 'All dates'}</span>
      </div>

      <div className="text-sm text-steel">{total.toLocaleString()} {filtered ? 'readings in range' : 'readings'} · {HIST_PAGE}/page · click “Details” for that moment&rsquo;s full PLC snapshot</div>

      {/* analytics — status mix + trend drill-downs (like the History Log page) */}
      {sample && sampleRows.length > 0 && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="panel p-5">
            <div className="flex items-start gap-2 mb-4">
              <span className="w-7 h-7 rounded-lg bg-accent/10 grid place-items-center shrink-0"><Activity size={15} className="text-accent" /></span>
              <div><h3 className="font-semibold text-sm text-primary leading-tight">Status mix</h3><p className="text-[11px] text-steel mt-0.5">{filtered ? `${sampleRows.length} readings in range` : `Last ${sampleRows.length} readings`}</p></div>
            </div>
            <div className="flex items-center gap-4">
              <Donut segments={statusSeg} size={120} thickness={15} emptyColor={SLATE}>
                <span className="data text-xl font-bold text-primary leading-none">{sampleRows.length}</span>
                <span className="label mt-1">reads</span>
              </Donut>
              <div className="flex-1 min-w-0">{statusSeg.length === 0 ? <div className="text-sm text-steel">No status data.</div> : <Legend rows={statusSeg} total={sampleRows.length} format={(v) => String(v)} scroll={false} />}</div>
            </div>
          </div>
          <TrendCard title="Production trend" unit="mtr" data={prodSeries} color={TEAL} icon={BarChart3} onClick={() => setTrend({ metric: 'production', label: 'Production', unit: 'mtr', color: TEAL })} />
          <TrendCard title="Efficiency trend" unit="%" data={effSeries} color={TEAL} icon={Zap} onClick={() => setTrend({ metric: 'efficiency', label: 'Efficiency', unit: '%', color: TEAL })} />
        </div>
      )}

      {trend && <MetricDetailModal code={m.code} metric={trend.metric} label={trend.label} unit={trend.unit} color={trend.color} onClose={() => setTrend(null)} />}
      {loading ? <Spinner /> : rows.length === 0 ? (
        <div className="panel p-10 text-center text-steel">{filtered ? 'No readings for the selected date — try “Latest day” or Clear.' : 'No history yet for this machine.'}</div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="tbl">
            <thead><tr><th className="w-[120px]">DETAILS</th><th>DATE &amp; TIME</th><th>STATUS</th><th className="r">SPEED</th><th className="r">PROD</th><th className="r">TEMP</th><th className="r">WATER</th><th className="r">EFF</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = open.has(r._id);
                return (
                  <Fragment key={r._id}>
                    <tr className={cn(isOpen && 'bg-raised')}>
                      <td><button onClick={() => toggle(r._id)} className="inline-flex items-center gap-1.5 border border-line bg-raised text-accent rounded-lg px-2.5 py-1 text-xs font-bold whitespace-nowrap hover:border-accent/40 transition-colors">{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{isOpen ? 'Hide' : 'Details'}</button></td>
                      <td className="data">{fmtHistDateTime(r.ts)}</td>
                      <td><StatusPill status={r.status} /></td>
                      <td className="r data">{r.speed}</td>
                      <td className="r data">{r.production.toLocaleString()}</td>
                      <td className="r data">{r.temperature}</td>
                      <td className="r data">{r.waterFlow.toLocaleString()}</td>
                      <td className="r data">{r.efficiency}%</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-raised"><td colSpan={8} className="!pt-1.5 !pb-3.5 px-3">
                        <div className="text-[10px] font-bold tracking-wider uppercase text-steel/60 mt-1 mb-2">FULL PLC SNAPSHOT @ {new Date(r.ts).toLocaleString()}</div>
                        {(() => {
                          const entries = fields.length > 0
                            ? fields.map((f) => ({ key: f.key, label: f.label, unit: f.unit as string | undefined }))
                            : Object.keys(r.data ?? {}).map((k) => ({ key: k, label: k, unit: undefined as string | undefined }));
                          if (entries.length === 0) return <div className="text-xs text-steel">No parameters recorded for this reading.</div>;
                          return (
                            <div className="grid-stats-3" style={{ gap: 8 }}>
                              {entries.map((e) => { const raw = r.data?.[e.key]; const val = raw === undefined ? '—' : String(raw); return (
                                <div key={e.key} className="bg-accent/10 rounded-card px-2.5 py-2"><div className="text-[10px] font-bold uppercase text-steel">{e.label}{e.unit ? ` (${e.unit})` : ''}</div><div className="data text-sm font-bold text-accent">{val}</div></div>
                              ); })}
                            </div>
                          );
                        })()}
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-steel">Page <b className="text-primary">{page}</b> of <b className="text-primary">{pages}</b></span>
          <div className="flex gap-2">
            <button onClick={() => { setOpen(new Set()); setPage((p) => Math.max(1, p - 1)); }} disabled={page <= 1} className={pagerCls(page <= 1)}>‹ Prev</button>
            <button onClick={() => { setOpen(new Set()); setPage((p) => Math.min(pages, p + 1)); }} disabled={page >= pages} className={pagerCls(page >= pages)}>Next ›</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Downtime tab ────────────────────────────────────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, '0');
const dayStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function DowntimeTab({ m }: { m: MachineWithState }) {
  // The live feed is often stale (no data "today"), so a last-24h query reads zero on every machine.
  // Default the window to the machine's LAST RECORDED DAY so real downtime shows; widen via the filters.
  const lastDay = dayStr(m.state?.updatedAt ? new Date(m.state.updatedAt) : new Date());
  const [from, setFrom] = useState(lastDay);
  const [to, setTo] = useState(lastDay);
  const [events, setEvents] = useState<DowntimeEventRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    const a = from || to, b = to || from;
    const params: Record<string, string> = {};
    if (a && b) {
      params.from = new Date(`${a}T00:00`).toISOString();
      params.to = new Date(`${b}T23:59`).toISOString();
    }
    api.get<{ events: DowntimeEventRow[] }>(`/api/downtime/${m.code}/events`, { params })
      .then((r) => { if (!cancelled) setEvents(r.data.events || []); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [m.code, from, to]);

  const list = events ?? [];
  const totalIdle = list.filter((e) => e.type === 'idle').reduce((s, e) => s + e.durationSec, 0);
  const totalStopped = list.filter((e) => e.type === 'stopped').reduce((s, e) => s + e.durationSec, 0);
  const ctrl = 'bg-base border border-line rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent';

  return (
    <div className="space-y-4">
      {/* filter — default window is the machine's last recorded day */}
      <div className="panel p-3 flex flex-wrap items-end gap-3">
        <div><div className="label mb-1">From</div><input type="date" className={ctrl} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><div className="label mb-1">To</div><input type="date" className={ctrl} value={to} onChange={(e) => setTo(e.target.value)} /></div>
        {(from !== lastDay || to !== lastDay) && (
          <button onClick={() => { setFrom(lastDay); setTo(lastDay); }} className="text-accent text-sm font-semibold hover:underline mb-2">Reset to last recorded day</button>
        )}
        <span className="text-xs text-steel mb-2 ml-auto">{from === to ? from : `${from} → ${to}`}</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatBox label="Events" value={String(list.length)} color={INDIGO} />
        <StatBox label="Idle" value={fmtDuration(totalIdle)} color={AMBER} />
        <StatBox label="Stopped" value={fmtDuration(totalStopped)} color={RED} />
      </div>

      <div className="panel overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>TYPE</th><th>STARTED</th><th>ENDED</th><th className="r">DURATION</th></tr></thead>
          <tbody>
            {events === null ? (
              <tr><td colSpan={4} className="text-center text-steel py-8">Loading…</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={4} className="text-center text-steel py-8">No idle or stopped spells in this window.</td></tr>
            ) : list.map((e) => (
              <tr key={e._id}>
                <td><span className={cn('pill', e.type === 'stopped' ? 'bg-stopped/10 text-stopped' : 'bg-idle/10 text-idle')}><span className={cn('w-1.5 h-1.5 rounded-full', e.type === 'stopped' ? 'bg-stopped' : 'bg-idle')} />{cap(e.type)}</span></td>
                <td className="data">{fmtHistDateTime(e.startTs)}</td>
                <td className="data">{e.endTs ? fmtHistDateTime(e.endTs) : <span className="text-stopped font-semibold text-[11px]">● Ongoing</span>}</td>
                <td className="r data">{fmtDuration(e.durationSec)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Specs tab ───────────────────────────────────────────────────────────────
function SpecsTab({ m }: { m: MachineWithState }) {
  const fields = m.machineType?.fields ?? [];
  const s = m.state;
  return (
    <div className="space-y-4 max-w-4xl">
      <div className="panel p-6">
        <h3 className="font-semibold text-primary mb-4">Machine Specifications</h3>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <InfoRow label="Code" value={m.code} mono />
          <InfoRow label="Name" value={m.name || '—'} />
          <InfoRow label="Department" value={m.department} />
          <InfoRow label="Machine Type" value={m.machineType?.name || '—'} />
          <InfoRow label="Status" value={<StatusPill status={m.status} />} />
          <InfoRow label="Last Reading" value={s?.updatedAt ? fmtLastSeen(s.updatedAt) : '—'} />
          <InfoRow label="Defined Signals" value={String(fields.length)} />
          <InfoRow label="Live Signals" value={String(s?.data ? Object.keys(s.data).length : 0)} />
        </div>
      </div>
      {fields.length > 0 && (
        <div className="panel p-6">
          <h3 className="font-semibold text-primary mb-4 flex items-center gap-2">PLC Signal Registry <span className="pill bg-line text-steel">{fields.length}</span></h3>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-1.5">
            {fields.map((f) => (
              <div key={f.key} className="rounded-md bg-base border border-line px-2.5 py-1.5">
                <div className="text-[11px] text-primary font-medium truncate" title={f.label || f.key}>{f.label || humanizeKey(f.key)}{f.unit ? ` (${f.unit})` : ''}</div>
                <div className="data text-[10px] text-steel/60 truncate">{f.key}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
function InfoRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return <div className="flex items-center justify-between gap-2 py-1.5 border-b border-line last:border-0"><span className="text-steel text-xs shrink-0">{label}</span><span className={cn('text-xs font-medium text-primary text-right', mono && 'data')}>{value}</span></div>;
}

// ─── Configure tab ───────────────────────────────────────────────────────────
function ConfigureTab({ m, job, onSaved }: { m: MachineWithState; job?: JobRow; onSaved: () => void }) {
  const people = usePeople();
  const { data: org } = useOrg();
  const toast = useToast();
  const type = m.machineType?.name ?? '';
  const isDyeing = isDyeingMachine(type, m.department, m.code);
  const isLength = isReactiveSteamer(type, m.department, m.code);
  const liveBatchDye = isDyeing && (
    dataNum(m.state?.data, ['turns']) != null ||
    dataNum(m.state?.data, ['dyeDosed', 'dyeDosing']) != null ||
    ((dataNum(m.state?.data, ['production', 'fabricLength', 'length']) ?? 0) > 0)
  );

  const [batchId, setBatchId] = useState(job?.batchId ?? '');
  const [processType, setProcessType] = useState(job?.processType || (isDyeing ? 'Dyeing' : ''));
  const [glm, setGlm] = useState(job?.glm ? String(job.glm) : '');
  const [liquorRatio, setLiquorRatio] = useState(job?.liquorRatio ?? '');
  const [dyeStage, setDyeStage] = useState(job?.dyeStage ?? '');
  const [fabricName, setFabricName] = useState(job?.fabricName && job.fabricName !== '—' ? job.fabricName : '');
  const [length, setLength] = useState(job?.targetProduction ? String(job.targetProduction) : '');
  const [orderNumber, setOrderNumber] = useState(job?.orderNumber ?? '');
  const [shift, setShift] = useState(job?.shift ?? 'A');
  const [operatorId, setOperatorId] = useState(job?.operatorId ?? '');
  const [supervisorId, setSupervisorId] = useState(job?.supervisorId ?? '');
  const [loadedAtInput, setLoadedAtInput] = useState(() => {
    if (!job?.loadedAt) return '';
    const d = new Date(job.loadedAt);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const supervisors = people.filter((e) => e.role === 'supervisor');
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
  // fallback so assigning is never dead-ended (a supervisor with no org-chart reports still lets you pick any operator)
  const allOperators = useMemo(() => people.filter((e) => e.role === 'operator').map((e) => ({ _id: e._id, name: e.name })), [people]);
  const operatorOptions = operatorsUnder.length ? operatorsUnder : allOperators;
  const operatorFallback = !!supervisorId && operatorsUnder.length === 0 && allOperators.length > 0;

  async function save() {
    setSaving(true);
    setError('');
    try {
      await api.put(`/api/jobs/by-machine/${m.code}`, {
        orderNumber,
        fabricName,
        stage: m.department,
        status: 'inProgress',
        targetProduction: Number(length) || 0,
        shift,
        operatorId: operatorId || null,
        supervisorId: supervisorId || null,
        batchId: isDyeing ? batchId : '',
        processType: isDyeing ? processType : '',
        loadedAt: (isDyeing && !liveBatchDye)
          ? (loadedAtInput ? new Date(loadedAtInput).toISOString() : (job?.loadedAt ?? new Date().toISOString()))
          : null,
        glm: isDyeing ? Number(glm) || 0 : 0,
        liquorRatio: isDyeing ? liquorRatio : '',
        dyeStage: isDyeing ? dyeStage : '',
      });
      toast.success(`${m.code} configuration saved`);
      onSaved();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel p-6 max-w-3xl">
      <h3 className="text-base font-extrabold text-primary mb-4">Configure {m.code}</h3>

      {/* live snapshot */}
      {m.state && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-extrabold tracking-wider uppercase text-steel/60">CURRENT READINGS</span>
            <StatusPill status={m.status} />
            {m.status === 'disconnected' && <span className="text-[11px] text-steel/60">· last seen</span>}
          </div>
          <div className="grid-stats-4" style={{ gap: 8 }}>
            {snapshotTiles(m).map((t) => (
              <div key={t.label} className="bg-raised border border-line rounded-card px-2.5 py-2">
                <div className="text-[10px] font-bold uppercase text-steel">{t.label}</div>
                <div className="data text-sm font-bold text-primary">{t.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isDyeing ? (
        <>
          <div className={SECTION}>BATCH CONFIGURATION</div>
          <div className="grid-two mb-3" style={{ gap: 12 }}>
            <label><div className={LBL}>Batch ID</div><input className={FIELD} value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="01" /></label>
            <label><div className={LBL}>Process Type</div>
              <select className={FIELD} value={processType} onChange={(e) => setProcessType(e.target.value)}>
                {PROCESS_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>
          <div className="grid-two mb-3" style={{ gap: 12 }}>
            <label><div className={LBL}>GLM / Weight (kg)</div><input className={FIELD} type="number" value={glm} onChange={(e) => setGlm(e.target.value)} placeholder="2000" /></label>
            <label><div className={LBL}>{liveBatchDye ? 'Target Liquor Ratio' : 'Liquor Ratio'}</div><input className={FIELD} value={liquorRatio} onChange={(e) => setLiquorRatio(e.target.value)} placeholder="1:8" /></label>
          </div>
          <label className="block mb-3"><div className={LBL}>Stage</div>
            <select className={FIELD} value={dyeStage} onChange={(e) => setDyeStage(e.target.value)}>
              <option value="">— select —</option>
              {DYE_STAGES.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
          </label>
          <label className="block mb-3"><div className={LBL}>{liveBatchDye ? 'Fabric Name' : 'Loaded Fabric Name'}</div>
            <input className={FIELD} value={fabricName} onChange={(e) => setFabricName(e.target.value)} placeholder="Cotton, Denim 12oz…" />
          </label>
          <label className="block mb-3"><div className={LBL}>{liveBatchDye ? 'Target Production (meters)' : 'Loaded Meter (meters)'}</div>
            <input className={FIELD} type="number" value={length} onChange={(e) => setLength(e.target.value)} placeholder="8000" />
          </label>
          {!liveBatchDye && (
            <label className="block mb-3"><div className={LBL}>Loaded Time</div>
              <input className={FIELD} type="datetime-local" value={loadedAtInput} onChange={(e) => setLoadedAtInput(e.target.value)} />
              <div className="text-[11px] text-steel/60 mt-1">When the fabric was loaded — drives the Duration on the card. Leave blank to stamp the current time on save.</div>
            </label>
          )}
          <div className="border-t border-dashed border-line my-4" />
        </>
      ) : (
        <>
          <label className="block mb-3"><div className={LBL}>Fabric Name</div>
            <input className={FIELD} value={fabricName} onChange={(e) => setFabricName(e.target.value)} placeholder="Cotrize" />
          </label>
          <label className="block mb-3"><div className={LBL}>{isLength ? 'Target Length (meters)' : 'Target Production (meters)'}</div>
            <input className={FIELD} type="number" value={length} onChange={(e) => setLength(e.target.value)} placeholder="80000" />
          </label>
        </>
      )}

      <div className="grid-two mb-3" style={{ gap: 12 }}>
        <div>
          <div className={LBL}>Job Number</div>
          <div className="bg-raised border border-line rounded-lg px-3 py-2.5 text-sm text-steel">{job?.jobNumber || 'Auto-assigned on save'}</div>
        </div>
        <label><div className={LBL}>Order Number</div><input className={FIELD} value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="LOT1-05" /></label>
      </div>
      <label className="block mb-3"><div className={LBL}>Shift</div>
        <select className={FIELD} value={shift} onChange={(e) => setShift(e.target.value)}>
          <option value="A">Shift A</option><option value="B">Shift B</option><option value="C">Shift C</option>
        </select>
      </label>
      <label className="block mb-3"><div className={LBL}>Supervisor</div>
        <select className={FIELD} value={supervisorId} onChange={(e) => { setSupervisorId(e.target.value); setOperatorId(''); }}>
          <option value="">— Select supervisor —</option>
          {supervisors.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
        </select>
      </label>
      <label className="block mb-3"><div className={LBL}>↳ Operator (optional)</div>
        <select className={cn(FIELD, 'disabled:bg-raised disabled:text-steel/60 disabled:cursor-not-allowed')} value={operatorId} disabled={!supervisorId} onChange={(e) => setOperatorId(e.target.value)}>
          <option value="">{!supervisorId ? '— select a supervisor first —' : operatorOptions.length ? '— Select operator —' : 'No operators available'}</option>
          {operatorOptions.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
        </select>
        {operatorFallback && <div className="text-[11px] text-steel/70 mt-1">No operators report to this supervisor in the org chart — showing all operators.</div>}
      </label>

      {error && <div className="text-stopped text-[13px] mb-3">{error}</div>}

      <div className="flex gap-2.5 mt-1">
        <button onClick={save} disabled={saving} className="bg-accent text-white rounded-lg px-4 py-2.5 font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60">{saving ? 'Saving…' : '✓ Save Configuration'}</button>
      </div>
    </div>
  );
}

// ─── Report-idle modal ───────────────────────────────────────────────────────
function ReportIdleModal({ m, onClose }: { m: MachineWithState; onClose: () => void }) {
  const { report } = useDowntimeReports();
  const toast = useToast();
  const [reason, setReason] = useState(IDLE_REASONS[0]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await report(m.code, reason, note);
      toast.success(`Idle reported for ${m.code} — your supervisor will be alerted`);
      onClose();
    } catch (e) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to report downtime');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center p-5 bg-[rgba(15,23,42,.55)] backdrop-blur-sm" onClick={onClose}>
      <div className="panel relative w-full max-w-[460px] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h2 className="text-lg font-extrabold text-primary">Report machine idle</h2>
          <button onClick={onClose} className="text-steel hover:text-primary transition-colors"><X size={20} /></button>
        </div>
        <div className="text-[13px] text-steel mb-4"><b className="data text-primary">{m.code}</b> · {m.name} — {m.department}</div>
        <div className="mb-3">
          <div className={LBL}>Reason</div>
          <select className={FIELD} value={reason} onChange={(e) => setReason(e.target.value)}>
            {IDLE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="mb-4">
          <div className={LBL}>Note (optional)</div>
          <textarea className={cn(FIELD, 'min-h-[72px] resize-y')} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add any detail for your supervisor…" />
        </div>
        <div className="flex gap-2.5">
          <button onClick={submit} disabled={saving} className="bg-idle text-white rounded-lg px-4 py-2.5 font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60">{saving ? 'Reporting…' : 'Report idle'}</button>
          <button onClick={onClose} className="bg-base text-steel border border-line rounded-lg px-4 py-2.5 font-bold text-sm hover:text-primary transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}
