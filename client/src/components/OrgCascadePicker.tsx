// ============================================================
//  ORG CASCADE PICKER  —  drill down YOUR org to pick an assignee
//
//  Walks the viewer's subtree one level at a time: the first
//  dropdown lists your direct reports; picking one reveals their
//  reports; …down to an operator and their machines. You can stop
//  at any level. Scoped to your downline only (server /api/org),
//  so you can never assign up your own chain.
// ============================================================
import { useState } from 'react';
import { useOrg } from '../hooks/useData';
import type { OrgNode } from '../hooks/useData';
import { ROLE_LABELS } from '../config/nav';
import type { Role } from '@shared/types';

export interface CascadeSelection { userId: string; name: string; role: string; machineCode: string | null }

export default function OrgCascadePicker({ onChange }: { onChange: (sel: CascadeSelection | null) => void }) {
  const { data } = useOrg();
  const isAdmin = data.viewerRole === 'superAdmin' || data.viewerRole === 'admin';
  const topLevel: OrgNode[] = isAdmin ? data.nodes : (data.nodes[0]?.children ?? []);
  const [path, setPath] = useState<string[]>([]); // selected user id at each level
  const [machineCode, setMachineCode] = useState('');

  function findNode(id: string, nodes: OrgNode[] = topLevel): OrgNode | null {
    for (const n of nodes) { if (n.id === id) return n; const c = findNode(id, n.children); if (c) return c; }
    return null;
  }

  // visible cascade levels derived from the current path
  const levels: { options: OrgNode[]; selected: string }[] = [];
  let opts = topLevel;
  for (let i = 0; opts.length > 0; i++) {
    const sel = path[i] || '';
    levels.push({ options: opts, selected: sel });
    if (!sel) break;
    opts = findNode(sel)?.children ?? [];
  }

  const deepestId = [...path].reverse().find(Boolean) || '';
  const deepestNode = deepestId ? findNode(deepestId) : null;
  const machines = deepestNode?.role === 'operator' ? deepestNode.machines : [];

  function emit(p: string[], mc: string) {
    const id = [...p].reverse().find(Boolean) || '';
    const node = id ? findNode(id) : null;
    onChange(node ? { userId: node.id, name: node.name, role: node.role, machineCode: mc || null } : null);
  }
  function pick(level: number, value: string) {
    const next = path.slice(0, level);
    if (value) next.push(value);
    setPath(next);
    setMachineCode('');
    emit(next, '');
  }
  function pickMachine(code: string) {
    setMachineCode(code);
    emit(path, code);
  }

  if (topLevel.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>You have no team members yet — set people's manager in the Org Chart.</div>;
  }

  const label = (role: string) => ROLE_LABELS[role as Role] ?? role;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {levels.map((lvl, i) => (
        <label key={i} style={{ display: 'grid', gap: 4 }}>
          <span style={lblStyle}>{i === 0 ? 'Assign to' : `↳ ${label(lvl.options[0].role)} (optional)`}</span>
          <select value={lvl.selected} onChange={(e) => pick(i, e.target.value)} style={selStyle}>
            <option value="">{i === 0 ? '— select —' : '— stop here —'}</option>
            {lvl.options.map((o) => (
              <option key={o.id} value={o.id}>{o.name} — {label(o.role)}</option>
            ))}
          </select>
        </label>
      ))}
      {machines.length > 0 && (
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={lblStyle}>↳ Machine (optional)</span>
          <select value={machineCode} onChange={(e) => pickMachine(e.target.value)} style={selStyle}>
            <option value="">— any —</option>
            {machines.map((m) => <option key={m.code} value={m.code}>{m.code} · {m.department}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

const lblStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' };
const selStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid var(--border-strong)', borderRadius: 10, fontSize: 14, background: 'var(--surface)', fontFamily: 'inherit' };
