// ============================================================
//  SIDEBAR  —  grouped nav, rendered from the current role
//  Responsive: fixed on desktop, slide-in drawer on mobile.
// ============================================================
import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Factory, Menu, X } from 'lucide-react';
import { useAuth } from '../context/auth';
import { NAV, ROLE_NAV } from '../config/nav';

const GROUP_ORDER = ['OVERVIEW', 'MONITORING', 'UTILITIES', 'MANAGEMENT'];

export default function Sidebar() {
  const { role } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false); // mobile drawer

  const keys = role ? ROLE_NAV[role] : [];
  const items = keys.map((k) => NAV[k]).filter(Boolean);
  const groups = GROUP_ORDER.map((g) => ({
    name: g,
    items: items.filter((i) => i.group === g),
  })).filter((g) => g.items.length > 0);

  // close the drawer whenever the route changes (mobile)
  useEffect(() => { setOpen(false); }, [location.pathname]);

  const nav = (
    <nav style={S.nav}>
      {groups.map((group) => (
        <div key={group.name} style={{ marginBottom: 18 }}>
          <div style={S.groupLabel}>{group.name}</div>
          {group.items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.key}
                to={`/${item.key}`}
                style={({ isActive }: { isActive: boolean }) => ({ ...S.link, ...(isActive ? S.linkActive : {}) })}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const brand = (
    <div style={S.brand}>
      <div style={S.logo}><Factory size={20} color="#fff" /></div>
      <div>
        <div style={S.brandName}>JCI SmartFactory</div>
        <div style={S.brandSub}>Production Monitor v3</div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger button (hidden on desktop via CSS class) */}
      <button className="sidebar-burger" onClick={() => setOpen(true)} aria-label="Open menu">
        <Menu size={22} />
      </button>

      {/* Desktop sidebar (hidden on mobile via CSS class) */}
      <aside className="sidebar-desktop" style={S.aside}>
        {brand}
        {nav}
      </aside>

      {/* Mobile drawer + overlay */}
      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}
      <aside className={`sidebar-drawer ${open ? 'is-open' : ''}`} style={S.drawer}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {brand}
          <button onClick={() => setOpen(false)} style={S.closeBtn} aria-label="Close menu"><X size={20} /></button>
        </div>
        {nav}
      </aside>
    </>
  );
}

const S: Record<string, React.CSSProperties> = {
  aside: {
    width: 'var(--sidebar-w)', minWidth: 'var(--sidebar-w)', height: '100vh',
    background: 'var(--surface)', borderRight: '1px solid var(--border)',
    position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto',
  },
  drawer: {
    width: 'var(--sidebar-w)', height: '100vh', background: 'var(--surface)',
    borderRight: '1px solid var(--border)', position: 'fixed', top: 0, left: 0,
    display: 'flex', flexDirection: 'column', overflowY: 'auto', zIndex: 60,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 12, padding: '20px 18px' },
  logo: { width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#3b5bfd,#6d83ff)', display: 'grid', placeItems: 'center' },
  brandName: { fontWeight: 800, fontSize: 15, color: 'var(--text)' },
  brandSub: { fontSize: 11, color: 'var(--text-faint)' },
  nav: { padding: '4px 12px 24px' },
  groupLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--text-faint)', padding: '0 10px 8px' },
  link: { display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px', borderRadius: 10, color: 'var(--text-muted)', fontSize: 14, fontWeight: 500, marginBottom: 2 },
  linkActive: { background: 'var(--brand-soft)', color: 'var(--brand)', fontWeight: 700 },
  closeBtn: { background: 'none', border: 'none', color: 'var(--text-muted)', padding: 18, cursor: 'pointer' },
};
