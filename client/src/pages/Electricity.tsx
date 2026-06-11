// ============================================================
//  ELECTRICITY PAGE  —  KPIs + dept-wise + hourly load +
//  searchable consumers (click a machine for its power history)
// ============================================================
import { useMemo, useState } from 'react';
import { Zap, Activity, Search } from 'lucide-react';
import { useElectricity } from '../hooks/useData';
import { KpiCard, BarRow, inputStyle } from '../components/ui';
import ConsumptionModal from '../components/ConsumptionModal';

type ElecKind = 'usage' | 'peak' | 'pf' | 'cost';

export default function Electricity() {
  const [q, setQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [kpiModal, setKpiModal] = useState<ElecKind | null>(null);
  const day = dateFrom || dateTo;        // a single date is enough (whole day)
  const endDay = dateTo || dateFrom;
  const ranged = !!day;
  const rangeLabel = dateFrom && dateTo && dateFrom !== dateTo ? `${dateFrom} → ${dateTo}` : day;
  const fromISO = ranged ? new Date(`${day}T00:00`).toISOString() : undefined;
  const toISO = ranged ? new Date(`${endDay}T23:59`).toISOString() : undefined;

  const { data } = useElectricity(fromISO, toISO);
  const { kpis, deptWise, hourly, machines, days } = data;
  const maxDept = Math.max(1, ...deptWise.map((d) => d.kwh));
  const maxKw = Math.max(1, ...hourly.map((h) => h.kw));
  const periodTxt = ranged ? rangeLabel : 'today';

  const consumers = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return machines;
    return machines.filter((c) => `${c.code} ${c.type} ${c.department}`.toLowerCase().includes(s));
  }, [machines, q]);

  return (
    <div style={{ padding: '0 28px 40px' }}>
      <div className="grid-stats-4" style={{ gap: 14 }}>
        <KpiCard label={ranged ? 'Total Usage' : "Today's Usage"} value={`${(kpis.todayKwh / 1000).toFixed(1)}K kWh`} sub={ranged ? `${rangeLabel} · ${days} day${days > 1 ? 's' : ''}` : 'Across your machines'} accent="var(--accent-amber)" onClick={() => setKpiModal('usage')} />
        <KpiCard label="Peak Load" value={`${kpis.peakLoadKw} kW`} sub="Busiest machine" accent="var(--accent-red)" onClick={() => setKpiModal('peak')} />
        <KpiCard label="Power Factor" value={kpis.powerFactor} sub="Within target" accent="var(--accent-green)" onClick={() => setKpiModal('pf')} />
        <KpiCard label={ranged ? 'Total Cost' : 'Cost Today'} value={`₹${(kpis.costToday / 1000).toFixed(0)}K`} sub="≈ ₹8.5 per kWh" accent="var(--accent-purple)" onClick={() => setKpiModal('cost')} />
      </div>

      <div className="grid-two" style={{ gap: 16, marginTop: 18 }}>
        {/* dept-wise */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={16} color="var(--accent-amber)" /> Department-wise Consumption (kWh)
          </div>
          {deptWise.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No data yet — run the simulator.</div>
          ) : (
            deptWise.map((d) => <BarRow key={d.dept} label={d.dept} value={d.kwh} max={maxDept} color="#f59e0b" />)
          )}
        </div>

        {/* hourly load */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={16} color="var(--accent-amber)" /> Hourly Load Pattern (kW)
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 200, paddingTop: 10 }}>
            {hourly.map((h) => (
              <div key={h.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>{h.kw}</div>
                <div style={{ width: '100%', height: `${(h.kw / maxKw) * 100}%`, background: 'linear-gradient(180deg,#fbbf24,#f59e0b)', borderRadius: '6px 6px 0 0', minHeight: 4 }} />
                <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{h.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* searchable consumers */}
      <div className="card" style={{ padding: 18, marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={16} color="var(--accent-red)" /> Electricity Consuming Machines
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ position: 'relative', flex: '2 1 240px', maxWidth: 420 }}>
            <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--text-faint)' }} />
            <input style={{ ...inputStyle, width: '100%', paddingLeft: 34 }} placeholder="Search machine, type or department…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div style={{ flex: '0 1 150px' }}><div style={miniLbl}>FROM</div><input type="date" style={{ ...inputStyle, width: '100%' }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
          <div style={{ flex: '0 1 150px' }}><div style={miniLbl}>TO</div><input type="date" style={{ ...inputStyle, width: '100%' }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
        </div>
        <div style={{ fontSize: 11, color: ranged ? 'var(--brand)' : 'var(--text-faint)', marginBottom: 10 }}>
          {ranged ? `Avg load for ${rangeLabel}` : 'Live snapshot — pick a date (or range) for historical averages'}
          {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ marginLeft: 8, border: 'none', background: 'none', color: 'var(--brand)', fontWeight: 700, cursor: 'pointer' }}>clear dates</button>}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-faint)', fontSize: 11 }}>
              <th style={th}>MACHINE</th><th style={th}>TYPE</th><th style={th}>DEPARTMENT</th><th style={thR}>LOAD (kW)</th><th style={thR}>{ranged ? 'kWh (PERIOD)' : 'kWh TODAY'}</th>
            </tr>
          </thead>
          <tbody>
            {consumers.length === 0 ? (
              <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No machines match.</td></tr>
            ) : consumers.map((c) => (
              <tr key={c.code} onClick={() => setSelected(c.code)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} title="View power history">
                <td style={{ ...td, fontWeight: 700 }} className="mono">{c.code}</td>
                <td style={{ ...td, color: 'var(--text-muted)' }}>{c.type}</td>
                <td style={{ ...td, color: 'var(--text-muted)' }}>{c.department}</td>
                <td style={tdR} className="mono">{c.kw.toLocaleString()}</td>
                <td style={tdR} className="mono">{c.kwhToday.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 10 }}>Tip: click a machine to see its power-load history.</div>
      </div>

      {selected && <ConsumptionModal code={selected} metric="electricity" from={fromISO} to={toISO} onClose={() => setSelected(null)} />}
      {kpiModal && <ElectricityDetailModal kind={kpiModal} machines={machines} kpis={kpis} periodTxt={periodTxt} onClose={() => setKpiModal(null)} />}
    </div>
  );
}

// ---- KPI drill-down: per-machine power breakdown, sorted by the metric you clicked ----
type ElecMachine = { code: string; type: string; department: string; kw: number; kwhToday: number };
function ElectricityDetailModal({
  kind, machines, kpis, periodTxt, onClose,
}: {
  kind: ElecKind;
  machines: ElecMachine[];
  kpis: { todayKwh: number; peakLoadKw: number; powerFactor: number; costToday: number };
  periodTxt: string;
  onClose: () => void;
}) {
  const meta: Record<ElecKind, { title: string; sortKey: 'kw' | 'kwhToday' }> = {
    usage: { title: `⚡ Energy usage — by machine · ${periodTxt}`, sortKey: 'kwhToday' },
    peak: { title: `🔺 Load — by machine · ${periodTxt}`, sortKey: 'kw' },
    cost: { title: `₹ Cost — by machine · ${periodTxt}`, sortKey: 'kwhToday' },
    pf: { title: `⚙️ Power factor · ${periodTxt}`, sortKey: 'kw' },
  };
  const { title, sortKey } = meta[kind];
  const rows = [...machines].sort((a, b) => b[sortKey] - a[sortKey]);

  return (
    <div style={overlay} onClick={onClose}>
      <div className="card" style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800 }}>{title}</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div className="grid-stats-4" style={{ gap: 10, marginBottom: 14 }}>
          <Mini label="Total Energy" value={`${kpis.todayKwh.toLocaleString()} kWh`} />
          <Mini label="Peak Load" value={`${kpis.peakLoadKw.toLocaleString()} kW`} />
          <Mini label="Est. Cost" value={`₹${kpis.costToday.toLocaleString()}`} />
          <Mini label="Power Factor" value={String(kpis.powerFactor)} />
        </div>
        {kind === 'pf' && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-2,#f6f7f9)', borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>
            Power factor is modeled at a steady <b>0.92</b> across the plant (within the 0.95 target). Per-machine load is shown below.
          </div>
        )}
        <div style={{ maxHeight: 360, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-faint)', fontSize: 11 }}>
              <th style={th}>MACHINE</th><th style={th}>DEPARTMENT</th><th style={thR}>LOAD (kW)</th><th style={thR}>ENERGY (kWh)</th><th style={thR}>COST</th>
            </tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.code} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...td, fontWeight: 700 }} className="mono">{m.code}</td>
                  <td style={{ ...td, color: 'var(--text-muted)' }}>{m.department}</td>
                  <td style={{ ...tdR, color: kind === 'peak' || kind === 'pf' ? 'var(--accent-red)' : undefined }} className="mono">{m.kw.toLocaleString()}</td>
                  <td style={{ ...tdR, color: kind === 'usage' ? 'var(--accent-amber)' : undefined }} className="mono">{m.kwhToday.toLocaleString()}</td>
                  <td style={{ ...tdR, color: kind === 'cost' ? 'var(--accent-purple)' : undefined }} className="mono">₹{Math.round(m.kwhToday * 8.5).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 10 }}>Modeled from machine activity (speed · water · production) — no dedicated power meter.</div>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--surface-2,#f6f7f9)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', color: 'var(--text-faint)' }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 };
const modal: React.CSSProperties = { width: 'min(760px, 96vw)', maxHeight: '88vh', overflow: 'auto', padding: 22, background: 'var(--surface,#fff)' };
const miniLbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text-faint)', marginBottom: 4 };
const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 700 };
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '9px 8px' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontWeight: 700 };
