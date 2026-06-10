// ============================================================
//  ORG CHART  —  drill-down team hierarchy + reassign manager
//  Click a person to reveal their team, down to operators'
//  machines. Managers can reassign who reports to whom (within
//  their team) right here via the "Reports to" control.
// ============================================================
import { useState } from 'react';
import { ChevronRight, ChevronDown, Cpu, Pencil } from 'lucide-react';
import { useOrg } from '../hooks/useData';
import type { OrgNode } from '../hooks/useData';
import { ROLE_LABELS } from '../config/nav';
import type { Role } from '@shared/types';
import { api } from '../api/client';
import { useToast } from '../components/Toast';

const ROLE_COLOR: Record<string, string> = {
  superAdmin: '#3b5bfd', admin: '#3b5bfd',
  plantHead: '#8b5cf6', prodManager: '#0d9488',
  supervisor: '#f59e0b', operator: '#16a34a', employee: '#94a3b8',
};

interface Person { id: string; name: string; role: string }

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
    <div style={{ padding: '0 28px 40px' }}>
      <div style={{ marginBottom: 14, color: 'var(--text-muted)', fontSize: 13 }}>
        Click a person to expand their team. {viewerLabel && <>You are viewing as <b style={{ color: 'var(--text)' }}>{viewerLabel}</b>.</>} Use the ✎ to change who someone reports to.
      </div>
      {nodes.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          No team members to show yet — assign people a manager in User Management, or use ✎ here.
        </div>
      ) : (
        <div className="card" style={{ padding: 12 }}>
          {nodes.map((n) => (
            <Node key={n.id} node={n} depth={0} parentId="" defaultOpen={nodes.length <= 3}
              everyone={everyone} isAdmin={isAdmin} onReassign={reassign} />
          ))}
        </div>
      )}
    </div>
  );
}

function Node({ node, depth, parentId, defaultOpen, everyone, isAdmin, onReassign }: {
  node: OrgNode; depth: number; parentId: string; defaultOpen?: boolean;
  everyone: Person[]; isAdmin: boolean; onReassign: (userId: string, managerId: string) => void;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [editing, setEditing] = useState(false);
  const hasChildren = node.children.length > 0;
  const showMachines = node.machines.length > 0 && (node.role === 'operator' || !hasChildren);
  const expandable = hasChildren || showMachines;
  const roleLabel = ROLE_LABELS[node.role as Role] ?? node.role;
  const color = ROLE_COLOR[node.role] ?? '#94a3b8';
  const canEdit = isAdmin || depth > 0; // managers reassign their reports; admins anyone
  const blocked = descendantIds(node); // can't report to self or a descendant (loop)
  const candidates = everyone.filter((p) => !blocked.has(p.id));

  return (
    <div>
      <div
        onClick={() => expandable && setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10,
          marginLeft: depth * 22, cursor: expandable ? 'pointer' : 'default',
          background: open && expandable ? 'var(--surface-2)' : 'transparent',
        }}
      >
        <span style={{ width: 18, color: 'var(--text-faint)' }}>
          {expandable ? (open ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : null}
        </span>
        <div style={{ width: 34, height: 34, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 13, background: color }}>
          {initials(node.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{node.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            <span style={{ color, fontWeight: 700 }}>{roleLabel}</span>
            {node.department ? ` · ${node.department}` : ''}
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
          {hasChildren ? `${node.reports} report${node.reports > 1 ? 's' : ''}` : showMachines ? `${node.machines.length} machine${node.machines.length > 1 ? 's' : ''}` : ''}
        </div>
        {canEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); setEditing((v) => !v); }}
            title="Change who this person reports to"
            style={{ border: '1px solid var(--border-strong)', background: 'var(--surface)', borderRadius: 8, width: 28, height: 28, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', cursor: 'pointer', flex: 'none' }}
          >
            <Pencil size={13} />
          </button>
        )}
      </div>

      {editing && (
        <div style={{ marginLeft: depth * 22 + 28, display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 10px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Reports to</span>
          <select
            defaultValue={parentId}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { onReassign(node.id, e.target.value); setEditing(false); }}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', fontSize: 13, fontWeight: 600, background: 'var(--surface)' }}
          >
            <option value="">— no manager —</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({ROLE_LABELS[p.role as Role] ?? p.role})</option>
            ))}
          </select>
        </div>
      )}

      {open && hasChildren && node.children.map((c) => (
        <Node key={c.id} node={c} depth={depth + 1} parentId={node.id} everyone={everyone} isAdmin={isAdmin} onReassign={onReassign} />
      ))}

      {open && showMachines && (
        <div style={{ marginLeft: (depth + 1) * 22 + 28, display: 'flex', flexWrap: 'wrap', gap: 6, padding: '2px 0 10px' }}>
          {node.machines.map((m) => (
            <span key={m.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 9px', fontSize: 12 }}>
              <Cpu size={12} /> <b className="mono">{m.code}</b>
              {m.department ? <span style={{ color: 'var(--text-faint)' }}>· {m.department}</span> : null}
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
