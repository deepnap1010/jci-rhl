// ============================================================
//  USER MANAGEMENT  —  Super Admin only
//  Create login accounts (name, email, role, temporary password),
//  which emails the credentials to the user. Lists existing users
//  with enable/disable, reset-password and delete actions.
//  EKC re-skin — visual layer only, logic unchanged.
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { UserPlus, RefreshCw, Trash2, KeyRound, Shuffle, Clock, AlertTriangle, RotateCcw, X, History, SlidersHorizontal } from 'lucide-react';
import { api } from '../api/client';
import { cn } from '../lib/utils';
import { ROLE_LABELS } from '../config/nav';
import UsersHistoryModal from './UsersHistory';
import type { Role } from '@shared/types';
import { DEPARTMENTS } from '@shared/types';
import { scopeOf, type ScopeKind } from '@shared/permissions';

// the assignable roles are whatever the Super Admin created (fetched from /api/roles)
type RoleOption = { slug: string; name: string; scope: ScopeKind };

// org hierarchy by data-scope rank: a user may report only to someone with a BROADER scope.
const SCOPE_RANK: Record<string, number> = { own: 0, machines: 1, lines: 2, all: 3 };
const rankOfScope = (s: ScopeKind | undefined) => (s ? SCOPE_RANK[s] ?? 0 : 0);
const rankOfUser = (role: string) => (role === 'superAdmin' || role === 'admin' ? 4 : SCOPE_RANK[scopeOf(role as Role)] ?? 0);
const roleLabelOf = (u: { roleName?: string | null; role: string }) => u.roleName || ROLE_LABELS[u.role as Role] || u.role;

interface UserRow {
  _id: string;
  name: string;
  email: string;
  role: Role;
  roleSlug?: string | null;
  roleName?: string | null;
  assignedMachineIds: string[];
  assignedLines: string[];
  managerId: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  suspendedUntil: string | null; // ISO date while temporarily deleted
  lastLoginAt: string | null;
  createdAt: string | null;
}

// a readable random temp password
function genPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out + '@1';
}

