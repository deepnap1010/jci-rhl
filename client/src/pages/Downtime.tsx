// ============================================================
//  DOWNTIME PAGE  —  idle/stopped time + reconstructed event log
//  Cards show the PLC's idle/stopped seconds + occurrence counts.
//  Expanding a card lazily loads the actual idle/stopped spells
//  reconstructed from the telemetry history.
// ============================================================
import { useState } from 'react';
import { useDowntimeData } from '../hooks/useData';
import type { DowntimeCard as Card, DowntimeEventRow } from '../hooks/useData';
import { KpiCard, StatusPill, fmtDuration, inputStyle } from '../components/ui';
import { api } from '../api/client';
import { DEPARTMENTS } from '@shared/types';

// card ordering for the downtime view
const STATUS_ORDER: Record<string, number> = { stopped: 0, idle: 1, running: 2, disconnected: 3 };

export default function Downtime() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dept, setDept] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('downtime'); // worst offenders first by default
  const [hideZero, setHideZero] = useState(true); // hide machines with no downtime in the window

  // build the query string from the filters
  const qs = (() => {
    const p = new URLSearchParams();
    const from = dateFrom || dateTo;
    const to = dateTo || dateFrom;
    if (from && to) {
      p.set('from', new Date(`${from}T00:00`).toISOString());
      p.set('to', new Date(`${to}T23:59`).toISOString());
    }
    if (dept) p.set('dept', dept);
    if (status) p.set('status', status);
    const s = p.toString();
    return s ? `?${s}` : '';
  })();

  const { data } = useDowntimeData(qs);
  const { cards, kpis } = data;
  const filtered = !!(dateFrom || dateTo || dept || status);
  const rangeNote = dateFrom || dateTo ? 'in range' : '24h';

  const down = (m: Card) => (m.idleSec || 0) + (m.stoppedSec || 0);
  const hasDowntime = (m: Card) => down(m) > 0 || (m.eventCount || 0) > 0 || !!m.lastSpell;
  const sortedCards = [...cards].sort((a, b) => {
    if (sort === 'occurrences') return (b.eventCount || 0) - (a.eventCount || 0) || a.code.localeCompare(b.code);
    if (sort === 'status') return (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.code.localeCompare(b.code);
    if (sort === 'name') return a.code.localeCompare(b.code);
    return down(b) - down(a) || a.code.localeCompare(b.code); // 'downtime' (default): most idle+stopped first
  });
  const visibleCards = hideZero ? sortedCards.filter(hasDowntime) : sortedCards;
  const hiddenCount = cards.length - visibleCards.length;

  return (
    <div style={{ padding: '0 28px 40px' }}>
      <div className="grid-stats-4" style={{ gap: 14 }}>
        <KpiCard label="Total Downtime" value={fmtDuration(kpis.totalDowntimeSec)} sub={`Idle + stopped (${rangeNote})`} accent="var(--accent-red)" />
        <KpiCard label="Stopped" value={kpis.stopped} sub="Currently stopped" accent="var(--accent-red)" />
        <KpiCard label="Idle" value={kpis.idle} sub="Currently idle" accent="var(--accent-amber)" />
        <KpiCard label="Running" value={kpis.running} sub={`of ${cards.length} machines`} accent="var(--accent-green)" />
      </div>

      {/* filters */}
      <div className="card" style={{ padding: 16, marginTop: 18, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Lbl label="Date From"><input type="date" style={ctrl} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Lbl>
        <Lbl label="Date To"><input type="date" style={ctrl} value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Lbl>
        <Lbl label="Department">
          <select style={ctrl} value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">All Departments</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Lbl>
        <Lbl label="Status">
          <select style={ctrl} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="running">Running</option>
            <option value="idle">Idle</option>
            <option value="stopped">Stopped</option>
            <option value="disconnected">Disconnected</option>
          </select>
        </Lbl>
        <Lbl label="Sort">
          <select style={ctrl} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="downtime">Most downtime</option>
            <option value="occurrences">Most occurrences</option>
            <option value="status">Status (stopped first)</option>
            <option value="name">Name</option>
          </select>
        </Lbl>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
          Hide no-downtime{hideZero && hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}
        </label>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 9 }}>Showing {visibleCards.length} machine{visibleCards.length === 1 ? '' : 's'}</span>
        {filtered && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); setDept(''); setStatus(''); }}
            style={{ marginLeft: 'auto', marginBottom: 4, border: 'none', background: 'none', color: 'var(--brand)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Clear filters
          </button>
        )}
      </div>

      <div className="masonry-cards" style={{ marginTop: 18 }}>
        {visibleCards.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            {cards.length > 0 && hideZero ? 'No machines had downtime in this window. Untick “Hide no-downtime” to see all.' : 'No machines match these filters.'}
          </div>
        ) : (
          visibleCards.map((m) => <DowntimeCardView key={m._id} m={m} />)
        )}
      </div>
    </div>
  );
}

