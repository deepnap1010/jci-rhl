// ============================================================
//  SHARED UI BITS  —  pure helpers kept after the EKC re-skin
//  (fmtDuration + the theme-aware Metric tile). The legacy styled
//  KpiCard/StatusPill/BarRow/inputStyle were retired with the
//  re-skin — use ../components/ekc-ui (StatCard, StatusPill, …) and
//  the `.input` class instead.
// ============================================================

// ---- seconds → "2h 14m" / "—" ----
export function fmtDuration(sec: number): string {
  if (!sec || sec <= 0) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}

// ---- a single metric tile inside a machine card ----
// Tinted box + an EXPLICIT value colour, so the number stays readable on the
// tint in both light and dark themes (the old version inherited its colour and
// vanished on the light warm/cool tiles in dark mode).
export function Metric({
  label, value, unit, tone = 'plain',
}: { label: string; value: React.ReactNode; unit?: string; tone?: 'plain' | 'warm' | 'cool' | 'bad' }) {
  const box =
    tone === 'warm' ? 'bg-idle/10' :
    tone === 'cool' ? 'bg-[#0EA5E9]/10' :
    tone === 'bad'  ? 'bg-stopped/10' : 'bg-raised';
  const val =
    tone === 'warm' ? 'text-idle' :
    tone === 'cool' ? 'text-[#0EA5E9]' :
    tone === 'bad'  ? 'text-stopped' : 'text-primary';
  return (
    <div className={`${box} rounded-[10px] px-3 py-2.5`}>
      <div className="text-[10px] font-bold uppercase tracking-wide text-steel">{label}</div>
      <div className={`data text-base font-bold mt-0.5 ${val}`}>
        {value}{unit && <span className="text-[11px] font-normal text-steel/70 ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}
