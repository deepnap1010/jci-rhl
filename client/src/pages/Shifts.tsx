// ============================================================
//  SHIFT MANAGEMENT PAGE  —  shift cards + editable assignment
//  Admins can reassign an employee's shift (and fix their role)
//  inline; changes persist and the shift counts recompute.
// ============================================================
import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useShifts } from '../hooks/useData';
import { api } from '../api/client';
import { ROLE_LABELS, ALL_ROLES } from '../config/nav';
import type { Role } from '@shared/types';

const SHIFT_COLOR: Record<string, string> = { A: '#f59e0b', B: '#3b5bfd', C: '#8b5cf6' };
const SHIFT_CODES = ['A', 'B', 'C'] as const;

export default function Shifts() {
  const { data, reload } = useShifts();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ shift: string; role: string }>({ shift: 'A', role: 'operator' });
  const [saving, setSaving] = useState(false);
  const [editCard, setEditCard] = useState<string | null>(null);
  const [cardDraft, setCardDraft] = useState({ name: '', start: '', end: '' });
  const [savingCard, setSavingCard] = useState(false);

  function startEdit(a: { _id: string; shift: string; role: string }) {
    setEditing(a._id);
    setDraft({ shift: a.shift, role: a.role });
  }
  async function save(id: string) {
    setSaving(true);
    try {
      await api.patch(`/api/employees/${id}`, { shift: draft.shift, role: draft.role });
      setEditing(null);
      reload();
    } catch { /* keep editing on failure */ } finally {
      setSaving(false);
    }
  }

  function startCardEdit(s: { code: string; name: string; start: string; end: string }) {
    setEditCard(s.code);
    setCardDraft({ name: s.name, start: s.start, end: s.end });
  }
  async function saveCard(code: string) {
    setSavingCard(true);
    try {
      await api.patch(`/api/shifts/${code}`, cardDraft);
      setEditCard(null);
      reload();
    } catch { /* keep editing on failure */ } finally {
      setSavingCard(false);
    }
  }

  return (
    <div style={{ padding: '0 28px 40px' }}>
      {/* shift cards */}
      <div className="grid-stats-3" style={{ gap: 16 }}>
        {data.shifts.map((s) => (
          <div key={s.code} className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {editCard === s.code ? (
                  <>
                    <input value={cardDraft.name} onChange={(e) => setCardDraft((d) => ({ ...d, name: e.target.value }))} style={cardInput} placeholder="Shift name" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      <input type="time" value={cardDraft.start} onChange={(e) => setCardDraft((d) => ({ ...d, start: e.target.value }))} style={{ ...cardInput, width: 120 }} />
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                      <input type="time" value={cardDraft.end} onChange={(e) => setCardDraft((d) => ({ ...d, end: e.target.value }))} style={{ ...cardInput, width: 120 }} />
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: SHIFT_COLOR[s.code] }} /> {s.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.start} — {s.end}</div>
                  </>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: SHIFT_COLOR[s.code] }}>Shift {s.code}</div>
                {editCard === s.code ? (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => saveCard(s.code)} disabled={savingCard} style={saveBtn}>{savingCard ? 'Saving…' : 'Save'}</button>
                    <button onClick={() => setEditCard(null)} style={cancelBtn}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => startCardEdit(s)} style={{ ...editBtn, marginTop: 8 }}><Pencil size={12} /> Edit</button>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 32, margin: '16px 0 12px' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 700 }}>SUPERVISORS</div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{s.supervisors}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 700 }}>OPERATORS</div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{s.operators}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {s.names.map((n) => (
                <span key={n} style={{ background: 'var(--brand-soft)', color: 'var(--brand)', borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{n}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* assignment table (editable) */}
      <div className="card" style={{ padding: 18, marginTop: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>Shift-wise Employee Assignment</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-faint)', fontSize: 11 }}>
              <th style={th}>EMPLOYEE</th><th style={th}>ROLE</th><th style={th}>DEPARTMENT</th>
              <th style={th}>CURRENT SHIFT</th><th style={th}>MACHINES</th><th style={thR}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {data.assignments.length === 0 ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No employees yet.</td></tr>
            ) : data.assignments.map((a) => {
              const isEd = editing === a._id;
              return (
                <tr key={a._id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...td, fontWeight: 700 }}>{a.name}</td>
                  <td style={td}>
                    {isEd ? (
                      <select value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))} style={sel}>
                        {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    ) : <RolePill role={a.role} />}
                  </td>
                  <td style={{ ...td, color: 'var(--text-muted)' }}>{a.department}</td>
                  <td style={td}>
                    {isEd ? (
                      <select value={draft.shift} onChange={(e) => setDraft((d) => ({ ...d, shift: e.target.value }))} style={sel}>
                        {SHIFT_CODES.map((s) => <option key={s} value={s}>Shift {s}</option>)}
                      </select>
                    ) : (
                      <span style={{ background: '#fef5e7', color: '#b45309', borderRadius: 99, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>Shift {a.shift}</span>
                    )}
                  </td>
                  <td style={{ ...td, color: 'var(--text-muted)' }} className="mono">{a.machineCodes.join(', ') || '—'}</td>
                  <td style={tdR}>
                    {isEd ? (
                      <span style={{ display: 'inline-flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => save(a._id)} disabled={saving} style={saveBtn}>{saving ? 'Saving…' : 'Save'}</button>
                        <button onClick={() => setEditing(null)} style={cancelBtn}>Cancel</button>
                      </span>
                    ) : (
                      <button onClick={() => startEdit(a)} style={editBtn}><Pencil size={13} /> Edit</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RolePill({ role }: { role: string }) {
  const map: Record<string, [string, string]> = {
    operator: ['#e8f7ee', '#16a34a'],
    supervisor: ['#eaf3fb', '#2563eb'],
    prodManager: ['#f3edff', '#7c3aed'],
    plantHead: ['#fff3e8', '#c2410c'],
    admin: ['#eef2ff', '#3b5bfd'],
  };
  const [bg, fg] = map[role] ?? ['var(--surface-2)', 'var(--text-muted)'];
  const label = ROLE_LABELS[role as Role] ?? role;
  return <span style={{ background: bg, color: fg, borderRadius: 99, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>{label}</span>;
}

const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 700 };
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '10px 8px' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right' };
const sel: React.CSSProperties = { border: '1px solid var(--border-strong)', borderRadius: 8, padding: '5px 8px', fontSize: 13, background: 'var(--surface)', color: 'var(--text)', outline: 'none' };
const cardInput: React.CSSProperties = { border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 10px', fontSize: 14, fontWeight: 600, width: '100%', outline: 'none', background: 'var(--surface)', color: 'var(--text)' };
const editBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--brand)', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const saveBtn: React.CSSProperties = { border: 'none', background: 'var(--brand)', color: '#fff', borderRadius: 8, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const cancelBtn: React.CSSProperties = { border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-muted)', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