export default function Users() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [role, setRole] = useState(''); // selected role slug (admin-created)
  const [managerId, setManagerId] = useState('');
  const [lines, setLines] = useState<string[]>([]); // assignedLines for a 'lines'-scoped role
  const [machineIds, setMachineIds] = useState<string[]>([]); // assignedMachineIds for machines/own
  const [machineOpts, setMachineOpts] = useState<string[]>([]);
  const [password, setPassword] = useState(genPassword());
  const scopeKind: ScopeKind | undefined = roleOptions.find((r) => r.slug === role)?.scope;
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState<UserRow | null>(null); // user being deleted (opens modal)
  const [editTarget, setEditTarget] = useState<UserRow | null>(null); // user being edited (opens modal)
  const [showHistory, setShowHistory] = useState(false); // Users History popup

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<UserRow[]>('/api/users');
      setRows(data);
    } catch (err: any) {
      setMsg({ kind: 'err', text: err?.response?.data?.error || 'Failed to load users' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // machine codes for the "assigned machines" picker (supervisors / operators)
  useEffect(() => {
    api.get<{ code: string }[]>('/api/machines')
      .then((r) => setMachineOpts(r.data.map((m) => m.code).sort()))
      .catch(() => {});
  }, []);

  // assignable roles = the roles the Super Admin created (non-system) in Roles & Permissions
  useEffect(() => {
    api.get<{ roles: { slug: string; name: string; isSystem?: boolean; scope?: ScopeKind }[] }>('/api/roles')
      .then((r) => {
        const opts = (r.data.roles || []).filter((x) => !x.isSystem).map((x) => ({ slug: x.slug, name: x.name, scope: (x.scope || 'machines') as ScopeKind }));
        setRoleOptions(opts);
        setRole((cur) => cur || opts[0]?.slug || '');
      })
      .catch(() => {});
  }, []);

  // auto-dismiss the status banner so a stale message never lingers
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 8000);
    return () => clearTimeout(t);
  }, [msg]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const { data } = await api.post('/api/users', {
        name, email, role, password,
        managerId: managerId || null,
        assignedLines: scopeKind === 'lines' ? lines : [],
        assignedMachineIds: scopeKind === 'machines' || scopeKind === 'own' ? machineIds : [],
      });
      setMsg({
        kind: 'ok',
        text: data.emailSent
          ? `User created — credentials emailed to ${email}.`
          : `User created. SMTP is off, so credentials were printed to the server console.`,
      });
      setName(''); setEmail(''); setRole(roleOptions[0]?.slug || ''); setManagerId(''); setLines([]); setMachineIds([]); setPassword(genPassword());
      load();
    } catch (err: any) {
      setMsg({ kind: 'err', text: err?.response?.data?.error || 'Failed to create user' });
    } finally {
      setBusy(false);
    }
  }

  // Enable/Disable ONLY changes the account status. It never resets the
  // password, generates a temp password, or re-triggers the first-login flow.
  async function toggleActive(u: UserRow) {
    const next = !u.isActive;
    await api.patch(`/api/users/${u._id}`, { isActive: next });
    setMsg({
      kind: 'ok',
      text: `${u.name} is now ${next ? 'Active' : 'Inactive'}. Their password and first-login status are unchanged.`,
    });
    load();
  }

  // Reset Password is a SEPARATE, deliberate action: it sets a new temporary
  // password and requires the user to set their own on next login.
  async function resetPassword(u: UserRow) {
    const pw = genPassword();
    if (!confirm(
      `Reset password for ${u.email}?\n\n` +
      `This is a separate action from Enable/Disable. It will set a new temporary ` +
      `password and ask the user to choose their own at next login.\n\n` +
      `New temporary password: ${pw}`
    )) return;
    const { data } = await api.post(`/api/users/${u._id}/reset-password`, { password: pw });
    setMsg({ kind: 'ok', text: data.emailSent ? `New temporary password emailed to ${u.email}.` : `Password reset — see server console (SMTP off). New password: ${pw}` });
    load(); // refresh so the "first login: Pending" status updates immediately
  }

  async function restore(u: UserRow) {
    await api.post(`/api/users/${u._id}/restore`);
    setMsg({ kind: 'ok', text: `${u.name} has been restored.` });
    load();
  }

  return (
    <div className="px-5 sm:px-7 pt-1 pb-10 space-y-4">
      {/* ── Create user ───────────────────────────────────── */}
      <div className="panel p-5">
        <h3 className="flex items-center gap-2 text-base font-extrabold text-primary mb-4">
          <UserPlus size={18} /> Create user
        </h3>
        <form onSubmit={createUser} className="grid [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))] gap-3.5 items-end">
          <Field label="Full name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Operator" required />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" required />
          </Field>
          <Field label="Role">
            {roleOptions.length === 0 ? (
              <div className="input flex items-center text-steel/70 text-[13px]">No roles yet — create one in Roles &amp; Permissions</div>
            ) : (
              <select className="input" value={role} onChange={(e) => { setRole(e.target.value); setManagerId(''); setLines([]); setMachineIds([]); }}>
                {roleOptions.map((r) => (
                  <option key={r.slug} value={r.slug}>{r.name}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Reports to (manager)">
            <select className="input" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">— none —</option>
              {rows
                .filter((u) => rankOfUser(u.role) > rankOfScope(scopeKind))
                .map((u) => (
                  <option key={u._id} value={u._id}>{u.name} ({roleLabelOf(u)})</option>
                ))}
            </select>
          </Field>

          {/* scope: a Production Manager owns LINES; a Supervisor/Operator owns MACHINES */}
          {scopeKind === 'lines' && (
            <div className="col-span-full">
              <div className={scopeLbl}>Assigned lines — this role sees only these departments</div>
              <ChipPicker options={[...DEPARTMENTS]} selected={lines} onToggle={(v) => setLines((t) => t.includes(v) ? t.filter((x) => x !== v) : [...t, v])} />
            </div>
          )}
          {(scopeKind === 'machines' || scopeKind === 'own') && (
            <div className="col-span-full">
              <div className={scopeLbl}>Assigned machines — this role sees only these machines</div>
              {machineOpts.length === 0
                ? <div className="text-xs text-steel/70">No machines available.</div>
                : <ChipPicker options={machineOpts} selected={machineIds} onToggle={(v) => setMachineIds((t) => t.includes(v) ? t.filter((x) => x !== v) : [...t, v])} />}
            </div>
          )}
          <Field label="Temporary password">
            <div className="flex gap-1.5">
              <input className="input flex-1" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              <button type="button" onClick={() => setPassword(genPassword())} title="Generate" className={iconBtn}>
                <Shuffle size={16} />
              </button>
            </div>
          </Field>
          <button type="submit" disabled={busy || !role} className={cn('bg-accent text-white rounded-lg px-4 py-2 text-sm font-semibold', (busy || !role) && 'opacity-70')}>
            {busy ? 'Creating…' : 'Create & email credentials'}
          </button>
        </form>
        {msg && (
          <div className={cn('mt-3.5 px-3 py-2.5 rounded-lg text-[13px]', msg.kind === 'ok' ? 'bg-running/10 text-running' : 'bg-stopped/10 text-stopped')}>
            {msg.text}
          </div>
        )}
      </div>

      {/* ── User list ─────────────────────────────────────── */}
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h3 className="text-base font-extrabold text-primary">Login accounts ({rows.length})</h3>
          <div className="flex gap-2">
            <button onClick={() => setShowHistory(true)} className={historyBtn} title="View deleted users history">
              <History size={15} /> Users History
            </button>
            <button onClick={load} className={iconBtn} title="Refresh"><RefreshCw size={16} /></button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                {['Name', 'Email', 'Role', 'Status', 'First login', 'Actions'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-6 text-steel">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-6 text-steel">No users yet.</td></tr>
              ) : rows.map((u) => (
                <tr key={u._id}>
                  <td>
                    {u.role === 'superAdmin'
                      ? u.name
                      : <button onClick={() => setEditTarget(u)} className="bg-transparent border-none p-0 font-bold text-accent cursor-pointer text-left hover:underline" title="Edit configuration">{u.name}</button>}
                  </td>
                  <td>{u.email}</td>
                  <td>{roleLabelOf(u)}</td>
                  <td>
                    {u.suspendedUntil ? (
                      <span className="pill bg-stopped/10 text-stopped whitespace-nowrap"
                        title={`Temporarily deleted until ${new Date(u.suspendedUntil).toLocaleString()}`}>
                        Suspended · until {new Date(u.suspendedUntil).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className={cn('pill', u.isActive ? 'bg-running/10 text-running' : 'bg-steel/10 text-steel')}>
                        {u.isActive ? 'Active' : 'Disabled'}
                      </span>
                    )}
                  </td>
                  <td>
                    {u.mustChangePassword
                      ? <span className="pill bg-idle/10 text-idle">Pending</span>
                      : <span className="text-steel">Done</span>}
                  </td>
                  <td>
                    {u.role !== 'superAdmin' && (
                      <div className="flex gap-1.5">
                        {u.suspendedUntil ? (
                          <button onClick={() => restore(u)} className={smallBtn} title="Restore now">
                            <RotateCcw size={13} className="mr-1 -mb-0.5 inline" /> Restore
                          </button>
                        ) : (
                          <button onClick={() => toggleActive(u)} className={smallBtn}>{u.isActive ? 'Disable' : 'Enable'}</button>
                        )}
                        <button onClick={() => setEditTarget(u)} className={iconBtn} title="Edit configuration (role, manager, machines)"><SlidersHorizontal size={15} /></button>
                        <button onClick={() => resetPassword(u)} className={iconBtn} title="Reset password"><KeyRound size={15} /></button>
                        <button onClick={() => setDelTarget(u)} className={cn(iconBtn, 'text-stopped')} title="Delete"><Trash2 size={15} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editTarget && (
        <EditUserModal
          user={editTarget}
          allUsers={rows}
          machineOpts={machineOpts}
          roleOptions={roleOptions}
          onClose={() => setEditTarget(null)}
          onDone={(text) => { setEditTarget(null); setMsg({ kind: 'ok', text }); load(); }}
        />
      )}

      {delTarget && (
        <DeleteUserModal
          user={delTarget}
          onClose={() => setDelTarget(null)}
          onDone={(text) => { setDelTarget(null); setMsg({ kind: 'ok', text }); load(); }}
        />
      )}

      {showHistory && <UsersHistoryModal onClose={() => setShowHistory(false)} />}
    </div>
  );
}

// ============================================================
//  DELETE MODAL  —  Temporary vs Permanent delete
//  Blurred + dimmed backdrop, two-step flow.
// ============================================================
const PRESETS: { label: string; kind: 'days' | 'months'; n: number }[] = [
  { label: '7 days', kind: 'days', n: 7 },
  { label: '1 month', kind: 'months', n: 1 },
  { label: '3 months', kind: 'months', n: 3 },
  { label: '6 months', kind: 'months', n: 6 },
];

function computeUntil(kind: 'days' | 'months', n: number): Date {
  const d = new Date();
  if (kind === 'days') d.setDate(d.getDate() + n);
  else d.setMonth(d.getMonth() + n);
  return d;
}

function DeleteUserModal({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: (msg: string) => void }) {
  const [mode, setMode] = useState<'choose' | 'temp' | 'perm'>('choose');
  const [useDate, setUseDate] = useState(false); // false → preset, true → specific end date
  const [presetIdx, setPresetIdx] = useState(1); // default 1 month
  const [customDate, setCustomDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // minimum selectable date = tomorrow
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();

  function resolveUntil(): Date | null {
    if (useDate) {
      if (!customDate) return null;
      return new Date(customDate + 'T23:59:59'); // end of the chosen day
    }
    const p = PRESETS[presetIdx];
    return computeUntil(p.kind, p.n);
  }

  const until = resolveUntil();

  async function confirmTemp() {
    if (!until || until <= new Date()) { setError('Please choose a valid future date.'); return; }
    setBusy(true); setError('');
    try {
      await api.post(`/api/users/${user._id}/suspend`, { until: until.toISOString(), reason });
      onDone(`${user.name} temporarily deleted until ${until.toLocaleString()}. The account will be restored automatically.`);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to apply temporary delete.');
      setBusy(false);
    }
  }

  async function confirmPerm() {
    setBusy(true); setError('');
    try {
      await api.delete(`/api/users/${user._id}`, { data: { reason } });
      onDone(`${user.name} has been permanently deleted.`);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to delete user.');
      setBusy(false);
    }
  }

  return (
    <div className={overlay} onClick={onClose}>
      <div className="panel relative w-full max-w-[460px] p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button onClick={onClose} className={closeX} aria-label="Close"><X size={18} /></button>

        <div className="text-lg font-extrabold text-primary mb-0.5">Delete user</div>
        <div className="text-[13px] text-steel mb-4.5">
          {user.name} · <span className="mono">{user.email}</span>
        </div>

        {/* STEP 1 — choose delete type */}
        {mode === 'choose' && (
          <div className="grid gap-3">
            <button className={choiceCard} onClick={() => setMode('temp')}>
              <div className={cn(choiceIcon, 'bg-idle/10 text-idle')}><Clock size={20} /></div>
              <div className="text-left">
                <div className="font-bold text-[15px] text-primary">Temporary delete</div>
                <div className="text-[12.5px] text-steel">Suspend access for a set time, then auto-restore.</div>
              </div>
            </button>
            <button className={choiceCard} onClick={() => setMode('perm')}>
              <div className={cn(choiceIcon, 'bg-stopped/10 text-stopped')}><Trash2 size={20} /></div>
              <div className="text-left">
                <div className="font-bold text-[15px] text-primary">Permanent delete</div>
                <div className="text-[12.5px] text-steel">Remove the account for good. Cannot be undone.</div>
              </div>
            </button>
          </div>
        )}

        {/* STEP 2a — temporary delete options */}
        {mode === 'temp' && (
          <div>
            <div className="text-[13px] font-bold text-primary mb-2.5">
              How long should this account stay deleted?
            </div>

            <div className="flex gap-2 flex-wrap mb-3.5">
              {PRESETS.map((p, i) => (
                <button key={p.label}
                  onClick={() => { setUseDate(false); setPresetIdx(i); }}
                  className={cn(chip, !useDate && presetIdx === i && chipActive)}>
                  {p.label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-[13px] text-primary mb-2 cursor-pointer">
              <input type="radio" checked={useDate} onChange={() => setUseDate(true)} />
              Or pick a specific end date
            </label>
            <input
              type="date"
              min={tomorrow}
              value={customDate}
              onChange={(e) => { setCustomDate(e.target.value); setUseDate(true); }}
              className={cn('input', !useDate && 'opacity-60')}
            />

            {until && (
              <div className="mt-3.5 px-3 py-2.5 bg-accent/10 text-accent rounded-lg text-[13px]">
                Account will be restored automatically on <b>{until.toLocaleString()}</b>.
              </div>
            )}
            <div className="mt-3.5">
              <span className="text-xs font-bold text-steel">Reason (optional)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                placeholder="e.g. On leave for 3 months"
                className="input mt-1.5 resize-y font-sans" />
            </div>

            {error && <div className={errBox}>{error}</div>}

            <div className={footRow}>
              <button onClick={() => { setMode('choose'); setError(''); }} className={ghostBtn} disabled={busy}>Back</button>
              <button onClick={confirmTemp} className={cn(warnBtn, busy && 'opacity-70')} disabled={busy}>
                {busy ? 'Applying…' : 'Confirm temporary delete'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2b — permanent delete confirmation (Yes / No) */}
        {mode === 'perm' && (
          <div>
            <div className="flex gap-3 items-start px-4 py-3.5 bg-stopped/10 rounded-card mb-2">
              <AlertTriangle size={22} className="text-stopped shrink-0 mt-px" />
              <div className="text-[13.5px] text-stopped leading-normal">
                Are you sure you want to <b>permanently delete</b> {user.name}? This removes their login account
                entirely and <b>cannot be undone</b>.
              </div>
            </div>

            <div className="mt-3.5">
              <span className="text-xs font-bold text-steel">Reason for removal (optional)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                placeholder="e.g. Left the company"
                className="input mt-1.5 resize-y font-sans" />
            </div>

            {error && <div className={errBox}>{error}</div>}
            <div className={footRow}>
              <button onClick={() => { setMode('choose'); setError(''); }} className={ghostBtn} disabled={busy}>No, go back</button>
              <button onClick={confirmPerm} className={cn(dangerBtn, busy && 'opacity-70')} disabled={busy}>
                {busy ? 'Deleting…' : 'Yes, delete permanently'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
//  EDIT MODAL  —  change role, manager and scope (machines/lines)
//  Reuses the same scope rules as the create form; saves via PATCH.
// ============================================================
function EditUserModal({ user, allUsers, machineOpts, roleOptions, onClose, onDone }: {
  user: UserRow; allUsers: UserRow[]; machineOpts: string[]; roleOptions: RoleOption[];
  onClose: () => void; onDone: (msg: string) => void;
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.roleSlug || user.role); // current role slug
  const [managerId, setManagerId] = useState(user.managerId || '');
  const [lines, setLines] = useState<string[]>(user.assignedLines || []);
  const [machineIds, setMachineIds] = useState<string[]>(user.assignedMachineIds || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scopeKind: ScopeKind | undefined = roleOptions.find((r) => r.slug === role)?.scope ?? scopeOf(user.role);

  async function save() {
    if (!name.trim()) { setError('Name is required.'); return; }
    setBusy(true); setError('');
    try {
      await api.patch(`/api/users/${user._id}`, {
        name: name.trim(),
        role,
        managerId: managerId || null,
        assignedLines: scopeKind === 'lines' ? lines : [],
        assignedMachineIds: scopeKind === 'machines' || scopeKind === 'own' ? machineIds : [],
      });
      onDone(`${name.trim()}'s configuration was updated.`);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to update user.');
      setBusy(false);
    }
  }

  return (
    <div className={overlay} onClick={onClose}>
      <div className="panel relative w-full max-w-[560px] p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button onClick={onClose} className={closeX} aria-label="Close"><X size={18} /></button>
        <div className="text-lg font-extrabold text-primary mb-0.5">Edit user</div>
        <div className="text-[13px] text-steel mb-4.5"><span className="mono">{user.email}</span></div>

        <div className="grid gap-3.5">
          <Field label="Full name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Role">
              <select className="input" value={role} onChange={(e) => { setRole(e.target.value); setManagerId(''); setLines([]); setMachineIds([]); }}>
                {roleOptions.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
                {!roleOptions.some((r) => r.slug === role) && <option value={role}>{user.roleName || ROLE_LABELS[user.role] || role}</option>}
              </select>
            </Field>
            <Field label="Reports to (manager)">
              <select className="input" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">— none —</option>
                {allUsers
                  .filter((u) => u._id !== user._id && rankOfUser(u.role) > rankOfScope(scopeKind))
                  .map((u) => <option key={u._id} value={u._id}>{u.name} ({roleLabelOf(u)})</option>)}
              </select>
            </Field>
          </div>

          {scopeKind === 'all' && (
            <div className="text-[12.5px] text-steel bg-raised rounded-lg px-2.5 py-2">
              This role sees the whole plant — no machine/line scoping needed.
            </div>
          )}
          {scopeKind === 'lines' && (
            <div>
              <div className={scopeLbl}>Assigned lines — this role sees only these departments</div>
              <ChipPicker options={[...DEPARTMENTS]} selected={lines} onToggle={(v) => setLines((t) => t.includes(v) ? t.filter((x) => x !== v) : [...t, v])} />
            </div>
          )}
          {(scopeKind === 'machines' || scopeKind === 'own') && (
            <div>
              <div className={scopeLbl}>Assigned machines — this role sees only these machines</div>
              {machineOpts.length === 0
                ? <div className="text-xs text-steel/70">No machines available.</div>
                : <ChipPicker options={machineOpts} selected={machineIds} onToggle={(v) => setMachineIds((t) => t.includes(v) ? t.filter((x) => x !== v) : [...t, v])} />}
            </div>
          )}

          {error && <div className={errBox}>{error}</div>}
          <div className={footRow}>
            <button onClick={onClose} className={ghostBtn} disabled={busy}>Cancel</button>
            <button onClick={save} className={cn(primaryBtn, busy && 'opacity-70')} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// tiny local label wrapper (avoids importing from JobTracking)
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold text-steel">{label}</span>
      {children}
    </label>
  );
}

// multi-select chips for lines / machines
function ChipPicker({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            type="button"
            key={o}
            onClick={() => onToggle(o)}
            className={cn(
              'pill cursor-pointer font-bold transition-colors',
              on ? 'bg-accent text-white' : 'bg-surface border border-line text-steel hover:border-accent/40',
            )}
          >
            {on ? '✓ ' : ''}{o}
          </button>
        );
      })}
    </div>
  );
}

// ---- shared EKC class strings ----
const scopeLbl = 'text-xs font-bold text-steel mb-1.5';
const primaryBtn = 'bg-accent text-white rounded-lg px-4 py-2 text-sm font-semibold';
const smallBtn = 'bg-surface border border-line rounded-lg px-3 py-1.5 text-xs font-semibold text-primary hover:border-accent/40 transition-colors';
const iconBtn = 'bg-surface border border-line rounded-lg p-2 grid place-items-center text-steel hover:text-primary transition-colors';
const historyBtn = 'inline-flex items-center gap-1.5 bg-surface border border-line rounded-lg px-3 py-2 text-sm font-semibold text-primary hover:border-accent/40 transition-colors';

// ---- modal class strings ----
const overlay = 'fixed inset-0 z-[1000] grid place-items-center p-5 bg-[rgba(15,23,42,.55)] backdrop-blur-sm';
const closeX = 'absolute top-3.5 right-3.5 bg-transparent border-none text-steel hover:text-primary cursor-pointer p-1 leading-none transition-colors';
const choiceCard = 'flex items-center gap-3.5 w-full text-left bg-base border border-line rounded-card px-4 py-3.5 cursor-pointer hover:border-accent/40 transition-colors';
const choiceIcon = 'w-[42px] h-[42px] rounded-card grid place-items-center shrink-0';
const chip = 'bg-surface border border-line rounded-full px-3.5 py-1.5 text-[13px] font-bold text-steel cursor-pointer transition-colors';
const chipActive = 'bg-accent border-accent text-white';
const footRow = 'flex justify-end gap-2.5 mt-5';
const ghostBtn = 'bg-surface border border-line rounded-lg px-4 py-2 text-sm font-semibold text-primary';
const warnBtn = 'bg-idle text-white rounded-lg px-4 py-2 text-sm font-semibold';
const dangerBtn = 'bg-stopped text-white rounded-lg px-4 py-2 text-sm font-semibold';
const errBox = 'mt-3 px-3 py-2.5 bg-stopped/10 text-stopped rounded-lg text-[13px]';
