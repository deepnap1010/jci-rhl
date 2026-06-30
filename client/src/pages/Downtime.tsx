// ============================================================
//  DOWNTIME PAGE  —  idle/stopped time + reconstructed event log
//  Cards show the PLC's idle/stopped seconds + occurrence counts.
//  Expanding a card lazily loads the actual idle/stopped spells
//  reconstructed from the telemetry history.
//  EKC re-skin — visual layer only, logic unchanged.
// ============================================================
import { useState } from 'react';
import { useDowntimeData } from '../hooks/useData';
import type { DowntimeCard as Card, DowntimeEventRow } from '../hooks/useData';
import { fmtDuration } from '../components/ui';            // pure helper — stays shared
import { StatCard, StatusPill } from '../components/ekc-ui'; // EKC, theme-aware
import { cn } from '../lib/utils';
import { api } from '../api/client';
import { DEPARTMENTS } from '@shared/types';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

// card ordering for the downtime view
const STATUS_ORDER: Record<string, number> = { stopped: 0, idle: 1, running: 2, disconnected: 3 };

// shared input/select styling for the filter bar (EKC)
const ctrl = 'bg-base border border-line rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent';

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
  // live feed offline → server returns the last recorded day instead of an empty 24h
  const stale = !(dateFrom || dateTo) && !!data.stale;
  const asOfLabel = data.lastUpdated ? new Date(data.lastUpdated).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const dayLabel = data.lastUpdated ? new Date(data.lastUpdated).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '';
  const rangeNote = dateFrom || dateTo ? 'in range' : stale ? `last day · ${dayLabel}` : '24h';
  const winLabel = stale ? dayLabel : (dateFrom || dateTo) ? 'range' : '24h';                 // tile parenthetical
  const noDownText = stale ? `on ${dayLabel}` : (dateFrom || dateTo) ? 'in this range' : 'in the last 24h'; // empty message

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
    <div className="px-5 sm:px-7 pt-1 pb-10 space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Downtime" value={fmtDuration(kpis.totalDowntimeSec)} sub={`Idle + stopped · ${cards.filter((c) => (c.idleSec || 0) + (c.stoppedSec || 0) > 0).length} machines · ${rangeNote}`} accent="stopped" />
        <StatCard label="Stopped" value={kpis.stopped} sub="Currently stopped" accent="stopped" />
        <StatCard label="Idle" value={kpis.idle} sub="Currently idle" accent="idle" />
        <StatCard label="Running" value={kpis.running} sub={`of ${cards.length} machines`} accent="accent" />
      </div>

      {stale && (
        <div className="rounded-card border border-idle/30 bg-idle/10 text-idle px-4 py-2.5 text-sm font-medium flex items-center gap-2">
          <AlertTriangle size={15} className="shrink-0" />
          Live feed offline — showing the last recorded day{asOfLabel ? ` (as of ${asOfLabel})` : ''}, not the last 24 hours.
        </div>
      )}

      {/* filters */}
      <div className="panel p-4 flex flex-wrap items-end gap-3">
        <Lbl label="Date From"><input type="date" className={ctrl} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Lbl>
        <Lbl label="Date To"><input type="date" className={ctrl} value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Lbl>
        <Lbl label="Department">
          <select className={ctrl} value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">All Departments</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Lbl>
        <Lbl label="Status">
          <select className={ctrl} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="running">Running</option>
            <option value="idle">Idle</option>
            <option value="stopped">Stopped</option>
            <option value="disconnected">Disconnected</option>
          </select>
        </Lbl>
        <Lbl label="Sort">
          <select className={ctrl} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="downtime">Most downtime</option>
            <option value="occurrences">Most occurrences</option>
            <option value="status">Status (stopped first)</option>
            <option value="name">Name</option>
          </select>
        </Lbl>
        <label className="flex items-center gap-1.5 mb-2 text-sm text-steel cursor-pointer select-none">
          <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
          Hide no-downtime{hideZero && hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}
        </label>
        <span className="text-sm text-steel mb-2">Showing {visibleCards.length} machine{visibleCards.length === 1 ? '' : 's'}</span>
        {filtered && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); setDept(''); setStatus(''); }}
            className="ml-auto mb-1 text-accent text-sm font-semibold hover:underline">
            Clear filters
          </button>
        )}
      </div>

      <div className="masonry-cards">
        {visibleCards.length === 0 ? (
          <div className="panel p-10 text-center text-steel">
            {cards.length > 0 && hideZero ? 'No machines had downtime in this window. Untick “Hide no-downtime” to see all.' : 'No machines match these filters.'}
          </div>
        ) : (
          visibleCards.map((m) => <DowntimeCardView key={m._id} m={m} winLabel={winLabel} noDownText={noDownText} from={data.windowStart} to={data.windowEnd} />)
        )}
      </div>
    </div>
  );
}

