// ============================================================
//  HISTORY LOG PAGE  —  filterable telemetry log + CSV export
//  Clean filtering: one instant Search (machine/fabric/job/order/
//  operator/supervisor) + structured filters (machine, status,
//  date/time range) applied on demand, with removable filter chips.
//  Fabric/Job/Order/Operator/Supervisor come from each machine's
//  current job (joined client-side, same as the machine cards).
// ============================================================
import { useCallback, useEffect, useMemo, useState, useDeferredValue, Fragment } from 'react';
import { Filter, Download, ArrowLeft, Plus, Minus, Search, X, SlidersHorizontal } from 'lucide-react';
import { api } from '../api/client';
import { useMachines, useJobs } from '../hooks/useData';
import type { HistoryRow, JobRow } from '../hooks/useData';
import { KpiCard, StatusPill, inputStyle } from '../components/ui';

interface Resp { rows: HistoryRow[]; kpis: { total: number; runningEntries: number; downtimeEntries: number }; }
type Row = HistoryRow & { job?: JobRow };

// structured filters define the dataset (server query); search is instant (client)
const EMPTY = { machineId: '', status: '', dateFrom: '', dateTo: '', timeFrom: '', timeTo: '' };
const PAGE_SIZE = 25; // rows per page in the log table

export default function History() {
  const { machines } = useMachines();
  const { data: jobs } = useJobs();
  const [f, setF] = useState({ ...EMPTY });            // live form
  const [applied, setApplied] = useState({ ...EMPTY }); // in effect (drives the fetch)
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);      // smooth instant filtering
  const [showMore, setShowMore] = useState(false);
  const [data, setData] = useState<Resp>({ rows: [], kpis: { total: 0, runningEntries: 0, downtimeEntries: 0 } });
  const [loading, setLoading] = useState(true);
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '1000' };
      if (applied.machineId) params.machineId = applied.machineId;
      if (applied.status) params.status = applied.status;
      const from = toISO(applied.dateFrom, applied.timeFrom, false);
      const to = toISO(applied.dateTo, applied.timeTo, true);
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await api.get<Resp>('/api/history', { params });
      setData(res.data);
    } catch { /* keep last good */ } finally { setLoading(false); }
  }, [applied]);

  useEffect(() => { load(); }, [load]);

  // join the machine's current job, then apply the instant search across its fields
  const rows: Row[] = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const joined = data.rows.map((r) => ({ ...r, job: jobByMachine.get(r.machineCode) }));
    if (!q) return joined;
    return joined.filter((r) =>
      `${r.machineCode} ${r.job?.fabricName || ''} ${r.job?.jobNumber || ''} ${r.job?.orderNumber || ''} ${r.job?.operatorName || ''} ${r.job?.supervisorName || ''}`
        .toLowerCase().includes(q)
    );
  }, [data.rows, jobByMachine, deferredSearch]);

  const kpis = useMemo(() => ({
    total: rows.length,
    running: rows.filter((r) => r.status === 'running').length,
    downtime: rows.filter((r) => r.status === 'idle' || r.status === 'stopped').length,
  }), [rows]);

  // paginate the (filtered) rows; reset to page 1 whenever the result set changes
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [rows, safePage]);
  useEffect(() => { setPage(1); }, [deferredSearch, applied]);

  function apply() { setApplied({ ...f }); setOpen(new Set()); }
  function clear() { setF({ ...EMPTY }); setApplied({ ...EMPTY }); setSearch(''); setOpen(new Set()); }
  function clearKeys(...keys: (keyof typeof EMPTY)[]) {
    setF((p) => { const n = { ...p }; keys.forEach((k) => (n[k] = '')); return n; });
    setApplied((p) => { const n = { ...p }; keys.forEach((k) => (n[k] = '')); return n; });
  }
  function toggle(id: string) {
    setOpen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // removable chips for what's actually in effect
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (applied.machineId) chips.push({ key: 'm', label: `Machine: ${applied.machineId}`, onRemove: () => clearKeys('machineId') });
  if (applied.status) chips.push({ key: 's', label: `Status: ${cap(applied.status)}`, onRemove: () => clearKeys('status') });
  if (applied.dateFrom || applied.dateTo) chips.push({ key: 'd', label: `Date: ${applied.dateFrom || '…'} → ${applied.dateTo || '…'}`, onRemove: () => clearKeys('dateFrom', 'dateTo') });
  if (applied.timeFrom || applied.timeTo) chips.push({ key: 't', label: `Time: ${applied.timeFrom || '…'} → ${applied.timeTo || '…'}`, onRemove: () => clearKeys('timeFrom', 'timeTo') });
  if (deferredSearch.trim()) chips.push({ key: 'q', label: `Search: "${deferredSearch.trim()}"`, onRemove: () => setSearch('') });

  const dirty = JSON.stringify(f) !== JSON.stringify(applied);

  function exportCSV() {
    const head = ['Date & Time', 'Machine', 'Status', 'Speed', 'Production', 'Fabric', 'Job No.', 'Order No.', 'Operator', 'Supervisor'];
    const lines = rows.map((r) => [
      new Date(r.ts).toISOString(), r.machineCode, r.status, r.speed, r.production,
      r.job?.fabricName ?? '', r.job?.jobNumber ?? '', r.job?.orderNumber ?? '',
      r.job?.operatorName ?? '', r.job?.supervisorName ?? '',
    ].join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'machine-history.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: '0 28px 40px' }}>
      {/* header: back + title + export */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <button onClick={() => window.history.back()} style={backBtn}><ArrowLeft size={16} /> Back</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Machine History</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Detailed production log with full filters</div>
        </div>
        <button onClick={exportCSV} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--running)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 700, fontSize: 14 }}>
          <Download size={16} /> Export CSV
        </button>
      </div>

      {/* filters */}
      <div className="card" style={{ padding: 18 }}>
        {/* primary row: search + machine + status */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 300px' }}>
            <Lbl label="Search">
              <div style={{ position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--text-faint)' }} />
                <input style={{ ...full, paddingLeft: 34 }} placeholder="Search machine, fabric, job, order, operator, supervisor…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </Lbl>
          </div>
          <div style={{ flex: '1 1 170px' }}>
            <Lbl label="Machine">
              <select style={full} value={f.machineId} onChange={(e) => set('machineId', e.target.value)}>
                <option value="">All Machines</option>
                {machines.map((m) => <option key={m._id} value={m._id}>{m.code} — {m.name}</option>)}
              </select>
            </Lbl>
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <Lbl label="Status">
              <select style={full} value={f.status} onChange={(e) => set('status', e.target.value)}>
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
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <div style={{ flex: '1 1 180px' }}><Lbl label="Date From"><input type="date" style={full} value={f.dateFrom} onChange={(e) => set('dateFrom', e.target.value)} /></Lbl></div>
          <div style={{ flex: '1 1 180px' }}><Lbl label="Date To"><input type="date" style={full} value={f.dateTo} onChange={(e) => set('dateTo', e.target.value)} /></Lbl></div>
          {showMore && <div style={{ flex: '1 1 160px' }}><Lbl label="Time From"><input type="time" style={full} value={f.timeFrom} onChange={(e) => set('timeFrom', e.target.value)} /></Lbl></div>}
          {showMore && <div style={{ flex: '1 1 160px' }}><Lbl label="Time To"><input type="time" style={full} value={f.timeTo} onChange={(e) => set('timeTo', e.target.value)} /></Lbl></div>}
        </div>

        {/* actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={apply} disabled={!dirty} style={{ ...applyBtn, opacity: dirty ? 1 : 0.55 }}><Filter size={14} /> Apply Filters</button>
          <button onClick={clear} style={clearBtn}>Clear all</button>
          <button onClick={() => setShowMore((v) => !v)} style={linkBtn}>
            <SlidersHorizontal size={13} /> {showMore ? 'Fewer filters' : 'More filters'}
          </button>
        </div>

        {/* active filter chips */}
        {chips.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            {chips.map((c) => (
              <span key={c.key} style={chip}>
                {c.label}
                <button onClick={c.onRemove} style={chipX} aria-label="Remove filter"><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid-stats-3" style={{ gap: 14, margin: '18px 0' }}>
        <KpiCard label="Total Records" value={kpis.total} sub={`${kpis.total} matched · ${PAGE_SIZE}/page`} accent="var(--accent-blue)" />
        <KpiCard label="Running Entries" value={kpis.running} sub="Rows where status was running" accent="var(--accent-green)" />
        <KpiCard label="Downtime Entries" value={kpis.downtime} sub="Idle or stopped rows" accent="var(--accent-red)" />
      </div>

      {/* table */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-faint)', fontSize: 11, background: 'var(--surface-2)' }}>
              <th style={{ ...th, width: 36 }}></th>
              <th style={th}>DATE &amp; TIME</th><th style={th}>MACHINE</th><th style={th}>STATUS</th>
              <th style={th}>SPEED</th><th style={th}>PRODUCTION</th><th style={th}>FABRIC</th>
              <th style={th}>JOB NO.</th><th style={th}>ORDER NO.</th><th style={th}>OPERATOR</th><th style={th}>SUPERVISOR</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} style={{ ...td, textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Loading history…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={11} style={{ ...td, textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No records match — adjust filters or let the simulator build history.</td></tr>
            ) : pageRows.map((r) => {
              const j = r.job;
              const isOpen = open.has(r._id);
              return (
                <Fragment key={r._id}>
                  <tr style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={td}>
                      <button onClick={() => toggle(r._id)} style={expBtn} aria-label="Toggle details">
                        {isOpen ? <Minus size={14} /> : <Plus size={14} />}
                      </button>
                    </td>
                    <td style={td} className="mono">{fmtDateTime(r.ts)}</td>
                    <td style={{ ...td, fontWeight: 700 }} className="mono">{r.machineCode}</td>
                    <td style={td}><StatusPill status={r.status} /></td>
                    <td style={td} className="mono">{r.speed} <span style={unit}>m/min</span></td>
                    <td style={td} className="mono">{fmtK(r.production)} <span style={unit}>mtr</span></td>
                    <td style={td}>{j?.fabricName || '—'}</td>
                    <td style={td} className="mono">{j?.jobNumber || '—'}</td>
                    <td style={td} className="mono">{j?.orderNumber || '—'}</td>
                    <td style={td}>{j?.operatorName || '—'}</td>
                    <td style={td}>{j?.supervisorName || '—'}</td>
                  </tr>
                  {isOpen && (
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <td></td>
                      <td colSpan={10} style={{ padding: '12px 16px' }}>
                        <div className="grid-stats-4" style={{ gap: 10 }}>
                          <Detail label="Department" value={r.department} />
                          <Detail label="Temperature" value={`${r.temperature} °C`} />
                          <Detail label="Water Flow" value={`${r.waterFlow.toLocaleString()} L/hr`} />
                          <Detail label="Efficiency" value={`${r.efficiency}%`} />
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
      {!loading && rows.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Showing <b style={{ color: 'var(--text)' }}>{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, rows.length)}</b> of <b style={{ color: 'var(--text)' }}>{rows.length}</b>
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
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
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
function pagerBtn(active: boolean, disabled: boolean): React.CSSProperties {
  return {
    minWidth: 34, height: 34, padding: '0 10px', borderRadius: 8, fontSize: 13, fontWeight: 700,
    border: `1px solid ${active ? 'var(--brand)' : 'var(--border-strong)'}`,
    background: active ? 'var(--brand)' : 'var(--surface)',
    color: active ? '#fff' : disabled ? 'var(--text-faint)' : 'var(--text-muted)',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
  };
}

// build "06 Jun, 11:13 am" from an ISO timestamp
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
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
  return <label><div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 5 }}>{label}</div>{children}</label>;
}
function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '.04em' }}>{label.toUpperCase()}</div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}

const full: React.CSSProperties = { ...inputStyle, width: '100%' };
const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 700, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', whiteSpace: 'nowrap' };
const unit: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)' };
const backBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '9px 14px', fontWeight: 700, fontSize: 14 };
const expBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--brand)' };
const applyBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const clearBtn: React.CSSProperties = { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '9px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const linkBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', color: 'var(--brand)', fontWeight: 700, fontSize: 13, cursor: 'pointer', marginLeft: 'auto' };
const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--brand-soft)', color: 'var(--brand)', borderRadius: 99, padding: '4px 6px 4px 12px', fontSize: 12, fontWeight: 700 };
const chipX: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'rgba(59,91,253,.15)', color: 'var(--brand)', cursor: 'pointer' };
