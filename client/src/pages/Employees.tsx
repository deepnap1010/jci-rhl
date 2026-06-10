// ============================================================
//  EMPLOYEES PAGE  —  profiles, role assignments, machine maps
//  Optimized: memoized filtering, debounced search, single fetch.
// ============================================================
import { useState, useMemo, useDeferredValue, useEffect } from 'react';
import { UserPlus, Search, Pencil, Power, X } from 'lucide-react';
import { useEmployees, useRoles, useMachines } from '../hooks/useData';
import type { EmployeeRow } from '../hooks/useData';
import { Modal, Field } from './JobTracking';
import { inputStyle } from '../components/ui';
import { api } from '../api/client';
import { useToast } from '../components/Toast';
import { DEPARTMENTS } from '@shared/types';
import type { Role } from '@shared/types';
import { ROLE_LABELS } from '../config/nav';

export default function Employees() {
  const { data: employees, reload } = useEmployees();
  const { data: rolesData } = useRoles();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [team, setTeam] = useState('');
  const [edit, setEdit] = useState<EmployeeRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const deferredSearch = useDeferredValue(search); // keeps typing smooth on big lists

  // unique teams for the filter dropdown
  const teams = useMemo(
    () => [...new Set(employees.map((e) => e.team).filter(Boolean))],
    [employees]
  );

  // filtering is memoized so it only recomputes when inputs actually change
  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return employees.filter((e) => {
      if (team && e.team !== team) return false;
      if (!q) return true;
      return (
        e.code.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.roleSlug.toLowerCase().includes(q)
      );
    });
  }, [employees, deferredSearch, team]);

  const activeCount = filtered.filter((e) => e.status === 'active').length;
  const roleLabel = (slug: string) => rolesData.roles.find((r) => r.slug === slug)?.name || slug || '—';

  async function toggleStatus(e: EmployeeRow) {
    const next = e.status === 'active' ? 'inactive' : 'active';
    try {
      await api.patch(`/api/employees/${e._id}`, { status: next });
      reload();
      toast.success(`${e.name} set to ${next}`);
    } catch {
      toast.error('Failed to update status');
    }
  }

  return (
    <div style={{ padding: '0 28px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Employees</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '2px 0 0' }}>Profiles, role assignments, team and machine mappings.</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={primaryBtn}><UserPlus size={16} /> Add employee</button>
      </div>

      {/* search + team filter */}
      <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={lbl}>SEARCH</label>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-faint)' }} />
            <input style={{ ...fullInput, paddingLeft: 34 }} placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div style={{ minWidth: 180 }}>
          <label style={lbl}>TEAM</label>
          <select style={fullInput} value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">All</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{activeCount} active</span>
          <button onClick={() => { setSearch(''); setTeam(''); }} style={{ ...linkBtn, display: 'inline-flex', alignItems: 'center', gap: 4 }}><X size={14} /> Clear</button>
        </div>
      </div>

      {/* table */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-faint)', fontSize: 11, background: 'var(--surface-2)' }}>
              <th style={th}>CODE</th><th style={th}>NAME</th><th style={th}>EMAIL</th><th style={th}>ROLES</th>
              <th style={th}>TEAMS</th><th style={th}>SHIFT</th><th style={th}>STATUS</th><th style={thR}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e._id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ ...td, fontWeight: 700 }} className="mono">{e.code}</td>
                <td style={{ ...td, fontWeight: 700 }}>{e.name}</td>
                <td style={{ ...td, color: 'var(--text-muted)' }}>{e.email || '—'}</td>
                <td style={td}>{roleLabel(e.roleSlug)}</td>
                <td style={{ ...td, color: 'var(--text-muted)' }}>{e.team || '—'}</td>
                <td style={{ ...td, color: 'var(--text-muted)' }}>{e.shift}</td>
                <td style={td}><span style={e.status === 'active' ? activePill : inactivePill}>{e.status}</span></td>
                <td style={tdR}>
                  <button onClick={() => setEdit(e)} style={iconBtn} title="Edit"><Pencil size={15} /></button>
                  <button onClick={() => toggleStatus(e)} style={{ ...iconBtn, color: 'var(--stopped)' }} title="Toggle status"><Power size={15} /></button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>No employees.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 12 }}>{filtered.length} records</div>

      {showAdd && <EmployeeModal roles={rolesData.roles} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); reload(); toast.success('Employee added'); }} />}
      {edit && <EmployeeModal emp={edit} roles={rolesData.roles} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); toast.success('Employee updated'); }} />}    </div>
  );
}

