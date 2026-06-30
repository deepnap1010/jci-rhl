// ============================================================
//  ROLES & PERMISSIONS  —  dynamic RBAC matrix
//  Left: role list. Right: module x action checkbox grid.
//  System roles are read-only. Optimized with local edit state
//  so toggling checkboxes never refetches; one save writes all.
//  EKC re-skin — visual layer only, logic unchanged.
// ============================================================
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Save, Lock, Check, Trash2 } from 'lucide-react';
import { useRoles } from '../hooks/useData';
import { Modal, Field } from './JobTracking';
import { useToast } from '../components/Toast';
import { cn } from '../lib/utils';
import { api } from '../api/client';
import type { ScopeKind } from '@shared/permissions';

// access levels the admin picks per role — each maps to the proven data-scoping rules
const ACCESS_LEVELS: { value: ScopeKind; label: string }[] = [
  { value: 'all', label: 'Plant-wide — sees everything' },
  { value: 'lines', label: 'Department lines — only assigned departments' },
  { value: 'machines', label: 'Specific machines — only assigned machines' },
  { value: 'own', label: 'Own machines only' },
];

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', machines: 'Machines', jobs: 'Jobs', downtime: 'Downtime',
  history: 'History', operatorMap: 'Operator Map', roles: 'Roles & Permissions',
  aiQuery: 'AI Query',
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function Roles() {
  const { data, reload } = useRoles();
  const toast = useToast();
  const { roles, modules, actions } = data;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [scopeDraft, setScopeDraft] = useState<string>('machines'); // editable access level
  const [dirty, setDirty] = useState(false);   // true once admin changes a checkbox
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  // pick first role once data arrives
  useEffect(() => {
    if (!selectedId && roles.length) setSelectedId(roles[0]._id);
  }, [roles, selectedId]);

  const selected = useMemo(() => roles.find((r) => r._id === selectedId) || null, [roles, selectedId]);

  // Load permissions into the editable draft ONLY when the selected role CHANGES
  // (keyed on selectedId, not the object). This prevents a background refetch from
  // overwriting unsaved edits. We also skip the load if the admin has unsaved changes.
  useEffect(() => {
    const r = roles.find((x) => x._id === selectedId);
    if (r && !dirty) { setDraft(JSON.parse(JSON.stringify(r.permissions || {}))); setScopeDraft(r.scope || 'machines'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const has = useCallback((mod: string, act: string) => (draft[mod] || []).includes(act), [draft]);

  const toggle = useCallback((mod: string, act: string) => {
    if (selected?.isSystem) return; // locked
    setDirty(true);                 // admin made a change → protect the draft
    setDraft((prev) => {
      const cur = new Set(prev[mod] || []);
      cur.has(act) ? cur.delete(act) : cur.add(act);
      return { ...prev, [mod]: [...cur] };
    });
  }, [selected]);

  // switching roles: if there are unsaved edits, confirm before discarding
  function selectRole(id: string) {
    if (id === selectedId) return;
    if (dirty && !window.confirm('You have unsaved permission changes. Discard them?')) return;
    setDirty(false);
    setSelectedId(id);
    const r = roles.find((x) => x._id === id);
    if (r) { setDraft(JSON.parse(JSON.stringify(r.permissions || {}))); setScopeDraft(r.scope || 'machines'); }
  }

  async function savePermissions() {
    if (!selected || selected.isSystem) return;
    setSaving(true);
    try {
      await api.patch(`/api/roles/${selected._id}`, { permissions: draft, scope: scopeDraft });
      setDirty(false);
      await reload();
      toast.success(`Permissions saved for ${selected.name}`);
    }
    catch { toast.error('Failed to save permissions'); }
    finally { setSaving(false); }
  }

  async function deleteRole() {
    if (!selected || selected.isSystem) return;
    if (!window.confirm(`Delete the role "${selected.name}"?\n\nThis cannot be undone. Any users currently on this role keep their access until you reassign them.`)) return;
    try {
      await api.delete(`/api/roles/${selected._id}`);
      setSelectedId(null);
      setDirty(false);
      await reload();
      toast.success(`Role "${selected.name}" deleted`);
    } catch {
      toast.error('Failed to delete role');
    }
  }

  return (
    <div className="px-5 sm:px-7 pt-1 pb-10 space-y-4">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h2 className="text-[22px] font-extrabold text-primary m-0">Roles &amp; Permissions</h2>
          <p className="text-[13px] text-steel mt-0.5 mb-0">Dynamic RBAC: pick modules and actions per role.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 bg-accent text-white rounded-lg px-4 py-2 text-sm font-semibold">
          <Plus size={16} /> New role
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">
        {/* role list */}
        <div className="panel p-2">
          {roles.map((r) => {
            const active = r._id === selectedId;
            return (
              <button
                key={r._id}
                onClick={() => selectRole(r._id)}
                className={cn(
                  'w-full text-left rounded-lg px-3 py-2.5 mb-1 cursor-pointer flex justify-between items-center transition-colors',
                  active ? 'bg-accent/10' : 'hover:bg-raised',
                )}
              >
                <span>
                  <span className={cn('block font-bold text-sm', active ? 'text-accent' : 'text-primary')}>{r.name}</span>
                  <span className="data text-[11px] text-steel/70">{r.slug}</span>
                </span>
                {r.isSystem && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-steel/70">
                    <Lock size={11} /> system
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* permission matrix */}
        <div className="panel overflow-hidden">
          {selected ? (
            <>
              <div className="flex justify-between items-center px-4 py-3.5 border-b border-line">
                <div>
                  <div className="font-extrabold text-base text-primary">{selected.name}</div>
                  <div className="text-xs text-steel">{selected.description || '—'}</div>
                  {!selected.isSystem && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-steel uppercase tracking-wide">Access level</span>
                      <select value={scopeDraft} onChange={(e) => { setScopeDraft(e.target.value); setDirty(true); }}
                        className="bg-base border border-line rounded-lg px-2 py-1 text-xs text-primary outline-none focus:border-accent">
                        {ACCESS_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                      <span className="text-[11px] text-steel/70">controls which machines/data this role sees</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!selected.isSystem && (
                    <button
                      onClick={deleteRole}
                      title="Delete this role"
                      className="inline-flex items-center gap-1.5 bg-surface border border-line text-stopped rounded-lg px-3 py-2 text-sm font-semibold hover:border-stopped/40 transition-colors"
                    >
                      <Trash2 size={15} /> Delete
                    </button>
                  )}
                  <button
                    onClick={savePermissions}
                    disabled={selected.isSystem || saving}
                    className={cn(
                      'inline-flex items-center gap-1.5 bg-accent text-white rounded-lg px-4 py-2 text-sm font-semibold',
                      (selected.isSystem || saving) && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <Save size={15} /> {saving ? 'Saving…' : dirty ? 'Save permissions *' : 'Save permissions'}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="tbl min-w-[720px]">
                  <thead>
                    <tr>
                      <th>MODULE</th>
                      {actions.map((a) => <th key={a} className="text-center">{cap(a)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((mod) => (
                      <tr key={mod}>
                        <td className="font-bold text-primary">{MODULE_LABELS[mod] || cap(mod)}</td>
                        {actions.map((a) => {
                          const on = has(mod, a);
                          return (
                            <td key={a} className="text-center">
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={on}
                                aria-label={`${MODULE_LABELS[mod] || cap(mod)} — ${cap(a)}`}
                                disabled={selected.isSystem}
                                onClick={() => toggle(mod, a)}
                                className={cn(
                                  'w-5 h-5 inline-flex items-center justify-center rounded-md border transition-colors align-middle',
                                  on ? 'bg-accent/10 border-accent text-accent' : 'bg-base border-line text-transparent',
                                  selected.isSystem ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-accent',
                                )}
                              >
                                <Check size={13} strokeWidth={3} className={on ? 'opacity-100' : 'opacity-0'} />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selected.isSystem && (
                <div className="px-4 py-3 text-xs text-steel bg-raised">
                  System roles cannot be edited. Create a new role to customise permissions.
                </div>
              )}
            </>
          ) : (
            <div className="p-10 text-center text-steel">Select a role.</div>
          )}
        </div>
      </div>

      {showNew && <NewRoleModal onClose={() => setShowNew(false)} onSaved={async () => { setShowNew(false); await reload(); toast.success('Role created'); }} />}
    </div>
  );
}

function NewRoleModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<ScopeKind>('machines');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!name.trim()) { setErr('Role name is required.'); return; }
    setSaving(true); setErr('');
    try { await api.post('/api/roles', { name, description, scope, permissions: {} }); onSaved(); }
    catch { setErr('Could not create role (name may already exist).'); setSaving(false); }
  }

  return (
    <Modal title="New Role" onClose={onClose}>
      <Field label="Role Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Line Inspector" /></Field>
      <div className="h-3" />
      <Field label="Description"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" /></Field>
      <div className="h-3" />
      <Field label="Access level — how much of the plant this role can see">
        <select className="input" value={scope} onChange={(e) => setScope(e.target.value as ScopeKind)}>
          {ACCESS_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </Field>
      {err && <div className="text-stopped text-[13px] mt-3">{err}</div>}
      <div className="flex justify-end gap-2.5 mt-[18px]">
        <button onClick={onClose} className="bg-surface border border-line rounded-lg px-3 py-2 text-sm font-semibold text-steel hover:text-primary transition-colors">Cancel</button>
        <button onClick={save} disabled={saving} className={cn('bg-accent text-white rounded-lg px-4 py-2 text-sm font-semibold', saving && 'opacity-50 cursor-not-allowed')}>{saving ? 'Creating…' : 'Create Role'}</button>
      </div>
      <p className="text-xs text-steel mt-3">After creating, select the role and tick the permissions, then Save.</p>
    </Modal>
  );
}
