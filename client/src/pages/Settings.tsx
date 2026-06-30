// ============================================================
//  SETTINGS  —  EKC-style sectioned console.
//  Honest, real controls only: profile (live account), change
//  password (auth backend), theme (light/dark, instant), and
//  device notification prefs (localStorage). No faked DB writes.
// ============================================================
import { useState, type ReactNode, type ComponentType } from 'react';
import { User as UserIcon, Palette, Bell, Info, KeyRound, Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/auth';
import { useTheme, type Theme } from '../lib/theme';
import { useToast } from '../components/Toast';
import { Avatar } from '../components/ekc-ui';
import { ROLE_LABELS } from '../config/nav';
import { cn } from '../lib/utils';

type IconType = ComponentType<{ size?: number; className?: string }>;
type SectionId = 'profile' | 'appearance' | 'notifications' | 'about';
const APP_VERSION = '1.0.0';

const SECTIONS: { id: SectionId; label: string; icon: IconType }[] = [
  { id: 'profile', label: 'Profile & Account', icon: UserIcon },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'about', label: 'About', icon: Info },
];

export default function Settings() {
  const [section, setSection] = useState<SectionId>('profile');
  return (
    <div className="px-5 sm:px-7 pt-1 pb-10 grid lg:grid-cols-[220px_1fr] gap-5">
      {/* section nav — vertical on desktop, horizontal scroller on mobile */}
      <nav className="panel p-2 h-fit lg:sticky lg:top-[88px] flex lg:flex-col gap-1 overflow-x-auto">
        {SECTIONS.map((sec) => {
          const active = section === sec.id;
          return (
            <button key={sec.id} onClick={() => setSection(sec.id)}
              className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors shrink-0', active ? 'bg-accent/10 text-accent font-medium' : 'text-steel hover:text-primary hover:bg-line/50')}>
              <sec.icon size={16} className="shrink-0" /> {sec.label}
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 space-y-5">
        {section === 'profile' && <ProfileSection />}
        {section === 'appearance' && <AppearanceSection />}
        {section === 'notifications' && <NotificationsSection />}
        {section === 'about' && <AboutSection />}
      </div>
    </div>
  );
}

// ── reusable building blocks (EKC style) ────────────────────
function Section({ title, desc, icon: Icon, children }: { title: string; desc?: string; icon?: IconType; children: ReactNode }) {
  return (
    <div className="panel p-5">
      <div className="flex items-start gap-3 mb-4">
        {Icon && <span className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0"><Icon size={16} className="text-accent" /></span>}
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-sm text-primary">{title}</h2>
          {desc && <p className="text-xs text-steel mt-0.5">{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 py-2.5 border-b border-line last:border-0">
      <div className="sm:w-1/2 min-w-0">
        <div className="text-sm text-primary font-medium">{label}</div>
        {hint && <div className="text-xs text-steel mt-0.5">{hint}</div>}
      </div>
      <div className="sm:w-1/2 sm:flex sm:justify-end">{children}</div>
    </div>
  );
}

function ToggleSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={cn('relative w-10 h-6 rounded-full transition-colors shrink-0', on ? 'bg-accent' : 'bg-line')}>
      <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', on && 'translate-x-4')} />
    </button>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: IconType }[] }) {
  return (
    <div className="inline-flex bg-base border border-line rounded-lg p-0.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors', active ? 'bg-surface text-accent shadow-sm' : 'text-steel hover:text-primary')}>
            {o.icon && <o.icon size={14} />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-line/60 last:border-0">
      <span className="label">{label}</span>
      <span className="text-sm text-primary font-medium truncate text-right">{value}</span>
    </div>
  );
}

// localStorage-backed boolean preference
function useLocalToggle(key: string, def: boolean): [boolean, (v: boolean) => void] {
  const [val, setVal] = useState<boolean>(() => { const s = localStorage.getItem(key); return s === null ? def : s === '1'; });
  const set = (v: boolean) => { localStorage.setItem(key, v ? '1' : '0'); setVal(v); };
  return [val, set];
}

// ── Profile & account ──────────────────────────────────────
function ProfileSection() {
  const { user, role } = useAuth();
  return (
    <>
      <Section title="My profile" desc="Your account — created and managed by an administrator." icon={UserIcon}>
        <div className="flex items-center gap-4">
          <Avatar name={user?.name} size={56} />
          <div className="min-w-0 grid sm:grid-cols-2 gap-x-8 gap-y-0.5 flex-1">
            <InfoRow label="Name" value={user?.name || '—'} />
            <InfoRow label="Email" value={user?.email || '—'} />
            <InfoRow label="Role" value={role ? ROLE_LABELS[role] : '—'} />
            <InfoRow label="Status" value={user?.isActive === false ? 'Disabled' : 'Active'} />
          </div>
        </div>
      </Section>
      <ChangePasswordSection />
    </>
  );
}

function ChangePasswordSection() {
  const { changePassword } = useAuth();
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) { toast.error('New password must be at least 8 characters'); return; }
    if (next !== confirm) { toast.error('New passwords do not match'); return; }
    setBusy(true);
    try {
      await changePassword(cur, next);
      toast.success('Password changed');
      setCur(''); setNext(''); setConfirm('');
    } catch (err) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not change password — check your current password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Change password" desc="Update your sign-in password." icon={KeyRound}>
      <form onSubmit={submit} className="max-w-sm space-y-3">
        <div><div className="label mb-1.5">Current password</div><input type="password" className="input" value={cur} onChange={(e) => setCur(e.target.value)} required /></div>
        <div>
          <div className="label mb-1.5">New password</div>
          <input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} required />
          <div className="text-[11px] text-steel mt-1">At least 8 characters.</div>
        </div>
        <div><div className="label mb-1.5">Confirm new password</div><input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></div>
        <button type="submit" disabled={busy} className="bg-accent text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60">{busy ? 'Saving…' : 'Change password'}</button>
      </form>
    </Section>
  );
}

// ── Appearance ─────────────────────────────────────────────
function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <Section title="Appearance" desc="Theme applies instantly across the whole app and is saved on this device." icon={Palette}>
      <Row label="Theme" hint="Light or dark interface">
        <Segmented<Theme> value={theme} onChange={setTheme} options={[{ value: 'light', label: 'Light', icon: Sun }, { value: 'dark', label: 'Dark', icon: Moon }]} />
      </Row>
    </Section>
  );
}

