// client/src/components/charts.tsx
// ============================================================
//  Dependency-free SVG / flex charts for the EKC-style panels:
//    • Donut        — proportional ring, value in the centre
//    • Legend       — colour-coded "label · value · %" rows
//    • StackBar     — one stacked bar + legend (parts of a whole)
//    • Distribution — label/value/% rows, each with a track bar
//    • CategoryBars — label/value rows with a bar to a max (e.g. % → 100)
//  Tracks use the themed `--c-line` token, so they adapt to light/dark.
// ============================================================
import type { ReactNode } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const nf = (v: number) => (Number(v) || 0).toLocaleString();
const TRACK = 'rgb(var(--c-line))'; // themed ring/track colour

export interface ChartSegment { label?: string; value: number; color: string }

const sum = (segs: ChartSegment[]) => segs.reduce((s, x) => s + (Number(x.value) || 0), 0);

// ── Donut — full circle, value in the centre ────────────────
export function Donut({ segments = [], size = 128, thickness = 16, children, emptyColor = '#94A3B8' }: {
  segments?: ChartSegment[]; size?: number; thickness?: number; children?: ReactNode; emptyColor?: string;
}) {
  const total = sum(segments);
  const r = (size - thickness) / 2;
  const c = size / 2;
  let acc = 0;
  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={c} cy={c} r={r} fill="none" strokeWidth={thickness} opacity={total ? 1 : 0.18} style={{ stroke: total ? TRACK : emptyColor }} />
        {total > 0 && segments.map((s, i) => {
          const len = (s.value / total) * 100;
          const node = (
            <circle
              key={s.label ?? i} cx={c} cy={c} r={r} fill="none"
              stroke={s.color} strokeWidth={thickness} pathLength={100}
              strokeDasharray={`${len} ${100 - len}`} strokeDashoffset={-acc}
              style={{ transition: 'stroke-dasharray .5s ease, stroke-dashoffset .5s ease' }}
            />
          );
          acc += len;
          return node;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">{children}</div>
    </div>
  );
}

// ── Legend — colour-coded rows that read out the exact numbers ──
// `scroll` (default) renders every row inside a scrollable box; set
// `scroll={false}` for a short fixed list (caps at `max`, "+N more").
export function Legend({ rows = [], total, format = nf, max = 8, scroll = true }: {
  rows?: ChartSegment[]; total?: number; format?: (v: number) => ReactNode; max?: number; scroll?: boolean;
}) {
  const shown = scroll ? rows : rows.slice(0, max);
  const hidden = rows.length - shown.length;
  return (
    <div className={scroll ? 'max-h-[200px] overflow-y-auto pr-1 -mr-1' : ''}>
      <div className="space-y-1.5">
        {shown.map((r, i) => {
          const pct = total ? Math.round((r.value / total) * 100) : 0;
          return (
            <div key={r.label ?? i} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: r.color }} />
              <span className="text-steel truncate flex-1" title={r.label}>{r.label}</span>
              <span className="data text-primary font-medium shrink-0">{format(r.value)}</span>
              <span className="data text-steel/60 w-9 text-right shrink-0">{pct}%</span>
            </div>
          );
        })}
      </div>
      {hidden > 0 && <div className="text-[10px] text-steel/60 mt-2 pt-2 border-t border-line">+{hidden} more</div>}
    </div>
  );
}

// ── StackBar — one stacked bar + legend (parts of a whole) ──────
export function StackBar({ segments, unit }: { segments: ChartSegment[]; unit?: string }) {
  const total = sum(segments);
  if (!total) return <div className="text-sm text-steel py-4 text-center">No data.</div>;
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-line">
        {segments.filter((s) => s.value > 0).map((s) => (
          <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} title={`${s.label}: ${s.value}`} />
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-steel"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>
            <span className="data text-primary font-medium">{nf(s.value)} <span className="text-steel/60">· {total ? Math.round((s.value / total) * 100) : 0}%</span></span>
          </div>
        ))}
      </div>
      {unit && <div className="text-[10px] text-steel/60 mt-2 pt-2 border-t border-line">{nf(total)} {unit} total</div>}
    </div>
  );
}

