// ============================================================
//  ELECTRICITY PAGE  —  KPIs + dept-wise + hourly load +
//  searchable consumers (click a machine for its power history)
// ============================================================
import { useMemo, useState } from 'react';
import { Zap, Activity, Search } from 'lucide-react';
import { useElectricity } from '../hooks/useData';
import { KpiCard, BarRow, inputStyle } from '../components/ui';
import ConsumptionModal from '../components/ConsumptionModal';

export default function Electricity() {
  const [q, setQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const day = dateFrom || dateTo;        // a single date is enough (whole day)
  const endDay = dateTo || dateFrom;
  const ranged = !!day;
  const rangeLabel = dateFrom && dateTo && dateFrom !== dateTo ? `${dateFrom} → ${dateTo}` : day;
  const fromISO = ranged ? new Date(`${day}T00:00`).toISOString() : undefined;
  const toISO = ranged ? new Date(`${endDay}T23:59`).toISOString() : undefined;

  const { data } = useElectricity(fromISO, toISO);
  const { kpis, deptWise, hourly, machines } = data;
  const maxDept = Math.max(1, ...deptWise.map((d) => d.kwh));
  const maxKw = Math.max(1, ...hourly.map((h) => h.kw));

  const consumers = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return machines;
    return machines.filter((c) => `${c.code} ${c.type} ${c.department}`.toLowerCase().includes(s));
  }, [machines, q]);

  return (
    <div style={{ padding: '0 28px 40px' }}>
      <div className="grid-stats-4" style={{ gap: 14 }}>
        <KpiCard label="Today's Usage" value={`${(kpis.todayKwh / 1000).toFixed(1)}K kWh`} sub="Across your machines" accent="var(--accent-amber)" />
        <KpiCard label="Peak Load" value={`${kpis.peakLoadKw} kW`} sub="Busiest machine" accent="var(--accent-red)" />
        <KpiCard label="Power Factor" value={kpis.powerFactor} sub="Within target" accent="var(--accent-green)" />
        <KpiCard label="Cost Today" value={`₹${(kpis.costToday / 1000).toFixed(0)}K`} sub="≈ ₹8.5 per kWh" accent="var(--accent-purple)" />
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
              <th style={th}>MACHINE</th><th style={th}>TYPE</th><th style={th}>DEPARTMENT</th><th style={thR}>LOAD (kW)</th><th style={thR}>kWh TODAY</th>
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
    </div>
  );
}

const miniLbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text-faint)', marginBottom: 4 };
const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 700 };
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '9px 8px' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontWeight: 700 };