function Lbl({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{label}</span>{children}</label>;
}
const ctrl: React.CSSProperties = { ...inputStyle };

function DowntimeCardView({ m }: { m: Card & { idleCount?: number; stoppedCount?: number } }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<DowntimeEventRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && events === null) {
      setLoading(true);
      try {
        const r = await api.get<{ events: DowntimeEventRow[] }>(`/api/downtime/${m.code}/events`);
        setEvents(r.data.events || []);
      } catch {
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }
  }

  const occurrences = (m.idleCount || 0) + (m.stoppedCount || 0);

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <div className="mono" style={{ fontWeight: 800 }}>{m.code}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.name} · {m.department}</div>
        </div>
        <StatusPill status={m.status} />
      </div>

      <div className="grid-two" style={{ gap: 8, marginTop: 12 }}>
        <div style={{ background: '#fef5e7', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--idle)' }}>IDLE (24H)</div>
          <div className="mono" style={{ fontWeight: 700, fontSize: 16 }}>{fmtDuration(m.idleSec)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{m.idleCount || 0} occurrences</div>
        </div>
        <div style={{ background: '#fdeaea', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--stopped)' }}>STOPPED (24H)</div>
          <div className="mono" style={{ fontWeight: 700, fontSize: 16 }}>{fmtDuration(m.stoppedSec)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{m.stoppedCount || 0} occurrences</div>
        </div>
      </div>

      {/* most recent idle/stopped spell — so a machine never just reads "0" when it has been down */}
      {m.lastSpell ? (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
          Last downtime:{' '}
          <b style={{ color: m.lastSpell.type === 'stopped' ? 'var(--stopped)' : 'var(--idle)' }}>
            {m.lastSpell.type === 'stopped' ? 'Stopped' : 'Idle'} {fmtDuration(m.lastSpell.durationSec)}
          </b>
          {' · '}
          {new Date(m.lastSpell.ts).toLocaleString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </div>
      ) : (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--running)' }}>No downtime in the last 24h ✓</div>
      )}

      <button
        onClick={toggle}
        style={{ marginTop: 12, width: '100%', textAlign: 'left', border: 'none', background: 'none', color: 'var(--brand)', fontWeight: 700, fontSize: 13, padding: 0 }}
      >
        {open ? '▾ Hide events' : `▸ Show events${occurrences ? ` (${occurrences} occurrences)` : ''}`}
      </button>

      {open && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10, maxHeight: 220, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading events…</div>
          ) : !events || events.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No idle/stopped spells in the last 24h.</div>
          ) : (
            events.map((e) => (
              <div key={e._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '5px 0' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: e.type === 'stopped' ? 'var(--stopped)' : 'var(--idle)' }} />
                  <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{e.type}</span>
                  <span style={{ color: 'var(--text-faint)' }} className="mono">{new Date(e.startTs).toLocaleTimeString()}</span>
                </span>
                <span className="mono" style={{ color: 'var(--text-muted)' }}>{e.ongoing ? 'ongoing…' : fmtDuration(e.durationSec)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
