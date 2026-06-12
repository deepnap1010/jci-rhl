// ============================================================
//  USER MANAGEMENT  —  Super Admin only
//  Create login accounts (name, email, role, temporary password),
//  which emails the credentials to the user. Lists existing users
//  with enable/disable, reset-password and delete actions.
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { UserPlus, RefreshCw, Trash2, KeyRound, Shuffle, Clock, AlertTriangle, RotateCcw, X, History, SlidersHorizontal } from 'lucide-react';
import { api } from '../api/client';
import { inputStyle } from '../components/ui';
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '../config/nav';

// org chart (top→bottom): Super Admin → Production Head → Production Manager → Supervisor → Operator
// which roles may be the manager of a given role:
const MANAGER_ROLES: Record<string, Role[]> = {
  operator: ['supervisor'],
  supervisor: ['prodManager'],
  prodManager: ['plantHead'],
  plantHead: ['superAdmin'],
  employee: ['supervisor', 'prodManager'],
};
import UsersHistoryModal from './UsersHistory';
import type { Role } from '@shared/types';
import { DEPARTMENTS } from '@shared/types';
import { scopeOf } from '@shared/permissions';

interface UserRow {
  _id: string;
  name: string;
  email: string;
  role: Role;
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
  const [role, setRole] = useState<Role>('operator');
  const [managerId, setManagerId] = useState('');
  const [lines, setLines] = useState<string[]>([]); // assignedLines for a Production Manager
  const [machineIds, setMachineIds] = useState<string[]>([]); // assignedMachineIds for supervisor/operator
  const [machineOpts, setMachineOpts] = useState<string[]>([]);
  const [password, setPassword] = useState(genPassword());
  const scopeKind = scopeOf(role); // 'all' | 'lines' | 'machines' | 'own'
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
      setName(''); setEmail(''); setRole('operator'); setManagerId(''); setLines([]); setMachineIds([]); setPassword(genPassword());
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
    <div style={{ padding: '8px 28px 40px' }}>
      {/* ── Create user ───────────────────────────────────── */}
      <div className="card" style={{ padding: 20, marginBottom: 22 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 800, marginBottom: 16 }}>
          <UserPlus size={18} /> Create user
        </h3>
        <form onSubmit={createUser} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, alignItems: 'end' }}>
          <Field label="Full name">
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Operator" required />
          </Field>
          <Field label="Email">
            <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" required />
          </Field>
          <Field label="Role">
            <select style={inputStyle} value={role} onChange={(e) => { setRole(e.target.value as Role); setManagerId(''); setLines([]); setMachineIds([]); }}>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </Field>
          <Field label="Reports to (manager)">
            <select style={inputStyle} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">— none —</option>
              {rows
                .filter((u) => (MANAGER_ROLES[role] ?? []).includes(u.role))
                .map((u) => (
                  <option key={u._id} value={u._id}>{u.name} ({ROLE_LABELS[u.role] ?? u.role})</option>
                ))}
            </select>
          </Field>

          {/* scope: a Production Manager owns LINES; a Supervisor/Operator owns MACHINES */}
          {scopeKind === 'lines' && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={scopeLbl}>Assigned lines — this Production Manager sees only these departments</div>
              <ChipPicker options={[...DEPARTMENTS]} selected={lines} onToggle={(v) => setLines((t) => t.includes(v) ? t.filter((x) => x !== v) : [...t, v])} />
            </div>
          )}
          {(scopeKind === 'machines' || scopeKind === 'own') && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={scopeLbl}>Assigned machines — this {ROLE_LABELS[role]} sees only these machines</div>
              {machineOpts.length === 0
                ? <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>No machines available.</div>
                : <ChipPicker options={machineOpts} selected={machineIds} onToggle={(v) => setMachineIds((t) => t.includes(v) ? t.filter((x) => x !== v) : [...t, v])} />}
            </div>
          )}
          <Field label="Temporary password">
            <div style={{ display: 'flex', gap: 6 }}>
              <input style={{ ...inputStyle, flex: 1 }} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              <button type="button" onClick={() => setPassword(genPassword())} title="Generate" style={iconBtn}>
                <Shuffle size={16} />
              </button>
            </div>
          </Field>
          <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Creating…' : 'Create & email credentials'}
          </button>
        </form>
        {msg && (
          <div style={{ marginTop: 14, padding: '9px 12px', borderRadius: 8, fontSize: 13,
            background: msg.kind === 'ok' ? '#e7f6ec' : '#fdeaea', color: msg.kind === 'ok' ? '#15803d' : '#b91c1c' }}>
            {msg.text}
          </div>
        )}
      </div>

      {/* ── User list ─────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 800 }}>Login accounts ({rows.length})</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowHistory(true)} style={historyBtn} title="View deleted users history">
              <History size={15} /> Users History
            </button>
            <button onClick={load} style={iconBtn} title="Refresh"><RefreshCw size={16} /></button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: 12 }}>
                {['Name', 'Email', 'Role', 'Status', 'First login', 'Actions'].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>No users yet.</td></tr>
              ) : rows.map((u) => (
                <tr key={u._id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                  <td style={td}>
                    {u.role === 'superAdmin'
                      ? u.name
                      : <button onClick={() => setEditTarget(u)} style={linkBtn} title="Edit configuration">{u.name}</button>}
                  </td>
                  <td style={td}>{u.email}</td>
                  <td style={td}>{ROLE_LABELS[u.role] ?? u.role}</td>
                  <td style={td}>
                    {u.suspendedUntil ? (
                      <span style={{ ...badge, background: '#fee2e2', color: '#b91c1c' }}
                        title={`Temporarily deleted until ${new Date(u.suspendedUntil).toLocaleString()}`}>
                        Suspended · until {new Date(u.suspendedUntil).toLocaleDateString()}
                      </span>
                    ) : (
                      <span style={{ ...badge, background: u.isActive ? '#e7f6ec' : '#f3f4f6', color: u.isActive ? '#15803d' : '#6b7280' }}>
                        {u.isActive ? 'Active' : 'Disabled'}
                      </span>
                    )}
                  </td>
                  <td style={td}>
                    {u.mustChangePassword
                      ? <span style={{ ...badge, background: '#fef3c7', color: '#92400e' }}>Pending</span>
                      : <span style={{ color: '#9ca3af' }}>Done</span>}
                  </td>
                  <td style={td}>
                    {u.role !== 'superAdmin' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {u.suspendedUntil ? (
                          <button onClick={() => restore(u)} style={smallBtn} title="Restore now">
                            <RotateCcw size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} /> Restore
                          </button>
                        ) : (
                          <button onClick={() => toggleActive(u)} style={smallBtn}>{u.isActive ? 'Disable' : 'Enable'}</button>
                        )}
                        <button onClick={() => setEditTarget(u)} style={iconBtn} title="Edit configuration (role, manager, machines)"><SlidersHorizontal size={15} /></button>
                        <button onClick={() => resetPassword(u)} style={iconBtn} title="Reset password"><KeyRound size={15} /></button>
                        <button onClick={() => setDelTarget(u)} style={{ ...iconBtn, color: '#b91c1c' }} title="Delete"><Trash2 size={15} /></button>
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
    <div style={overlay} onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button onClick={onClose} style={closeX} aria-label="Close"><X size={18} /></button>

        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 2 }}>Delete user</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 18 }}>
          {user.name} · <span className="mono">{user.email}</span>
        </div>

        {/* STEP 1 — choose delete type */}
        {mode === 'choose' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <button style={choiceCard} onClick={() => setMode('temp')}>
              <div style={{ ...choiceIcon, background: '#fff7ed', color: '#c2410c' }}><Clock size={20} /></div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Temporary delete</div>
                <div style={{ fontSize: 12.5, color: '#6b7280' }}>Suspend access for a set time, then auto-restore.</div>
              </div>
            </button>
            <button style={choiceCard} onClick={() => setMode('perm')}>
              <div style={{ ...choiceIcon, background: '#fee2e2', color: '#b91c1c' }}><Trash2 size={20} /></div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Permanent delete</div>
                <div style={{ fontSize: 12.5, color: '#6b7280' }}>Remove the account for good. Cannot be undone.</div>
              </div>
            </button>
          </div>
        )}

        {/* STEP 2a — temporary delete options */}
        {mode === 'temp' && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
              How long should this account stay deleted?
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {PRESETS.map((p, i) => (
                <button key={p.label}
                  onClick={() => { setUseDate(false); setPresetIdx(i); }}
                  style={{ ...chip, ...(!useDate && presetIdx === i ? chipActive : {}) }}>
                  {p.label}
                </button>
              ))}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', marginBottom: 8, cursor: 'pointer' }}>
              <input type="radio" checked={useDate} onChange={() => setUseDate(true)} />
              Or pick a specific end date
            </label>
            <input
              type="date"
              min={tomorrow}
              value={customDate}
              onChange={(e) => { setCustomDate(e.target.value); setUseDate(true); }}
              style={{ ...inputStyle, width: '100%', opacity: useDate ? 1 : 0.6 }}
            />

            {until && (
              <div style={{ marginTop: 14, padding: '10px 12px', background: '#f0f9ff', color: '#075985', borderRadius: 8, fontSize: 13 }}>
                Account will be restored automatically on <b>{until.toLocaleString()}</b>.
              </div>
            )}
            <div style={{ marginTop: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280' }}>Reason (optional)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                placeholder="e.g. On leave for 3 months"
                style={{ ...inputStyle, width: '100%', marginTop: 6, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            {error && <div style={errBox}>{error}</div>}

            <div style={footRow}>
              <button onClick={() => { setMode('choose'); setError(''); }} style={ghostBtn} disabled={busy}>Back</button>
              <button onClick={confirmTemp} style={{ ...warnBtn, opacity: busy ? 0.7 : 1 }} disabled={busy}>
                {busy ? 'Applying…' : 'Confirm temporary delete'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2b — permanent delete confirmation (Yes / No) */}
        {mode === 'perm' && (
          <div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px', background: '#fef2f2', borderRadius: 10, marginBottom: 8 }}>
              <AlertTriangle size={22} color="#b91c1c" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13.5, color: '#7f1d1d', lineHeight: 1.5 }}>
                Are you sure you want to <b>permanently delete</b> {user.name}? This removes their login account
                entirely and <b>cannot be undone</b>.
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280' }}>Reason for removal (optional)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                placeholder="e.g. Left the company"
                style={{ ...inputStyle, width: '100%', marginTop: 6, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            {error && <div style={errBox}>{error}</div>}
            <div style={footRow}>
              <button onClick={() => { setMode('choose'); setError(''); }} style={ghostBtn} disabled={busy}>No, go back</button>
              <button onClick={confirmPerm} style={{ ...dangerBtn, opacity: busy ? 0.7 : 1 }} disabled={busy}>
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
function EditUserModal({ user, allUsers, machineOpts, onClose, onDone }: {
  user: UserRow; allUsers: UserRow[]; machineOpts: string[];
  onClose: () => void; onDone: (msg: string) => void;
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [managerId, setManagerId] = useState(user.managerId || '');
  const [lines, setLines] = useState<string[]>(user.assignedLines || []);
  const [machineIds, setMachineIds] = useState<string[]>(user.assignedMachineIds || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scopeKind = scopeOf(role); // 'all' | 'lines' | 'machines' | 'own'

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
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modalCard, maxWidth: 560 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button onClick={onClose} style={closeX} aria-label="Close"><X size={18} /></button>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 2 }}>Edit user</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 18 }}><span className="mono">{user.email}</span></div>

        <div style={{ display: 'grid', gap: 14 }}>
          <Field label="Full name">
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Role">
              <select style={inputStyle} value={role} onChange={(e) => { setRole(e.target.value as Role); setManagerId(''); setLines([]); setMachineIds([]); }}>
                {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </Field>
            <Field label="Reports to (manager)">
              <select style={inputStyle} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">— none —</option>
                {allUsers
                  .filter((u) => u._id !== user._id && (MANAGER_ROLES[role] ?? []).includes(u.role))
                  .map((u) => <option key={u._id} value={u._id}>{u.name} ({ROLE_LABELS[u.role] ?? u.role})</option>)}
              </select>
            </Field>
          </div>

          {scopeKind === 'all' && (
            <div style={{ fontSize: 12.5, color: '#6b7280', background: '#f6f7f9', borderRadius: 8, padding: '8px 10px' }}>
              {ROLE_LABELS[role]} sees the whole plant — no machine/line scoping needed.
            </div>
          )}
          {scopeKind === 'lines' && (
            <div>
              <div style={scopeLbl}>Assigned lines — this {ROLE_LABELS[role]} sees only these departments</div>
              <ChipPicker options={[...DEPARTMENTS]} selected={lines} onToggle={(v) => setLines((t) => t.includes(v) ? t.filter((x) => x !== v) : [...t, v])} />
            </div>
          )}
          {(scopeKind === 'machines' || scopeKind === 'own') && (
            <div>
              <div style={scopeLbl}>Assigned machines — this {ROLE_LABELS[role]} sees only these machines</div>
              {machineOpts.length === 0
                ? <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>No machines available.</div>
                : <ChipPicker options={machineOpts} selected={machineIds} onToggle={(v) => setMachineIds((t) => t.includes(v) ? t.filter((x) => x !== v) : [...t, v])} />}
            </div>
          )}

          {error && <div style={errBox}>{error}</div>}
          <div style={footRow}>
            <button onClick={onClose} style={ghostBtn} disabled={busy}>Cancel</button>
            <button onClick={save} style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// tiny local label wrapper (avoids importing from JobTracking)
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280' }}>{label}</span>
      {children}
    </label>
  );
}

// multi-select chips for lines / machines
function ChipPicker({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            type="button"
            key={o}
            onClick={() => onToggle(o)}
            style={{
              border: `1px solid ${on ? 'var(--brand)' : 'var(--border-strong)'}`,
              background: on ? 'var(--brand)' : 'var(--surface)',
              color: on ? '#fff' : 'var(--text-muted)',
              borderRadius: 99, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {on ? '✓ ' : ''}{o}
          </button>
        );
      })}
    </div>
  );
}

const scopeLbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 7 };
const th: React.CSSProperties = { padding: '10px 20px', fontWeight: 700 };
const td: React.CSSProperties = { padding: '12px 20px' };
const badge: React.CSSProperties = { padding: '3px 9px', borderRadius: 99, fontSize: 12, fontWeight: 700 };
const primaryBtn: React.CSSProperties = { background: 'var(--brand, #3b5bfd)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' };
const smallBtn: React.CSSProperties = { background: 'var(--surface-2, #f3f4f6)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'var(--text, #1f2937)' };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 700, color: 'var(--brand, #3b5bfd)', cursor: 'pointer', textAlign: 'left' };
const iconBtn: React.CSSProperties = { background: 'var(--surface-2, #f3f4f6)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '7px 9px', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'inherit' };
const historyBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface-2, #f3f4f6)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: 'var(--text, #1f2937)' };

// ---- delete modal styles ----
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20,
  background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
  animation: 'fadeUp .18s ease',
};
const modalCard: React.CSSProperties = {
  position: 'relative', width: '100%', maxWidth: 460, background: '#fff', borderRadius: 16,
  padding: '24px 24px 22px', boxShadow: '0 24px 60px rgba(0,0,0,.28)', border: '1px solid #eef0f4',
};
const closeX: React.CSSProperties = {
  position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', color: '#9ca3af',
  cursor: 'pointer', padding: 4, lineHeight: 0,
};
const choiceCard: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
  transition: 'border-color .15s, box-shadow .15s',
};
const choiceIcon: React.CSSProperties = { width: 42, height: 42, borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0 };
const chip: React.CSSProperties = {
  border: '1px solid #d1d5db', background: '#fff', borderRadius: 99, padding: '7px 14px',
  fontSize: 13, fontWeight: 700, color: '#374151', cursor: 'pointer',
};
const chipActive: React.CSSProperties = { background: 'var(--brand, #3b5bfd)', borderColor: 'var(--brand, #3b5bfd)', color: '#fff' };
const footRow: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 };
const ghostBtn: React.CSSProperties = { background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' };
const warnBtn: React.CSSProperties = { background: '#c2410c', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' };
const dangerBtn: React.CSSProperties = { background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' };
const errBox: React.CSSProperties = { marginTop: 12, padding: '9px 12px', background: '#fdeaea', color: '#b91c1c', borderRadius: 8, fontSize: 13 };