// ── Distribution — label/value/% rows, each with a track bar ────
export function Distribution({ title, rows, total, color, unit, onRowClick }: {
  title?: string; rows: { label: string; value: number; badge?: number }[]; total: number; color: string; unit?: string; onRowClick?: (label: string) => void;
}) {
  const mx = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div>
      {title && <div className="label mb-2">{title}</div>}
      <div className="space-y-2.5">
        {rows.length === 0 ? <div className="text-xs text-steel">No data.</div> : rows.map((r) => {
          const body = (
            <>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-steel flex items-center gap-1.5 truncate pr-2">{r.label}{(r.badge ?? 0) > 0 && <span className="pill bg-idle/10 text-idle !text-[9px]">{r.badge}</span>}</span>
                <span className="data text-primary font-medium shrink-0">{nf(r.value)}{total ? <span className="text-steel/60"> · {Math.round((r.value / total) * 100)}%</span> : ''}</span>
              </div>
              <div className="h-1.5 bg-line rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(r.value / mx) * 100}%`, background: color }} /></div>
            </>
          );
          return onRowClick
            ? <button key={r.label} type="button" onClick={() => onRowClick(r.label)} className="block w-full text-left rounded-md px-1.5 -mx-1.5 py-1 hover:bg-raised transition-colors">{body}</button>
            : <div key={r.label}>{body}</div>;
        })}
      </div>
      {unit && rows.length > 0 && <div className="text-[10px] text-steel/60 mt-2">{nf(total)} {unit} total</div>}
    </div>
  );
}

// ── CategoryBars — label/value rows with a bar to a max ─────────
export function CategoryBars({ data, max, suffix, onRowClick }: {
  data: { label: string; value: number; color: string }[]; max?: number; suffix?: string; onRowClick?: (label: string) => void;
}) {
  const mx = max ?? Math.max(...data.map((d) => d.value), 1);
  if (data.length === 0) return <div className="text-sm text-steel py-4 text-center">No data.</div>;
  return (
    <div className="space-y-2.5">
      {data.map((d) => {
        const body = (
          <>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-steel truncate pr-2">{d.label}</span>
              <span className="data font-medium shrink-0" style={{ color: d.color }}>{nf(d.value)}{suffix}</span>
            </div>
            <div className="h-1.5 bg-line rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(d.value / mx) * 100}%`, background: d.color }} /></div>
          </>
        );
        return onRowClick
          ? <button key={d.label} type="button" onClick={() => onRowClick(d.label)} className="block w-full text-left rounded-md px-1.5 -mx-1.5 py-1 hover:bg-raised transition-colors">{body}</button>
          : <div key={d.label}>{body}</div>;
      })}
    </div>
  );
}

// ── TrendChart — interactive area chart (hover tooltip + crosshair + axes) ──────
// Theme-aware: the line/area use the passed brand colour; grid/axis use a neutral
// steel that reads on both light & dark; the tooltip uses themed Tailwind tokens.
function ChartTip({ active, payload, unit }: { active?: boolean; payload?: Array<{ value: number; payload?: { full?: string } }>; unit?: string }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-panel text-xs">
      <div className="text-steel">{p?.payload?.full ?? ''}</div>
      <div className="data font-bold text-primary mt-0.5">{Number(p?.value).toLocaleString()}{unit ? ` ${unit}` : ''}</div>
    </div>
  );
}

export function TrendChart({ data, color, unit, height = 220 }: { data: { t: string; full: string; v: number }[]; color: string; unit?: string; height?: number }) {
  if (data.length < 2) return <div style={{ height }} className="grid place-items-center text-sm text-steel">Not enough data to plot.</div>;
  const gid = `tc-${color.replace('#', '')}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 14, bottom: 2, left: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" strokeOpacity={0.18} vertical={false} />
        <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={{ stroke: '#94A3B8', strokeOpacity: 0.3 }} minTickGap={28} />
        <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} width={46} tickFormatter={(v) => new Intl.NumberFormat(undefined, { notation: 'compact' }).format(Number(v))} />
        <Tooltip content={<ChartTip unit={unit} />} cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '3 3' }} />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${gid})`} dot={false} activeDot={{ r: 3, fill: color }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