function Lbl({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="label">{label}</span>{children}</label>;
}

function DowntimeCardView({ m, winLabel, noDownText, from, to }: { m: Card & { idleCount?: number; stoppedCount?: number }; winLabel: string; noDownText: string; from?: string; to?: string }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<DowntimeEventRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && events === null) {
      setLoading(true);
      try {
        const r = await api.get<{ events: DowntimeEventRow[] }>(`/api/downtime/${m.code}/events`, { params: from && to ? { from, to } : {} });
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
    <div className="panel p-4">
      <div className="flex justify-between">
        <div>
          <div className="data font-extrabold text-primary">{m.code}</div>
          <div className="text-xs text-steel">{m.name} · {m.department}</div>
        </div>
        <StatusPill status={m.status} />
      </div>

      <div className="grid-two gap-2 mt-3">
        <div className="rounded-card bg-idle/10 p-3">
          <div className="text-[10px] font-bold text-idle">IDLE ({winLabel.toUpperCase()})</div>
          <div className="data font-bold text-base text-primary">{fmtDuration(m.idleSec)}</div>
          <div className="text-[11px] text-steel">{m.idleCount || 0} occurrences</div>
        </div>
        <div className="rounded-card bg-stopped/10 p-3">
          <div className="text-[10px] font-bold text-stopped">STOPPED ({winLabel.toUpperCase()})</div>
          <div className="data font-bold text-base text-primary">{fmtDuration(m.stoppedSec)}</div>
          <div className="text-[11px] text-steel">{m.stoppedCount || 0} occurrences</div>
        </div>
      </div>

      {/* most recent idle/stopped spell — so a machine never just reads "0" when it has been down */}
      {m.lastSpell ? (
        <div className="mt-2.5 text-xs text-steel">
          Last downtime:{' '}
          <b className={m.lastSpell.type === 'stopped' ? 'text-stopped' : 'text-idle'}>
            {m.lastSpell.type === 'stopped' ? 'Stopped' : 'Idle'} {fmtDuration(m.lastSpell.durationSec)}
          </b>
          {' · '}
          {new Date(m.lastSpell.ts).toLocaleString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </div>
      ) : (
        <div className="mt-2.5 text-xs text-running">No downtime {noDownText} ✓</div>
      )}

      <button
        onClick={toggle}
        className="mt-3 w-full text-left text-accent text-sm font-semibold inline-flex items-center gap-1"
      >
        {open ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
        {open ? 'Hide events' : `Show events${occurrences ? ` (${occurrences} occurrences)` : ''}`}
      </button>

      {open && (
        <div className="mt-2.5 border-t border-line pt-2.5 max-h-[220px] overflow-y-auto">
          {loading ? (
            <div className="text-xs text-steel">Loading events…</div>
          ) : !events || events.length === 0 ? (
            <div className="text-xs text-steel">No idle/stopped spells {noDownText}.</div>
          ) : (
            events.map((e) => (
              <div key={e._id} className="flex justify-between items-center text-xs py-[5px]">
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn('w-[7px] h-[7px] rounded-full', e.type === 'stopped' ? 'bg-stopped' : 'bg-idle')} />
                  <span className="font-bold capitalize">{e.type}</span>
                  <span className="data text-steel/70">{new Date(e.startTs).toLocaleTimeString()}</span>
                </span>
                <span className="data text-steel">{e.ongoing ? 'ongoing…' : fmtDuration(e.durationSec)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
