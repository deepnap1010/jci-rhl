// client/src/components/PressureRing.tsx
// Circular gauge — efficiency / health / fill %, status-colored arc.
// Theme-aware track (uses the --c-line token so it adapts to light/dark).
import type { ReactNode } from 'react';

const STATUS_COLOR: Record<string, string> = {
  running: '#0D9488', idle: '#D97706', stopped: '#DC2626', disconnected: '#94A3B8', offline: '#94A3B8',
};

export default function PressureRing({
  value = 0, status = 'offline', size = 64, stroke = 6, label,
}: { value?: number; status?: string; size?: number; stroke?: number; label?: ReactNode }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (v / 100) * c;
  const color = STATUS_COLOR[status] || '#64748B';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: 'rgb(var(--c-line))' }} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset .6s ease, stroke .3s' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="data text-sm font-bold" style={{ color }}>{v}<span className="text-[9px]">%</span></span>
        {label && <span className="text-[8px] text-steel uppercase tracking-wide">{label}</span>}
      </div>
    </div>
  );
}
