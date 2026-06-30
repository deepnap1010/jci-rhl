// client/src/components/OrgCascadePicker.tsx
// ============================================================
//  ORG CASCADE PICKER  —  drill down YOUR org to pick an assignee
//  (EKC re-skin — visual layer only, logic unchanged)
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

export interface CascadeSelection {
  userId: string;
  name: string;
  role: string;
  machineCode: string | null;
  path: { id: string; name: string; role: string }[]; // every level selected, top→deepest
}

const SEL = 'w-full bg-base border border-line rounded-lg px-3 py-2.5 text-sm text-primary outline-none focus:border-accent';
const LBL = 'text-xs font-bold text-steel';

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
    const pathNodes = p
      .filter(Boolean)
      .map((id) => findNode(id))
      .filter((n): n is OrgNode => !!n)
      .map((n) => ({ id: n.id, name: n.name, role: n.role }));
    const deepest = pathNodes[pathNodes.length - 1];
    onChange(deepest ? { userId: deepest.id, name: deepest.name, role: deepest.role, machineCode: mc || null, path: pathNodes } : null);
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
    return <div className="text-[13px] text-steel/60">You have no team members yet — set people's manager in the Org Chart.</div>;
  }

  const label = (role: string) => ROLE_LABELS[role as Role] ?? role;

  return (
    <div className="grid gap-2.5">
      {levels.map((lvl, i) => (
        <label key={i} className="grid gap-1">
          <span className={LBL}>{i === 0 ? 'Assign to' : `↳ ${label(lvl.options[0].role)} (optional)`}</span>
          <select value={lvl.selected} onChange={(e) => pick(i, e.target.value)} className={SEL}>
            <option value="">{i === 0 ? '— select —' : '— stop here —'}</option>
            {lvl.options.map((o) => (
              <option key={o.id} value={o.id}>{o.name} — {label(o.role)}</option>
            ))}
          </select>
        </label>
      ))}
      {machines.length > 0 && (
        <label className="grid gap-1">
          <span className={LBL}>↳ Machine (optional)</span>
          <select value={machineCode} onChange={(e) => pickMachine(e.target.value)} className={SEL}>
            <option value="">— any —</option>
            {machines.map((m) => <option key={m.code} value={m.code}>{m.code} · {m.department}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}