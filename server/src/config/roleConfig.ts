// ============================================================
//  ROLE CONFIG  —  the permission brain of the whole app
//  Frontend reads `nav` to draw the sidebar.
//  Backend reads `scope` to limit how much data a role sees.
//  Change a role's access HERE and the whole app updates.
// ============================================================
import { Role } from '@shared/types';

// How much data a role can see:
//   'all'              → every machine (admin, plantHead)
//   'assignedLines'    → machines in their departments (prodManager)
//   'assignedMachines' → only their machines (supervisor, operator)
export type Scope = 'all' | 'assignedLines' | 'assignedMachines';

export interface RoleConfig {
  nav: string[];
  scope: Scope;
  canConfigure: boolean; // can open & submit the Configure modal
  canManageUsers?: boolean; // can create/disable login accounts (superAdmin only)
}

export const ROLE_CONFIG: Record<Role, RoleConfig> = {
  superAdmin: {
    nav: [
      'dashboard',
      'machines',
      'jobTracking',
      'downtime',
      'historyLog',
      'waterFlow',
      'electricity',
      'operatorMap',
      'users',
      'employees',
      'roles',
      'shifts',
      'aiQuery',
    ],
    scope: 'all',
    canConfigure: true,
    canManageUsers: true,
  },

  admin: {
    nav: [
      'dashboard',
      'machines',
      'jobTracking',
      'downtime',
      'historyLog',
      'waterFlow',
      'electricity',
      'operatorMap',
      'employees',
      'shifts',
      'aiQuery',
    ],
    scope: 'all',
    canConfigure: true,
  },

  plantHead: {
    nav: [
      'dashboard',
      'machines',
      'jobs',
      'downtime',
      'history',
      'waterFlow',
      'electricity',
      'employees',
      'aiQuery',
    ],
    scope: 'all',
    canConfigure: false,
  },

  prodManager: {
    nav: [
      'dashboard',
      'machines',
      'jobs',
      'history',
      'waterFlow',
      'electricity',
      'aiQuery',
    ],
    scope: 'assignedLines',
    canConfigure: false,
  },

  supervisor: {
    nav: ['dashboard', 'machines', 'jobs', 'downtime'],
    scope: 'assignedMachines',
    canConfigure: false,
  },

  operator: {
    nav: ['dashboard', 'machines'],
    scope: 'assignedMachines',
    canConfigure: false,
  },

  employee: {
    nav: ['dashboard', 'machines'],
    scope: 'assignedMachines',
    canConfigure: false,
  },
};
