// client/src/components/ekc-ui.tsx
// ============================================================
//  EKC-STYLE UI PRIMITIVES  (Tailwind + theme tokens)
//  Self-contained building blocks used by the restyled pages.
//  Kept separate from the old ui.tsx so the migration is gradual:
//  a page switches to these imports as it gets converted.
// ============================================================
import type { ReactNode } from 'react';
import { User as UserIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '../lib/utils';

// ── status helpers ──────────────────────────────────────────
type StatusTone = { cls: string; label: string };

function statusTone(status?: string | null): StatusTone {
  switch ((status || '').toLowerCase()) {
    case 'running': return { cls: 'bg-running/10 text-running', label: 'Running' };
    case 'idle':    return { cls: 'bg-idle/10 text-idle', label: 'Idle' };
    case 'stopped': return { cls: 'bg-stopped/10 text-stopped', label: 'Stopped' };
    case 'offline':
    case 'disconnected': return { cls: 'bg-steel/10 text-steel', label: 'Offline' };
    default: return { cls: 'bg-steel/10 text-steel', label: status || 'Unknown' };
  }
}

// ── StatusPill ──────────────────────────────────────────────
export function StatusPill({ status }: { status?: string | null }) {
  const t = statusTone(status);
  return (
    <span className={cn('pill', t.cls)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {t.label}
    </span>
  );
}

// ── LiveDot ─────────────────────────────────────────────────
export function LiveDot({ active = true }: { active?: boolean }) {
  return (
    <span
      className={cn('w-2 h-2 rounded-full', active ? 'bg-accent live-dot' : 'bg-steel/50')}
    />
  );
}

// ── StatCard (KPI tile) ─────────────────────────────────────
interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: ComponentType<{ size?: number }>;
  accent?: 'accent' | 'idle' | 'stopped' | 'steel';
}

export function StatCard({ label, value, sub, icon: Icon, accent = 'accent' }: StatCardProps) {
  const accentText =
    accent === 'idle' ? 'text-idle'
    : accent === 'stopped' ? 'text-stopped'
    : accent === 'steel' ? 'text-steel'
    : 'text-accent';
  const accentBg =
    accent === 'idle' ? 'bg-idle/10'
    : accent === 'stopped' ? 'bg-stopped/10'
    : accent === 'steel' ? 'bg-steel/10'
    : 'bg-accent/10';

  return (
    <div className="panel p-4 flex items-start justify-between">
      <div className="min-w-0">
        <div className="label">{label}</div>
        <div className={cn('text-2xl font-bold mt-1', accentText)}>{value}</div>
        {sub && <div className="text-xs text-steel mt-0.5">{sub}</div>}
      </div>
      {Icon && (
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', accentBg, accentText)}>
          <Icon size={18} />
        </div>
      )}
    </div>
  );
}

// ── Avatar ──────────────────────────────────────────────────
interface AvatarProps {
  name?: string | null;
  src?: string | null;
  size?: number;
}

export function Avatar({ name, src, size = 32 }: AvatarProps) {
  const initials = (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  if (src) {
    return (
      <img
        src={src}
        alt={name || 'avatar'}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="rounded-full bg-accent/15 text-accent flex items-center justify-center font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials || <UserIcon size={size * 0.55} />}
    </div>
  );
}

// ── Badge ───────────────────────────────────────────────────
export function Badge({ children, tone = 'accent' }: { children: ReactNode; tone?: 'accent' | 'idle' | 'stopped' | 'steel' }) {
  const cls =
    tone === 'idle' ? 'bg-idle/10 text-idle'
    : tone === 'stopped' ? 'bg-stopped/10 text-stopped'
    : tone === 'steel' ? 'bg-steel/10 text-steel'
    : 'bg-accent/10 text-accent';
  return <span className={cn('pill', cls)}>{children}</span>;
}

// ── Spinner ─────────────────────────────────────────────────
export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-steel text-sm">
      <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      {label}…
    </div>
  );
}