// ── Notifications (device preferences) ──────────────────────
function NotificationsSection() {
  const [inApp, setInApp] = useLocalToggle('jci_notif_inapp', true);
  const [sound, setSound] = useLocalToggle('jci_notif_sound', false);
  const [desktop, setDesktop] = useLocalToggle('jci_notif_desktop', false);
  return (
    <Section title="Notifications" desc="How you're alerted in this browser. Saved on this device." icon={Bell}>
      <Row label="In-app toasts" hint="Pop-up messages for actions & alerts"><ToggleSwitch on={inApp} onChange={setInApp} /></Row>
      <Row label="Sound on alert"><ToggleSwitch on={sound} onChange={setSound} /></Row>
      <Row label="Desktop notifications" hint="Browser alerts when this tab is in the background"><ToggleSwitch on={desktop} onChange={setDesktop} /></Row>
      <div className="flex items-start gap-2 text-xs text-steel bg-base border border-line rounded-lg px-3 py-2 mt-3">
        <Info size={13} className="shrink-0 mt-0.5 text-accent" />
        <span>These preferences are stored on this device. Email / SMS delivery is handled by the server's notification service.</span>
      </div>
    </Section>
  );
}

// ── About ──────────────────────────────────────────────────
function AboutSection() {
  return (
    <Section title="About" icon={Info}>
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
        <InfoRow label="Application" value="Jain Cord — Production Monitor" />
        <InfoRow label="Version" value={APP_VERSION} />
        <InfoRow label="Theme storage" value="Local (this device)" />
        <InfoRow label="Account" value="Managed by Super Admin" />
      </div>
    </Section>
  );
}
