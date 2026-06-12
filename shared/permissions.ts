// ============================================================
//  ROLE CAPABILITIES  —  single source of truth for "who can do
//  what", shared by the client (show/hide actions) and the server
//  (enforce). Mirrors the real factory org chart:
//
//    Super Admin → Production Head → Production Manager
//                → Supervisor → Operator
//
//  Each level's *job* maps to a set of capabilities + a data scope
//  + who it may delegate work to (one level down).
// ============================================================
import type { Role } from './types';

export type Capability =
  | 'manageUsers'         // create/disable login accounts (Super Admin)
  | 'setPlantTargets'     // set plant-wide production targets (Production Head)
  | 'assignJobs'          // configure machines / assign jobs, operators, shifts
  | 'reportDowntime'      // report a machine idle with a reason (Operator)
  | 'acknowledgeDowntime' // acknowledge / handle an idle escalation (managers)
  | 'viewAll';            // see the whole plant (no scope restriction)

// how much of the plant a role can see
export type ScopeKind = 'all' | 'lines' | 'machines' | 'own';

export interface RoleDef {
  scope: ScopeKind;
  caps: Capability[];
  assignsTo: Role[]; // roles this role may delegate work to (the level below)
}

const ALL_ASSIGN: Role[] = ['plantHead', 'prodManager', 'supervisor', 'operator', 'employee'];

export const ROLE_CAPS: Record<Role, RoleDef> = {
  // top admin — can do everything, sees everything
  superAdmin: { scope: 'all', caps: ['manageUsers', 'setPlantTargets', 'assignJobs', 'reportDowntime', 'acknowledgeDowntime', 'viewAll'], assignsTo: ALL_ASSIGN },
  admin: { scope: 'all', caps: ['manageUsers', 'setPlantTargets', 'assignJobs', 'reportDowntime', 'acknowledgeDowntime', 'viewAll'], assignsTo: ALL_ASSIGN },

  // Production Head — owns the plant's output, divides work among Production Managers
  plantHead: { scope: 'all', caps: ['setPlantTargets', 'assignJobs', 'reportDowntime', 'acknowledgeDowntime', 'viewAll'], assignsTo: ['prodManager'] },

  // Production Manager — owns their lines, divides work among Supervisors
  prodManager: { scope: 'lines', caps: ['assignJobs', 'reportDowntime', 'acknowledgeDowntime'], assignsTo: ['supervisor'] },

  // Supervisor — owns their machines, assigns operators + jobs, handles their downtime
  supervisor: { scope: 'machines', caps: ['assignJobs', 'reportDowntime', 'acknowledgeDowntime'], assignsTo: ['operator'] },

  // Operator — runs the machine, reports idle
  operator: { scope: 'own', caps: ['reportDowntime'], assignsTo: [] },

  // Employee — basic floor account, view-only of their own machines
  employee: { scope: 'own', caps: [], assignsTo: [] },
};

export function can(role: Role | null | undefined, cap: Capability): boolean {
  return !!role && (ROLE_CAPS[role]?.caps.includes(cap) ?? false);
}

export function scopeOf(role: Role | null | undefined): ScopeKind {
  return role ? ROLE_CAPS[role]?.scope ?? 'own' : 'own';
}

export function assignableBy(role: Role | null | undefined): Role[] {
  return role ? ROLE_CAPS[role]?.assignsTo ?? [] : [];
}

// org hierarchy: can `reportRole` report to `managerRole`? (a manager may only manage the level
// directly below it, per assignsTo). e.g. a plantHead can report to superAdmin, never to a plantHead.
export function canReportTo(reportRole: Role | null | undefined, managerRole: Role | null | undefined): boolean {
  if (!reportRole || !managerRole) return false;
  return assignableBy(managerRole).includes(reportRole);
}