// one modal handles both create + edit
function EmployeeModal({ emp, roles, onClose, onSaved }: { emp?: EmployeeRow; roles: { slug: string; name: string; isSystem: boolean }[]; onClose: () => void; onSaved: () => void }) {
  const { machines } = useMachines();
  const { data: allEmps } = useEmployees(); // for the "reports to" picker
  const isEdit = !!emp;
  const [supervisorId, setSupervisorId] = useState(emp?.supervisorId || '');
  // Assignable roles exclude system roles (e.g. System Admin). An admin should not
  // be able to mint another System Admin from the employee form.
  const assignableRoles = roles.filter((r) => !r.isSystem);
  const [f, setF] = useState({
    code: emp?.code || '', name: emp?.name || '', email: emp?.email || '',
    roleSlug: emp?.roleSlug || assignableRoles[0]?.slug || '', role: emp?.role || 'operator',
    department: emp?.department || (DEPARTMENTS[0] as string),
    shift: emp?.shift || 'A', team: emp?.team || '', status: emp?.status || 'active',
  });
  const [picked, setPicked] = useState<string[]>(
    emp ? machines.filter((m) => emp.machineCodes.includes(m.code)).map((m) => m._id) : []
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  // Auto-generate the employee code from the chosen department (create mode only).
  // Codes continue per-department from the last one used.
  useEffect(() => {
    if (isEdit) return;
    let alive = true;
    api.get<{ code: string }>('/api/employees/next-code', { params: { department: f.department } })
      .then((r) => { if (alive) setF((p) => ({ ...p, code: r.data.code })); })
      .catch(() => { /* leave blank on failure */ });
    return () => { alive = false; };
  }, [f.department, isEdit]);

  async function save() {
    if (!f.name) { setErr('Name is required.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = { ...f, assignedMachineIds: picked, supervisorId: supervisorId || null };
      if (isEdit) await api.patch(`/api/employees/${emp!._id}`, payload);
      else await api.post('/api/employees', payload);
      onSaved();
    } catch { setErr('Failed to save employee (is the code unique?).'); setSaving(false); }
  }

  return (
    <Modal title={isEdit ? `Edit ${emp!.name}` : 'Add Employee'} onClose={onClose}>
      <div className="grid-two" style={{ gap: 12 }}>
        <Field label="Employee Code">
          <div style={{ ...fullInput, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', minHeight: 38 }} className="mono">
            {f.code || (isEdit ? '—' : 'Select a department…')}
          </div>
        </Field>
        <Field label="Name"><input style={fullInput} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Full name" /></Field>
        <Field label="Email"><input style={fullInput} value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="name@company.com" /></Field>
        <Field label="Role">
          <select style={fullInput} value={f.roleSlug} onChange={(e) => set('roleSlug', e.target.value)}>
            {assignableRoles.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Department"><select style={fullInput} value={f.department} onChange={(e) => set('department', e.target.value)}>{DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}</select></Field>
        <Field label="Team"><input style={fullInput} value={f.team} onChange={(e) => set('team', e.target.value)} placeholder="Production Team A" /></Field>
        <Field label="Shift"><select style={fullInput} value={f.shift} onChange={(e) => set('shift', e.target.value)}><option value="A">Shift A</option><option value="B">Shift B</option><option value="C">Shift C</option></select></Field>
        <Field label="Status"><select style={fullInput} value={f.status} onChange={(e) => set('status', e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={lbl}>REPORTS TO (MANAGER)</label>
        <select style={fullInput} value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
          <option value="">— none —</option>
          {allEmps.filter((e) => e._id !== emp?._id).map((e) => (
            <option key={e._id} value={e._id}>{e.name} — {ROLE_LABELS[e.role as Role] ?? e.role} ({e.code})</option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={lbl}>ASSIGNED MACHINES</label>
        <div className="grid-two" style={{ gap: 8, maxHeight: 180, overflowY: 'auto', marginTop: 6 }}>
          {machines.map((m) => (
            <label key={m._id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: '8px 11px', cursor: 'pointer', background: picked.includes(m._id) ? 'var(--brand-soft)' : 'var(--surface)' }}>
              <input type="checkbox" checked={picked.includes(m._id)} onChange={() => toggle(m._id)} />
              <span className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{m.code}</span>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{m.department}</span>
            </label>
          ))}
        </div>
      </div>

      {err && <div style={{ color: 'var(--stopped)', fontSize: 13, marginTop: 12 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button onClick={save} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Employee'}</button>
      </div>
    </Modal>
  );
}

const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--text-faint)', display: 'block', marginBottom: 6 };
const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 700 };
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '11px 12px' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right' };
const activePill: React.CSSProperties = { color: 'var(--running, #16a34a)', fontWeight: 700, fontSize: 13 };
const inactivePill: React.CSSProperties = { color: 'var(--text-faint)', fontWeight: 700, fontSize: 13 };
const primaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '9px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const linkBtn: React.CSSProperties = { border: 'none', background: 'none', color: 'var(--text-muted)', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const iconBtn: React.CSSProperties = { border: 'none', background: 'none', color: 'var(--brand)', cursor: 'pointer', padding: 6 };
const fullInput: React.CSSProperties = { ...inputStyle, width: '100%' };
