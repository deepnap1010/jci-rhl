// ============================================================
//  MACHINES PAGE
//  Summary KPIs + filters + dynamic machine cards.
//  Click a card's "Details" to see the dynamic IOT params.
// ============================================================
import { useMemo, useState, useEffect, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X, ChevronRight, ChevronDown } from 'lucide-react';
import { useMachines, useJobs, usePeople, useOrg, useDowntimeReports, liveSummary, fmtLastSeen, fmtAgo } from '../hooks/useData';
import type { MachineWithState, JobRow, DowntimeReportRow, OrgNode } from '../hooks/useData';
import { KpiCard, StatusPill, Metric } from '../components/ui';
import { useToast } from '../components/Toast';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { useAuth } from '../context/auth';
import { api } from '../api/client';
import { DEPARTMENTS } from '@shared/types';
import { can } from '@shared/permissions';

// card ordering: running first, then idle, stopped, disconnected
const STATUS_ORDER: Record<string, number> = { running: 0, idle: 1, stopped: 2, disconnected: 3 };
const PAGE_SIZE = 10;

export default function Machines() {
  const { role } = useAuth();
  // capability-driven: supervisors+ may configure/assign within their scope; operators report idle
  const canConfigure = can(role, 'assignJobs');
  const canReport = can(role, 'reportDowntime');
  const [reportM, setReportM] = useState<MachineWithState | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const day = dateFrom || dateTo;        // a single date is enough (whole day)
  const endDay = dateTo || dateFrom;
  const ranged = !!day;
  const rangeLabel = dateFrom && dateTo && dateFrom !== dateTo ? `${dateFrom} → ${dateTo}` : day;
  const fromISO = ranged ? new Date(`${day}T00:00`).toISOString() : undefined;
  const toISO = ranged ? new Date(`${endDay}T23:59`).toISOString() : undefined;
  const { machines, loading, reload } = useMachines(fromISO, toISO);
  const { live: liveNow, lastUpdated } = liveSummary(machines);
  const { data: jobs, reload: reloadJobs } = useJobs();
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
  const [sort, setSort] = useState('status');
  const [page, setPage] = useState(1);
  // deep-link from a notification (?focus=CBR-01) → pre-fill the search
  const [sp] = useSearchParams();
  const focus = sp.get('focus');
  useEffect(() => { if (focus) setQ(focus); }, [focus]);
  const [selected, setSelected] = useState<MachineWithState | null>(null);
  const [historyM, setHistoryM] = useState<MachineWithState | null>(null);
  const [configM, setConfigM] = useState<MachineWithState | null>(null);

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
    <div style={{ padding: '0 28px 40px' }}>
      {/* summary */}
      <div className="grid-stats-4" style={grid4}>
        <KpiCard label="Total Machines" value={counts.total} sub="Registered" accent="var(--accent-blue)" />
        <KpiCard label="Running" value={counts.running} sub="Currently active" accent="var(--accent-green)" />
        <KpiCard label="Idle" value={counts.idle} sub="Waiting" accent="var(--accent-amber)" />
        <KpiCard label="Stopped" value={counts.stopped} sub="Need attention" accent="var(--accent-red)" />
      </div>

      {/* filters */}
      <div className="card" style={{ padding: 14, margin: '18px 0', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-faint)' }} />
          <input
            placeholder="Search machine, job, fabric, order…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ ...input, paddingLeft: 36, width: '100%' }}
          />
        </div>
        <select value={dept} onChange={(e) => setDept(e.target.value)} style={input}>
          <option value="">All Departments</option>
          {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={input}>
          <option value="">All Statuses</option>
          <option value="running">Running</option>
          <option value="idle">Idle</option>
          <option value="stopped">Stopped</option>
          <option value="disconnected">Disconnected</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={input} title="Sort by">
          <option value="status">Sort: Status (running first)</option>
          <option value="name">Sort: Name</option>
          <option value="production">Sort: Production ↓</option>
          <option value="efficiency">Sort: Efficiency ↑</option>
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={input} title="View machines as of this date" aria-label="Date" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={input} title="Optional end date for a range" aria-label="To (optional)" />
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span>
          Showing <b>{fromN}–{toN}</b> of <b>{filtered.length}</b> machines ·{' '}
          {ranged
            ? <span style={{ color: 'var(--brand)', fontWeight: 700 }}>History · {rangeLabel}</span>
            : liveNow
              ? <span style={{ color: 'var(--running)' }}>● Live</span>
              : <span style={{ color: 'var(--idle)' }}>● Last updated {fmtLastSeen(lastUpdated)}</span>}
        </span>
        {ranged && <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ border: 'none', background: 'none', color: 'var(--brand)', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Reset to live</button>}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          No machines match your filters.
        </div>
      ) : (
        <>
          <div style={cardGrid} className="auto-cards">
            {pageItems.map((m) => (
              <MachineCard
                key={m._id}
                m={m}
                job={jobByMachine.get(m.code)}
                canConfigure={canConfigure}
                canReport={canReport}
                idleReport={idleByMachine.get(m.code)}
                onResolveIdle={(id) => resolveReport(id)}
                onDetails={() => setSelected(m)}
                onHistory={() => setHistoryM(m)}
                onConfigure={() => setConfigM(m)}
                onReport={() => setReportM(m)}
              />
            ))}
          </div>
          <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      {reportM && <ReportDowntimeModal m={reportM} onClose={() => setReportM(null)} />}
      {selected && <DetailsModal m={selected} onClose={() => setSelected(null)} />}
      {historyM && <HistoryModal m={historyM} onClose={() => setHistoryM(null)} />}
      {configM && (
        <ConfigureModal
          m={configM}
          job={jobByMachine.get(configM.code)}
          onClose={() => setConfigM(null)}
          onSaved={() => { setConfigM(null); reload(); reloadJobs(); }}
        />
      )}
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
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' }}>
      <button onClick={() => go(page - 1)} disabled={page <= 1} style={pagerBtn(false, page <= 1)}>‹ Prev</button>
      {pageRange(page, totalPages).map((it, i) =>
        it === '…' ? (
          <span key={`e${i}`} style={{ padding: '0 4px', color: 'var(--text-faint)' }}>…</span>
        ) : (
          <button key={it} onClick={() => go(it as number)} style={pagerBtn(it === page, false)}>{it}</button>
        )
      )}
      <button onClick={() => go(page + 1)} disabled={page >= totalPages} style={pagerBtn(false, page >= totalPages)}>Next ›</button>
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

function pagerBtn(active: boolean, disabled: boolean): React.CSSProperties {
  return {
    minWidth: 36, height: 36, padding: '0 11px', borderRadius: 9, fontSize: 13, fontWeight: 700,
    border: `1px solid ${active ? 'var(--brand)' : 'var(--border-strong)'}`,
    background: active ? 'var(--brand)' : 'var(--surface)',
    color: active ? '#fff' : disabled ? 'var(--text-faint)' : 'var(--text)',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
  };
}

// ---- one machine card ----
function MachineCard({
  m, job, canConfigure, canReport, idleReport, onResolveIdle, onDetails, onHistory, onConfigure, onReport,
}: { m: MachineWithState; job?: JobRow; canConfigure: boolean; canReport: boolean; idleReport?: DowntimeReportRow; onResolveIdle: (id: string) => void; onDetails: () => void; onHistory: () => void; onConfigure: () => void; onReport: () => void }) {
  const s = m.state;
  const fresh = m.status !== 'disconnected';
  const isDyeing = isDyeingMachine(m.machineType?.name, m.department, m.code);
  const production = s?.production ?? 0;
  const target = job?.targetProduction ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((production / target) * 100)) : 0;
  const downtimeMin = Math.round((s?.downtimeSec ?? 0) / 60);
  const strong: React.CSSProperties = { color: 'var(--text)' };

  return (
    <div className="card" style={{ padding: 16, animation: 'fadeUp .4s ease' }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }} className="mono">{m.code}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.name} · {m.department}</div>
        </div>
        <StatusPill status={m.status} />
      </div>

      {/* per-machine data freshness */}
      <div style={{ fontSize: 11, marginTop: 6, fontWeight: 600, color: fresh ? 'var(--running)' : 'var(--text-faint)' }}>
        {s ? (fresh ? `● Updated ${fmtAgo(s.updatedAt)}` : `Last updated ${fmtLastSeen(s.updatedAt)}`) : 'No data yet'}
      </div>

      {/* persistent idle banner — stays on the card until the downtime is resolved */}
      {idleReport && (
        <div style={{
          marginTop: 10, padding: '9px 11px', borderRadius: 10, fontSize: 12,
          background: idleReport.status === 'escalated' ? '#fdeceb' : '#fff7e6',
          border: `1px solid ${idleReport.status === 'escalated' ? '#f5c2c0' : '#ffe2ad'}`,
          color: idleReport.status === 'escalated' ? '#b42318' : '#8a5d00',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontWeight: 800 }}>
              {idleReport.status === 'escalated' ? '🚨 Idle (escalated)' : '⚠ Reported idle'}
            </span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>{idleReport.startedAt ? fmtAgo(idleReport.startedAt) : ''}</span>
          </div>
          <div style={{ marginTop: 3, fontWeight: 600 }}>{idleReport.reason}{idleReport.note ? ` — ${idleReport.note}` : ''}</div>
          <div style={{ marginTop: 2, fontSize: 11, opacity: 0.85 }}>
            by {idleReport.operatorName || 'operator'}
            {idleReport.escalatedToName ? ` · escalated to ${idleReport.escalatedToName}` : ''}
          </div>
          {(canConfigure || canReport) && (
            <button onClick={() => onResolveIdle(idleReport._id)} style={{
              marginTop: 7, background: 'var(--running)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>✓ Mark resolved</button>
          )}
        </div>
      )}

      {isDyeing ? (
        // ── DYEING / BATCH machine: batch + loaded-fabric layout ──
        <>
          {(job?.batchId || job?.processType) && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {job?.batchId && <span style={{ background: 'var(--brand-soft)', color: 'var(--brand)', borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>Batch: {job.batchId}</span>}
              {job?.processType && <span style={{ background: '#fdecd8', color: '#b06f00', borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>{job.processType}</span>}
            </div>
          )}
          <div className="grid-two" style={{ gap: 8, marginTop: 12 }}>
            <Metric label="Loaded Meter" value={fmtK(target)} unit="mtr" />
            <Metric label="Stage" value={job?.dyeStage || cap(m.status)} />
            <Metric label="GLM (Weight)" value={fmtK(job?.glm ?? 0)} unit="kg" />
            <Metric label="Liquor Ratio" value={job?.liquorRatio || '—'} />
            <Metric label="Loaded Time" value={job?.loadedAt ? fmtLoaded(job.loadedAt) : '—'} tone={job?.loadedAt ? 'cool' : 'plain'} />
            <Metric label="Duration" value={job?.loadedAt ? fmtSince(job.loadedAt) : '—'} />
            <Metric label="Water (Pump)" value={fresh && s ? (s.waterFlow ?? 0) : '—'} unit="L" tone="cool" />
            <Metric label="Temperature" value={fresh && s ? (s.temperature ?? 0) : '—'} unit="°c" tone="warm" />
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)', display: 'grid', gap: 4 }}>
            <div>Operator: <b style={strong}>{job?.operatorName || '—'}</b></div>
            <div>Supervisor: <b style={strong}>{job?.supervisorName || '—'}</b></div>
          </div>
        </>
      ) : (
        // ── CONTINUOUS machine: production layout ──
        <>
          <div className="grid-two" style={{ gap: 8, marginTop: 14 }}>
            <Metric label="Production" value={fmtK(production)} unit="mtr" />
            <Metric label="Speed" value={s?.speed ?? 0} unit="m/min" />
            <Metric label="Temperature" value={s?.temperature ?? 0} unit="°c" tone="warm" />
            <Metric label="Efficiency" value={`${s?.efficiency ?? 0}%`} tone={(s?.efficiency ?? 0) < 1 ? 'warm' : 'plain'} />
            <Metric label="Water Flow" value={s?.waterFlow ?? 0} unit="L/hr" tone="cool" />
            <Metric label="Downtime" value={downtimeMin} unit="min" tone="warm" />
          </div>

          {/* production → target: full bar once there's output; compact line while still at 0 */}
          {target > 0 && production > 0 ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                <span>Production: <b style={strong}>{fmtK(production)} mtr</b></span>
                <span>Target: <b style={strong}>{fmtK(target)} mtr</b></span>
              </div>
              <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(2, pct)}%`, height: '100%', background: pct >= 100 ? 'var(--accent-green)' : 'var(--accent-amber)', borderRadius: 99 }} />
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--accent-amber)', marginTop: 4 }}>{pct}%</div>
            </div>
          ) : target > 0 ? (
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-muted)' }}>
              Target: <b style={strong}>{fmtK(target)} mtr</b> · <span style={{ color: 'var(--text-faint)' }}>no output yet</span>
            </div>
          ) : null}

          {/* assigned-job context */}
          {job ? (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)', display: 'grid', gap: 4 }}>
              <div>Fabric: <b style={strong}>{job.fabricName}</b></div>
              <div>Job: <b style={strong}>{job.jobNumber}</b> · Order: <b style={strong}>{job.orderNumber}</b></div>
              <div>Operator: <b style={strong}>{job.operatorName || '—'}</b></div>
              <div>Supervisor: <b style={strong}>{job.supervisorName || '—'}</b></div>
            </div>
          ) : (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-faint)' }}>No job assigned · use Configure</div>
          )}
        </>
      )}

      {/* actions */}
      <div style={{ display: 'flex', marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <button onClick={onDetails} style={linkBtn}>Details</button>
        <button onClick={onHistory} style={{ ...linkBtn, borderLeft: '1px solid var(--border)' }}>History</button>
        {canReport && <button onClick={onReport} style={{ ...linkBtn, borderLeft: '1px solid var(--border)', color: 'var(--accent-amber)' }}>Report idle</button>}
        {canConfigure && <button onClick={onConfigure} style={{ ...linkBtn, borderLeft: '1px solid var(--border)' }}>Configure</button>}
      </div>
    </div>
  );
}

// ---- report-idle modal (operator files a downtime reason → escalation) ----
const IDLE_REASONS = [
  'Material shortage',
  'Mechanical fault',
  'Electrical fault',
  'Quality issue',
  'Changeover / setup',
  'Cleaning / maintenance',
  'Waiting for instructions',
  'Shift break',
  'Other',
];
function ReportDowntimeModal({ m, onClose }: { m: MachineWithState; onClose: () => void }) {
  useModalDismiss(onClose);
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
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to report downtime';
      toast.error(msg);
      setSaving(false);
    }
  }

  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(20,28,46,.45)', display: 'grid', placeItems: 'start center', paddingTop: '8vh', zIndex: 50, backdropFilter: 'blur(2px)' };
  const modal: React.CSSProperties = { width: 'min(480px,92vw)', padding: 24, animation: 'fadeUp .25s ease' };
  const field: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid var(--border-strong)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', background: 'var(--surface)' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 5 };

  return (
    <div style={overlay} onClick={onClose}>
      <div className="card" style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Report machine idle</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          <b className="mono" style={{ color: 'var(--text)' }}>{m.code}</b> · {m.name} — {m.department}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={lbl}>Reason</div>
          <select style={field} value={reason} onChange={(e) => setReason(e.target.value)}>
            {IDLE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={lbl}>Note (optional)</div>
          <textarea style={{ ...field, minHeight: 72, resize: 'vertical' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add any detail for your supervisor…" />
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 14 }}>
          Your supervisor is alerted if this isn't resolved shortly; if they don't acknowledge, it escalates to the plant head.
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={submit} disabled={saving} style={{ background: 'var(--accent-amber)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            {saving ? 'Reporting…' : 'Report idle'}
          </button>
          <button onClick={onClose} style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---- details modal (shows dynamic IOT params) ----
function DetailsModal({ m, onClose }: { m: MachineWithState; onClose: () => void }) {
  useModalDismiss(onClose);
  const s = m.state;
  const fields = m.machineType?.fields ?? [];
  return (
    <div style={overlay} onClick={onClose}>
      <div className="card" style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>{m.code} — Live Details</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{m.name}</span>
          <StatusPill status={m.status} />
        </div>

        {/* fixed metrics */}
        <div className="grid-stats-4" style={{ gap: 8, marginBottom: 18 }}>
          <Metric label="Speed" value={s?.speed ?? 0} unit="m/min" />
          <Metric label="Production" value={s?.production ?? 0} unit="mtr" />
          <Metric label="Temp" value={s?.temperature ?? 0} unit="°C" tone="warm" />
          <Metric label="Water" value={s?.waterFlow ?? 0} unit="L/hr" tone="cool" />
        </div>

        {/* dynamic IOT params */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text-faint)', marginBottom: 10 }}>
          ADDITIONAL PARAMETERS (IOT)
        </div>
        {fields.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No extra parameters defined for this machine type.</div>
        ) : (
          <div className="grid-stats-3" style={{ gap: 8 }}>
            {fields.map((f) => {
              const raw = s?.data?.[f.key];
              const val = raw === undefined ? '—' : String(raw);
              return (
                <div key={f.key} style={{ background: 'var(--brand-soft)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)' }}>
                    {f.label.toUpperCase()}{f.unit ? ` (${f.unit})` : ''}
                  </div>
                  <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--brand)' }}>{val}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- history modal (recent telemetry for one machine) ----
interface HistRow {
  _id: string; ts: string; status: MachineWithState['status'];
  speed: number; production: number; temperature: number; waterFlow: number; efficiency: number;
  data?: Record<string, number | string | boolean>; // raw PLC snapshot for that reading
}
function HistoryModal({ m, onClose }: { m: MachineWithState; onClose: () => void }) {
  useModalDismiss(onClose);
  const [rows, setRows] = useState<HistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const fields = m.machineType?.fields ?? [];

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    setLoading(true);
    api
      .get<{ rows: HistRow[] }>('/api/history', { params: { machineId: m.code, limit: 60, withData: 1, bucket: 'minute' }, signal: ctrl.signal })
      .then((r) => { if (alive) setRows(r.data.rows || []); })
      .catch((e) => { if (alive && e?.code !== 'ERR_CANCELED') setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; ctrl.abort(); };
  }, [m.code]);

  const toggle = (id: string) => setOpen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div style={overlay} onClick={onClose}>
      <div className="card" style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>{m.code} — Recent History</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none' }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>{m.name} · last {rows.length} minutes (1 reading/min) · click “Show details” for that moment's full data</div>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', padding: 24, textAlign: 'center' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', padding: 24, textAlign: 'center' }}>No history yet for this machine.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-faint)', fontSize: 11 }}>
                <th style={{ ...hcell, width: 130 }}>DETAILS</th>
                <th style={hcell}>DATE &amp; TIME</th><th style={hcell}>STATUS</th><th style={hcellR}>SPEED</th>
                <th style={hcellR}>PROD</th><th style={hcellR}>TEMP</th><th style={hcellR}>WATER</th><th style={hcellR}>EFF</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = open.has(r._id);
                return (
                  <Fragment key={r._id}>
                    <tr style={{ borderTop: '1px solid var(--border)', background: isOpen ? 'var(--surface-2)' : undefined }}>
                      <td style={hcell}>
                        <button onClick={() => toggle(r._id)} style={detailBtn}>
                          {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          {isOpen ? 'Hide details' : 'Show details'}
                        </button>
                      </td>
                      <td style={hcell} className="mono">{fmtHistDateTime(r.ts)}</td>
                      <td style={hcell}><StatusPill status={r.status} /></td>
                      <td style={hcellR} className="mono">{r.speed}</td>
                      <td style={hcellR} className="mono">{r.production.toLocaleString()}</td>
                      <td style={hcellR} className="mono">{r.temperature}</td>
                      <td style={hcellR} className="mono">{r.waterFlow.toLocaleString()}</td>
                      <td style={hcellR} className="mono">{r.efficiency}%</td>
                    </tr>
                    {isOpen && (
                      <tr style={{ background: 'var(--surface-2)' }}>
                        <td colSpan={8} style={{ padding: '6px 12px 14px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text-faint)', margin: '4px 0 8px' }}>
                            FULL PLC SNAPSHOT @ {new Date(r.ts).toLocaleString()}
                          </div>
                          {(() => {
                            // prefer the machine's field registry; fall back to the raw payload keys
                            const entries = fields.length > 0
                              ? fields.map((fd) => ({ key: fd.key, label: fd.label, unit: fd.unit as string | undefined }))
                              : Object.keys(r.data ?? {}).map((k) => ({ key: k, label: k, unit: undefined as string | undefined }));
                            if (entries.length === 0) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No parameters recorded for this reading.</div>;
                            return (
                              <div className="grid-stats-3" style={{ gap: 8 }}>
                                {entries.map((e) => {
                                  const raw = r.data?.[e.key];
                                  const val = raw === undefined ? '—' : String(raw);
                                  return (
                                    <div key={e.key} style={{ background: 'var(--brand-soft)', borderRadius: 10, padding: '8px 10px' }}>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)' }}>{e.label.toUpperCase()}{e.unit ? ` (${e.unit})` : ''}</div>
                                      <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--brand)' }}>{val}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---- configure modal (assign job / batch context to a machine; persists a Job) ----
const PROCESS_TYPES = ['Dyeing', 'Bleaching', 'Washing', 'Scouring', 'Finishing', 'Printing'];
const DYE_STAGES = ['Idle', 'Loading', 'Heating', 'Dyeing', 'Rinsing', 'Soaping', 'Unloading', 'Done'];

function ConfigureModal({
  m, job, onClose, onSaved,
}: { m: MachineWithState; job?: JobRow; onClose: () => void; onSaved: () => void }) {
  const people = usePeople();
  const { data: org } = useOrg();
  const toast = useToast();
  useModalDismiss(onClose);
  const type = m.machineType?.name ?? '';
  // dyeing machines (maxi / jet / soft-flow / cold-dyeing / reactive steamer) get the batch + loaded-fabric layout
  const isDyeing = isDyeingMachine(type, m.department, m.code);

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const supervisors = people.filter((e) => e.role === 'supervisor');
  // flatten the scoped org tree once, then resolve "operators reporting to a supervisor", then resolve "operators reporting to a supervisor"
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
  const loadedAtDisplay = job?.loadedAt
    ? new Date(job.loadedAt).toLocaleString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  async function save() {
    setSaving(true);
    setError('');
    try {
      await api.put(`/api/jobs/by-machine/${m.code}`, {
        orderNumber,
        fabricName,
        stage: m.department, // a valid Department
        status: 'inProgress',
        targetProduction: Number(length) || 0,
        shift,
        operatorId: operatorId || null,
        supervisorId: supervisorId || null,
        batchId: isDyeing ? batchId : '',
        processType: isDyeing ? processType : '',
        loadedAt: isDyeing ? (job?.loadedAt ?? new Date().toISOString()) : null,
        glm: isDyeing ? Number(glm) || 0 : 0,
        liquorRatio: isDyeing ? liquorRatio : '',
        dyeStage: isDyeing ? dyeStage : '',
      });
      toast.success(`${m.code} configuration saved`);
      onSaved();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to save configuration');
      setSaving(false);
    }
  }

  const field: React.CSSProperties = { border: '1px solid var(--border-strong)', borderRadius: 10, padding: '9px 12px', fontSize: 14, width: '100%', outline: 'none', background: 'var(--surface)', color: 'var(--text)' };
  const readonlyField: React.CSSProperties = { border: '1px solid var(--border)', background: 'var(--surface-2)', borderRadius: 10, padding: '9px 12px', fontSize: 14, color: 'var(--text-muted)' };
  const section: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--brand)', margin: '4px 0 10px' };
  const block: React.CSSProperties = { display: 'block', marginBottom: 12 };

  return (
    <div style={overlay} onClick={onClose}>
      <div className="card" style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Configure {m.code}</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none' }}><X size={20} /></button>
        </div>

        {/* machine identity bar */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
          <b className="mono" style={{ color: 'var(--text)' }}>{m.code}</b> · {type || '—'} · {m.department} · PLC:
        </div>

        {isDyeing ? (
          <>
            <div style={section}>BATCH CONFIGURATION</div>
            <div className="grid-two" style={{ gap: 12, marginBottom: 12 }}>
              <label><div style={lbl}>Batch ID</div><input style={field} value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="01" /></label>
              <label><div style={lbl}>Process Type</div>
                <select style={field} value={processType} onChange={(e) => setProcessType(e.target.value)}>
                  {PROCESS_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>
            <div className="grid-two" style={{ gap: 12, marginBottom: 16 }}>
              <label><div style={lbl}>GLM / Weight (kg)</div><input style={field} type="number" value={glm} onChange={(e) => setGlm(e.target.value)} placeholder="2000" /></label>
              <label><div style={lbl}>Liquor Ratio</div><input style={field} value={liquorRatio} onChange={(e) => setLiquorRatio(e.target.value)} placeholder="1:8" /></label>
            </div>
            <label style={block}><div style={lbl}>Stage</div>
              <select style={field} value={dyeStage} onChange={(e) => setDyeStage(e.target.value)}>
                <option value="">— select —</option>
                {DYE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>

            <div style={section}>LOADED FABRIC DETAILS</div>
            <label style={block}><div style={lbl}>Loaded Fabric Name</div>
              <input style={field} value={fabricName} onChange={(e) => setFabricName(e.target.value)} placeholder="Cotton Twill 20s, Denim 12oz…" />
            </label>
            <label style={block}><div style={lbl}>Loaded Meter (meters)</div>
              <input style={field} type="number" value={length} onChange={(e) => setLength(e.target.value)} placeholder="10000" />
            </label>
            {loadedAtDisplay && (
              <div style={{ background: '#e8f7ee', color: 'var(--running)', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
                ✓ Loaded at: {loadedAtDisplay}
              </div>
            )}
            <div style={{ borderTop: '1px dashed var(--border)', margin: '4px 0 16px' }} />
          </>
        ) : (
          <>
            <label style={block}><div style={lbl}>Fabric Name</div>
              <input style={field} value={fabricName} onChange={(e) => setFabricName(e.target.value)} placeholder="Cotrize" />
            </label>
            <label style={block}><div style={lbl}>Target Production (meters)</div>
              <input style={field} type="number" value={length} onChange={(e) => setLength(e.target.value)} placeholder="80000" />
            </label>
          </>
        )}

        {/* job + people (both layouts) */}
        <div className="grid-two" style={{ gap: 12, marginBottom: 12 }}>
          <div>
            <div style={lbl}>Job Number</div>
            <div style={readonlyField}>{job?.jobNumber || 'Auto-assigned on save'}</div>
          </div>
          <label><div style={lbl}>Order Number</div><input style={field} value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="LOT1-05" /></label>
        </div>
        <label style={block}><div style={lbl}>Shift</div>
          <select style={field} value={shift} onChange={(e) => setShift(e.target.value)}>
            <option value="A">Shift A</option>
            <option value="B">Shift B</option>
            <option value="C">Shift C</option>
          </select>
        </label>
        <label style={block}><div style={lbl}>Supervisor</div>
          <select
            style={field}
            value={supervisorId}
            onChange={(e) => {
              setSupervisorId(e.target.value);
              setOperatorId(''); // clear operator — it must belong to the new supervisor
            }}
          >
            <option value="">— Select supervisor —</option>
            {supervisors.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
          </select>
        </label>
        <label style={block}><div style={lbl}>↳ Operator</div>
          <select
            style={{ ...field, ...(supervisorId ? null : { background: 'var(--surface-2)', color: 'var(--text-faint)', cursor: 'not-allowed' }) }}
            value={operatorId}
            disabled={!supervisorId}
            onChange={(e) => setOperatorId(e.target.value)}
          >
            <option value="">
              {!supervisorId ? '— select a supervisor first —' : operatorsUnder.length ? '— Select operator —' : 'No operators report to this supervisor'}
            </option>
            {operatorsUnder.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
          </select>
        </label>

        {error && <div style={{ color: 'var(--stopped)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={save} disabled={saving} style={{ background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700 }}>
            {saving ? 'Saving…' : '✓ Save Configuration'}
          </button>
          <button onClick={onClose} style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '10px 18px', fontWeight: 700 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const hcell: React.CSSProperties = { padding: '7px 8px' };
const hcellR: React.CSSProperties = { ...hcell, textAlign: 'right' };
const detailBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid var(--border-strong)',
  background: 'var(--surface)', color: 'var(--brand)', borderRadius: 8, padding: '4px 10px',
  fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
};
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 5 };

// compact number: 47800 → "47.8K", 980 → "980"
function fmtK(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

// BATCH dyeing machines (soft-flow, maxi, jet, cold-dyeing) get the batch-style card.
// Continuous machines — CBR, mercerizer, menzel, washer, AND reactive process steamers —
// get the production card (Production/Speed/Temp/Efficiency/Water/Downtime).
// Match across type, department AND the machine code/name, so records with missing
// type/department metadata (e.g. "colddyeing03") are still detected by their name.
function isDyeingMachine(type?: string | null, department?: string, code?: string): boolean {
  const hay = `${type || ''} ${department || ''} ${code || ''}`.toLowerCase();
  // reactive process steamers are continuous → production card, even though their dept is "Dyeing"
  if (/reactive|steamer/.test(hay)) return false;
  return /maxi|jet|soft|cold[\s_-]?dy|dye|dying/.test(hay);
}

// "15 Apr 2026, 03:37 pm" — when fabric was loaded
function fmtLoaded(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
  return `${date}, ${time}`;
}
// elapsed since loaded → "1345h 46m"
function fmtSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!(ms > 0)) return '0h 0m';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}
const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

// "06 Jun, 3:14:09 PM" — date + time for the history rows
function fmtHistDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  return `${date}, ${time}`;
}

const grid4: React.CSSProperties = { gap: 14 };
const cardGrid: React.CSSProperties = { gap: 16 };
const input: React.CSSProperties = {
  border: '1px solid var(--border-strong)', borderRadius: 10, padding: '9px 12px',
  fontSize: 14, background: 'var(--surface)', color: 'var(--text)', outline: 'none',
};
const linkBtn: React.CSSProperties = {
  flex: 1, border: 'none', background: 'none', color: 'var(--brand)',
  fontWeight: 700, fontSize: 13, padding: '4px 0',
};
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(20,28,46,.45)',
  display: 'grid', placeItems: 'start center', paddingTop: '6vh', zIndex: 50,
  backdropFilter: 'blur(2px)',
};
const modal: React.CSSProperties = {
  width: 'min(680px,92vw)', maxHeight: '84vh', overflowY: 'auto', padding: 24,
  animation: 'fadeUp .25s ease',
};
