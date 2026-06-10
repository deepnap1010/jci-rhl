// ============================================================
//  WATER FLOW PAGE  —  KPIs + dept-wise usage + searchable
//  consumers (click a machine to see its water history)
// ============================================================
import { useMemo, useState } from 'react';
import { Droplets, Search } from 'lucide-react';
import { useWater } from '../hooks/useData';
import { KpiCard, BarRow, inputStyle } from '../components/ui';
import ConsumptionModal from '../components/ConsumptionModal';

export default function WaterFlow() {
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

  const { data } = useWater(fromISO, toISO);
  const { kpis, deptWise, topConsumers } = data;
  const max = Math.max(1, ...deptWise.map((d) => d.kl));

  const consumers = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return topConsumers;
    return topConsumers.filter((c) => `${c.code} ${c.type} ${c.department}`.toLowerCase().includes(s));
  }, [topConsumers, q]);

  return (
    <div style={{ padding: '0 28px 40px' }}>
      <div className="grid-stats-4" style={{ gap: 14 }}>
        <KpiCard label="Total Water" value={`${kpis.totalKL} KL`} sub="Across your machines" accent="var(--accent-blue)" />
        <KpiCard label="Dyeing Usage" value={`${kpis.dyeingUsage} KL`} sub="Hot + Cold dyeing" accent="var(--accent-pink)" />
        <KpiCard label="CBR Steam Water" value={`${kpis.cbrSteamWater} KL`} sub="Bleaching line" accent="var(--accent-teal)" />
        <KpiCard label="Wastage Alert" value={kpis.wastageAlerts} sub="Possible leakage" accent="var(--accent-red)" />
      </div>

      <div className="grid-two" style={{ gap: 16, marginTop: 18 }}>
        {/* dept-wise */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Droplets size={16} color="var(--accent-blue)" /> Department-wise Water (KL/day)
          </div>
          {deptWise.length === 0 ? (
            <Empty />
          ) : (
            deptWise.map((d) => <BarRow key={d.dept} label={d.dept} value={d.kl} max={max} color="#3b5bfd" />)
          )}
        </div>

        {/* searchable consumers */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Droplets size={16} color="var(--accent-teal)" /> Water Consuming Machines
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <div style={{ position: 'relative', flex: '2 1 200px' }}>
              <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--text-faint)' }} />
              <input style={{ ...inputStyle, width: '100%', paddingLeft: 34 }} placeholder="Search machine, type or department…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div style={{ flex: '1 1 120px' }}><div style={miniLbl}>FROM</div><input type="date" style={{ ...inputStyle, width: '100%' }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
            <div style={{ flex: '1 1 120px' }}><div style={miniLbl}>TO</div><input type="date" style={{ ...inputStyle, width: '100%' }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
          </div>
          <div style={{ fontSize: 11, color: ranged ? 'var(--brand)' : 'var(--text-faint)', marginBottom: 10 }}>
            {ranged ? `Avg consumption for ${rangeLabel}` : 'Live snapshot — pick a date (or range) for historical averages'}
            {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ marginLeft: 8, border: 'none', background: 'none', color: 'var(--brand)', fontWeight: 700, cursor: 'pointer' }}>clear dates</button>}
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-faint)', fontSize: 11 }}>
                  <th style={th}>MACHINE</th><th style={th}>TYPE</th><th style={thR}>L/HR</th><th style={thR}>DAILY KL</th>
                </tr>
              </thead>
              <tbody>
                {consumers.length === 0 ? (
                  <tr><td colSpan={4} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No machines match.</td></tr>
                ) : consumers.map((c) => (
                  <tr key={c.code} onClick={() => setSelected(c.code)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} title="View water history">
                    <td style={{ ...td, fontWeight: 700 }} className="mono">{c.code}</td>
                    <td style={{ ...td, color: 'var(--text-muted)' }}>{c.type}</td>
                    <td style={tdR} className="mono">{c.lhr.toLocaleString()}</td>
                    <td style={tdR} className="mono">{c.dailyKL}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 10 }}>Tip: click a machine to see its water-flow history.</div>
        </div>
      </div>

      {selected && <ConsumptionModal code={selected} metric="water" from={fromISO} to={toISO} onClose={() => setSelected(null)} />}
    </div>
  );
}

const Empty = () => <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No data yet — run the simulator.</div>;
const miniLbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text-faint)', marginBottom: 4 };
const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 700 };
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '9px 8px' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontWeight: 700 };
