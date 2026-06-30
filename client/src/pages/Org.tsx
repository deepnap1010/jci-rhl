// ============================================================
//  ORG CHART  —  drill-down team hierarchy + reassign manager
//  Click a person to reveal their team, down to operators'
//  machines. Managers can reassign who reports to whom (within
//  their team) right here via the "Reports to" control.
//  EKC re-skin — visual layer only, logic unchanged.
// ============================================================
import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Cpu, Pencil, Search, X } from 'lucide-react';
import { useOrg } from '../hooks/useData';
import type { OrgNode } from '../hooks/useData';
import { ROLE_LABELS } from '../config/nav';
import type { Role } from '@shared/types';
import { canReportTo } from '@shared/permissions';
import { api } from '../api/client';
import { useToast } from '../components/Toast';
import { cn } from '../lib/utils';

const ROLE_COLOR: Record<string, string> = {
  superAdmin: '#3b5bfd', admin: '#3b5bfd',
  plantHead: '#8b5cf6', prodManager: '#0d9488',
  supervisor: '#f59e0b', operator: '#16a34a', employee: '#94a3b8',
};

interface Person { id: string; name: string; role: string }
type SearchCtx = { searching: boolean; q: string; matchIds: Set<string>; openIds: Set<string>; visibleIds: Set<string> };

function flatten(nodes: OrgNode[], out: Person[] = []): Person[] {
  for (const n of nodes) { out.push({ id: n.id, name: n.name, role: n.role }); flatten(n.children, out); }
  return out;
}
function descendantIds(node: OrgNode, set = new Set<string>()): Set<string> {
  set.add(node.id);
  for (const c of node.children) descendantIds(c, set);
  return set;
}

export default function Org() {
  const { data, reload } = useOrg();
  const toast = useToast();
  const nodes = data.nodes;
  const viewerLabel = data.viewerRole ? (ROLE_LABELS[data.viewerRole as Role] ?? data.viewerRole) : '';
  const isAdmin = data.viewerRole === 'superAdmin' || data.viewerRole === 'admin';
  const everyone = flatten(nodes);
  const [query, setQuery] = useState('');

  // search → reveal each match with its full subtree (expanded) plus the path of managers above it
  const search: SearchCtx = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchIds = new Set<string>(), openIds = new Set<string>(), visibleIds = new Set<string>();
    if (!q) return { searching: false, q, matchIds, openIds, visibleIds };
    const matches = (n: OrgNode) => `${n.name} ${ROLE_LABELS[n.role as Role] ?? n.role} ${n.department || ''}`.toLowerCase().includes(q);
    const walk = (n: OrgNode, ancestors: string[]) => {
      if (matches(n)) {
        matchIds.add(n.id);
        ancestors.forEach((a) => { visibleIds.add(a); openIds.add(a); });    // reveal the path above
        const addDesc = (d: OrgNode) => { visibleIds.add(d.id); openIds.add(d.id); d.children.forEach(addDesc); };
        addDesc(n);                                                            // show the match + whole subtree, expanded
      }
      n.children.forEach((c) => walk(c, [...ancestors, n.id]));
    };
    nodes.forEach((n) => walk(n, []));
    return { searching: true, q, matchIds, openIds, visibleIds };
  }, [query, nodes]);
  const noMatches = search.searching && search.matchIds.size === 0;

  async function reassign(userId: string, managerId: string) {
    try {
      await api.patch('/api/org/manager', { userId, managerId: managerId || null });
      toast.success('Reporting line updated');
      reload();
    } catch (e) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to reassign');
    }
  }

  return (
    <div className="px-5 sm:px-7 pt-1 pb-10 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-[1_1_280px] max-w-[380px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel/60 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a person by name, role or department…"
            className="input pl-9 pr-9"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-steel/60 hover:text-primary transition-colors"><X size={15} /></button>
          )}
        </div>
        <span className="text-sm text-steel">
          {search.searching
            ? `${search.matchIds.size} match${search.matchIds.size === 1 ? '' : 'es'} — showing each with their full team`
            : <>Click a person to expand their team. {viewerLabel && <>Viewing as <b className="text-primary">{viewerLabel}</b>.</>} Use ✎ to change who someone reports to.</>}
        </span>
      </div>
      {nodes.length === 0 ? (
        <div className="card p-10 text-center text-steel">
          No team members to show yet — assign people a manager in User Management, or use ✎ here.
        </div>
      ) : noMatches ? (
        <div className="card p-10 text-center text-steel">No one matches “{query}”.</div>
      ) : (
        <div className="panel p-3">
          {nodes.map((n) => (
            <Node key={n.id} node={n} depth={0} parentId="" defaultOpen={nodes.length <= 3}
              everyone={everyone} isAdmin={isAdmin} onReassign={reassign} search={search} />
          ))}
        </div>
      )}
    </div>
  );
}

