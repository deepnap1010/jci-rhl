// client/src/components/Sidebar.tsx
// ============================================================
//  SIDEBAR  —  EKC-style, Tailwind. Sectioned nav driven by the
//  current role + the existing NAV/ROLE_NAV config (unchanged).
//  Desktop: sticky full-height column. Mobile: slide-in drawer.
// ============================================================
import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Menu, X, LogOut } from 'lucide-react';
import { useAuth } from '../context/auth';
import { NAV, ROLE_NAV, ROLE_LABELS } from '../config/nav';
import { Avatar } from './ekc-ui';
import { Logo } from './Logo';
import { cn } from '../lib/utils';

const GROUP_ORDER = ['OVERVIEW', 'MONITORING', 'UTILITIES', 'MANAGEMENT', 'SYSTEM'];

export default function Sidebar() {
  const { role, user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false); // mobile drawer

  const keys = role ? ROLE_NAV[role] : [];
  const items = keys.map((k) => NAV[k]).filter(Boolean);
  const groups = GROUP_ORDER.map((g) => ({
    name: g,
    items: items.filter((i) => i.group === g),
  })).filter((g) => g.items.length > 0);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  const content = (
    <>
      <div className="px-5 h-[76px] flex items-center gap-2.5 border-b border-line shrink-0">
        <Logo className="min-w-0" />
        <button
          onClick={() => setOpen(false)}
          className="lg:hidden text-steel hover:text-primary p-1 -mr-1 shrink-0"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {groups.map((group) => (
          <div key={group.name}>
            <div className="label px-2 mb-1.5">{group.name}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.key}
                    to={`/${item.key}`}
                    className={({ isActive }: { isActive: boolean }) =>
                      cn(
                        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
                        isActive
                          ? 'bg-accent/10 text-accent font-medium'
                          : 'text-steel hover:text-primary hover:bg-line/60'
                      )
                    }
                  >
                    <Icon size={17} className="shrink-0" />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 px-1.5 mb-2">
          <Avatar name={user?.name} size={32} />
          <div className="min-w-0">
            <div className="text-xs font-medium text-primary truncate">{user?.name || ''}</div>
            <div className="text-[10px] text-steel truncate">{user?.roleName || (role ? ROLE_LABELS[role] : '')}</div>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-steel hover:text-stopped hover:bg-stopped/10 transition-colors"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </>
  );

  return (
    <>
      <button
        className="lg:hidden fixed top-3 left-3 z-30 w-10 h-10 rounded-lg bg-surface border border-line flex items-center justify-center text-primary shadow-panel"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu size={22} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-primary/40 backdrop-blur-[1px] lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-surface border-r border-line flex flex-col shadow-sm',
          'transform transition-transform duration-200 ease-out',
          'lg:sticky lg:top-0 lg:h-screen lg:self-start lg:z-auto lg:w-60 lg:shrink-0 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {content}
      </aside>
    </>
  );
}