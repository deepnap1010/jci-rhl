// ============================================================
//  ROLES & PERMISSIONS  —  dynamic RBAC matrix
//  Left: role list. Right: module x action checkbox grid.
//  System roles are read-only. Optimized with local edit state
//  so toggling checkboxes never refetches; one save writes all.
// ============================================================
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Save, Lock } from 'lucide-react';
import { useRoles } from '../hooks/useData';
import { Modal, Field } from './JobTracking';
import { inputStyle } from '../components/ui';
import { useToast } from '../components/Toast';
import { api } from '../api/client';

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', machines: 'Machines', jobs: 'Jobs', downtime: 'Downtime',
  history: 'History', waterFlow: 'Water Flow', electricity: 'Electricity',
  operatorMap: 'Operator Map', employees: 'Employees', roles: 'Roles & Permissions',
  shifts: 'Shift Management', aiQuery: 'AI Query',
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function Roles() {
  const { data, reload } = useRoles();
  const toast = useToast();
  const { roles, modules, actions } = data;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
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
    if (r && !dirty) setDraft(JSON.parse(JSON.stringify(r.permissions || {})));
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
    if (r) setDraft(JSON.parse(JSON.stringify(r.permissions || {})));
  }

  async function savePermissions() {
    if (!selected || selected.isSystem) return;
    setSaving(true);
    try {
      await api.patch(`/api/roles/${selected._id}`, { permissions: draft });
      setDirty(false);
      await reload();
      toast.success(`Permissions saved for ${selected.name}`);
    }
    catch { toast.error('Failed to save permissions'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ padding: '0 28px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Roles &amp; Permissions</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '2px 0 0' }}>Dynamic RBAC: pick modules and actions per role.</p>
        </div>
        <button onClick={() => setShowNew(true)} style={primaryBtn}><Plus size={16} /> New role</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }} className="roles-layout">
        {/* role list */}
        <div className="card" style={{ padding: 8 }}>
          {roles.map((r) => (
            <button key={r._id} onClick={() => selectRole(r._id)} style={{
              width: '100%', textAlign: 'left', border: 'none', borderRadius: 10, padding: '11px 12px',
              marginBottom: 4, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: r._id === selectedId ? 'var(--brand-soft)' : 'transparent',
            }}>
              <span>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 14, color: r._id === selectedId ? 'var(--brand)' : 'var(--text)' }}>{r.name}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{r.slug}</span>
              </span>
              {r.isSystem && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-faint)' }}><Lock size={11} /> system</span>}
            </button>
          ))}
        </div>

        {/* permission matrix */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {selected ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{selected.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selected.description || '—'}</div>
                </div>
                <button onClick={savePermissions} disabled={selected.isSystem || saving} style={{ ...primaryBtn, opacity: selected.isSystem ? 0.5 : 1 }}>
                  <Save size={15} /> {saving ? 'Saving…' : dirty ? 'Save permissions *' : 'Save permissions'}
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', color: 'var(--text-faint)', fontSize: 11, textAlign: 'left' }}>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>MODULE</th>
                      {actions.map((a) => <th key={a} style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'center' }}>{cap(a)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((mod) => (
                      <tr key={mod} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700 }}>{MODULE_LABELS[mod] || cap(mod)}</td>
                        {actions.map((a) => (
                          <td key={a} style={{ padding: '8px', textAlign: 'center' }}>
                            <input type="checkbox" checked={has(mod, a)} disabled={selected.isSystem} onChange={() => toggle(mod, a)} style={{ width: 16, height: 16, cursor: selected.isSystem ? 'not-allowed' : 'pointer' }} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selected.isSystem && (
                <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-2)' }}>
                  System roles cannot be edited. Create a new role to customise permissions.
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Select a role.</div>
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
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!name.trim()) { setErr('Role name is required.'); return; }
    setSaving(true); setErr('');
    try { await api.post('/api/roles', { name, description, permissions: {} }); onSaved(); }
    catch { setErr('Could not create role (name may already exist).'); setSaving(false); }
  }

  return (
    <Modal title="New Role" onClose={onClose}>
      <Field label="Role Name"><input style={fullInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Line Inspector" /></Field>
      <div style={{ height: 12 }} />
      <Field label="Description"><input style={fullInput} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" /></Field>
      {err && <div style={{ color: 'var(--stopped)', fontSize: 13, marginTop: 12 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button onClick={save} disabled={saving} style={primaryBtn}>{saving ? 'Creating…' : 'Create Role'}</button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>After creating, select the role and tick the permissions, then Save.</p>
    </Modal>
  );
}

const primaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '9px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const fullInput: React.CSSProperties = { ...inputStyle, width: '100%' };
