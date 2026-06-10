// ============================================================
//  SHARED UI BITS  —  KpiCard, StatusPill, Metric tile
// ============================================================
import type { MachineStatus } from '@shared/types';

// ---- colored-top KPI card (like the dashboard summary cards) ----
export function KpiCard({
  label, value, sub, accent,
}: { label: string; value: React.ReactNode; sub?: string; accent: string }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', animation: 'fadeUp .4s ease' }}>
      <div style={{ height: 4, background: accent }} />
      <div style={{ padding: '16px 18px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--text-faint)' }}>
          {label.toUpperCase()}
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: accent, margin: '6px 0 2px' }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</div>}
      </div>
    </div>
  );
}

// ---- status pill ----
const STATUS_LABEL: Record<MachineStatus, string> = {
  running: 'Running', idle: 'Idle', stopped: 'Stopped', disconnected: 'Disconnected',
};
export function StatusPill({ status }: { status: MachineStatus }) {
  return (
    <span className={`pill ${status}`}>
      <span className="dot" /> {STATUS_LABEL[status]}
    </span>
  );
}

// ---- a labeled horizontal bar (dept-wise charts) ----
export function BarRow({
  label, value, max, suffix, color = 'var(--brand)', labelWidth = 130,
}: { label: string; value: number; max: number; suffix?: string; color?: string; labelWidth?: number }) {
  const pct = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
      <div style={{ width: labelWidth, fontSize: 13, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 99 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99 }} />
      </div>
      <div className="mono" style={{ width: 64, textAlign: 'right', fontSize: 13, fontWeight: 700 }}>
        {value.toLocaleString()}{suffix ? <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2 }}>{suffix}</span> : null}
      </div>
    </div>
  );
}

// ---- seconds → "2h 14m" / "—" ----
export function fmtDuration(sec: number): string {
  if (!sec || sec <= 0) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}

// shared input/select style used by page filter bars
export const inputStyle: React.CSSProperties = {
  border: '1px solid var(--border-strong)', borderRadius: 10, padding: '9px 12px',
  fontSize: 14, background: 'var(--surface)', color: 'var(--text)', outline: 'none',
};

// ---- a single metric tile inside a machine card ----
export function Metric({
  label, value, unit, tone = 'plain',
}: { label: string; value: React.ReactNode; unit?: string; tone?: 'plain' | 'warm' | 'cool' | 'bad' }) {
  const bg = tone === 'warm' ? '#fdeaea' : tone === 'cool' ? '#eaf3fb' : tone === 'bad' ? '#fdeaea' : 'var(--surface-2)';
  return (
    <div style={{ background: bg, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', color: 'var(--text-faint)' }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }} className="mono">
        {value}{unit && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  );
}