function Node({ node, depth, parentId, defaultOpen, everyone, isAdmin, onReassign, search }: {
  node: OrgNode; depth: number; parentId: string; defaultOpen?: boolean;
  everyone: Person[]; isAdmin: boolean; onReassign: (userId: string, managerId: string) => void; search: SearchCtx;
}) {
  const [localOpen, setLocalOpen] = useState(!!defaultOpen);
  const [editing, setEditing] = useState(false);
  // while searching, hide branches with no match and force-open the revealed path/subtree
  if (search.searching && !search.visibleIds.has(node.id)) return null;
  const open = search.searching ? search.openIds.has(node.id) : localOpen;
  const setOpen = (fn: (o: boolean) => boolean) => { if (!search.searching) setLocalOpen(fn); };
  const isMatch = search.matchIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const showMachines = node.machines.length > 0 && (node.role === 'operator' || !hasChildren);
  const expandable = hasChildren || showMachines;
  const roleLabel = ROLE_LABELS[node.role as Role] ?? node.role;
  const color = ROLE_COLOR[node.role] ?? '#94a3b8';
  const canEdit = isAdmin || depth > 0; // managers reassign their reports; admins anyone
  const blocked = descendantIds(node); // can't report to self or a descendant (loop)
  // only valid managers per the hierarchy (a Production Head reports to Super Admin, not another head)
  const candidates = everyone.filter((p) => !blocked.has(p.id) && canReportTo(node.role as Role, p.role as Role));

  return (
    <div>
      <div
        onClick={() => expandable && setOpen((o) => !o)}
        style={{ marginLeft: depth * 22 }}
        className={cn(
          'flex items-center gap-2.5 px-2.5 py-2 rounded-lg',
          expandable ? 'cursor-pointer' : 'cursor-default',
          isMatch
            ? 'bg-accent/10 ring-1 ring-accent'
            : open && expandable ? 'bg-raised' : 'hover:bg-raised',
        )}
      >
        <span className="w-[18px] text-steel/60">
          {expandable ? (open ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : null}
        </span>
        <div className="w-[34px] h-[34px] rounded-full flex-none grid place-items-center text-white font-extrabold text-[13px]" style={{ background: color }}>
          {initials(node.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className={cn('font-bold text-sm', isMatch && 'text-accent')}>{node.name}</div>
          <div className="text-xs text-steel">
            <span className="font-bold" style={{ color }}>{roleLabel}</span>
            {node.department ? ` · ${node.department}` : ''}
          </div>
        </div>
        <div className="text-xs text-steel/60 whitespace-nowrap">
          {hasChildren ? `${node.reports} report${node.reports > 1 ? 's' : ''}` : showMachines ? `${node.machines.length} machine${node.machines.length > 1 ? 's' : ''}` : ''}
        </div>
        {canEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); setEditing((v) => !v); }}
            title="Change who this person reports to"
            className="border border-line bg-base rounded-lg w-7 h-7 grid place-items-center text-steel hover:text-primary transition-colors flex-none"
          >
            <Pencil size={13} />
          </button>
        )}
      </div>

      {editing && (
        <div className="flex items-center gap-2 pt-1 pb-2.5" style={{ marginLeft: depth * 22 + 28 }}>
          <span className="text-xs font-bold text-steel">Reports to</span>
          <select
            defaultValue={parentId}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { onReassign(node.id, e.target.value); setEditing(false); }}
            className="input w-auto py-1.5 font-semibold"
          >
            <option value="">— no manager —</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({ROLE_LABELS[p.role as Role] ?? p.role})</option>
            ))}
          </select>
        </div>
      )}

      {open && hasChildren && node.children.map((c) => (
        <Node key={c.id} node={c} depth={depth + 1} parentId={node.id} everyone={everyone} isAdmin={isAdmin} onReassign={onReassign} search={search} />
      ))}

      {open && showMachines && (
        <div className="flex flex-wrap gap-1.5 pt-0.5 pb-2.5" style={{ marginLeft: (depth + 1) * 22 + 28 }}>
          {node.machines.map((m) => (
            <span key={m.code} className="inline-flex items-center gap-1.5 bg-raised border border-line rounded-lg px-2.5 py-1 text-xs">
              <Cpu size={12} /> <b className="mono">{m.code}</b>
              {m.department ? <span className="text-steel/60">· {m.department}</span> : null}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function initials(name: string): string {
  return (name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}
