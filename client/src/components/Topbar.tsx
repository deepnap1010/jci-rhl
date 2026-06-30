// client/src/components/Topbar.tsx
// ============================================================
//  TOPBAR  —  EKC PageHeader concept: page title + subtitle,
//             live/stale indicator, clock, and health alerts.
//  The logged-in user + Sign out live in the sidebar footer
//  (EKC keeps them there), so they're intentionally not here.
//  Visual layer = EKC theme (Tailwind tokens, light/dark aware).
// ============================================================
import { useEffect, useState } from 'react';
import { useMachines, liveSummary, fmtLastSeen, fmtAgo } from '../hooks/useData';
import { LiveDot } from './ekc-ui';
import NotificationBell from './NotificationBell';

export default function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const { machines } = useMachines();
  const { live, lastUpdated } = liveSummary(machines);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-surface/95 backdrop-blur border-b border-line shadow-sm px-5 sm:px-7 h-[76px]">
      <div className="min-w-0">
        <h1 className="text-lg sm:text-xl font-semibold text-primary truncate">{title}</h1>
        {subtitle && <p className="text-xs text-steel mt-0.5 truncate">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        {live ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-running whitespace-nowrap">
            <LiveDot active /> Live
          </span>
        ) : (
          <span title={`Last updated ${fmtLastSeen(lastUpdated)}`} className="inline-flex items-center gap-1.5 bg-idle/10 text-idle rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap cursor-default">
            <span className="w-2 h-2 rounded-full bg-idle" /> {fmtAgo(lastUpdated)}
          </span>
        )}

        <div className="data text-[13px] text-steel min-w-[92px] text-right hidden sm:block">
          {now.toLocaleTimeString('en-US', { hour12: true })}
        </div>

        {/* role-scoped health alerts */}
        <NotificationBell />
      </div>
    </header>
  );
}
