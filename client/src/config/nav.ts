// ============================================================
//  ROLE CONFIG (frontend mirror)
//  The backend has the authoritative copy (it enforces scope).
//  The frontend uses this only to render the correct sidebar
//  nav per role. Labels + icons live here too.
// ============================================================
import type { Role } from '@shared/types';
import {
  LayoutDashboard, Cpu, ClipboardList, TimerReset, History,
  Droplets, Zap, Clock, Sparkles, Map, Users, KeyRound, UserPlus, Network,
} from 'lucide-react';

export interface NavItem {
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
  group: 'OVERVIEW' | 'MONITORING' | 'UTILITIES' | 'MANAGEMENT' | 'MY VIEW' | 'MY WORK';
}

// master list of every page (key must match a route)
export const NAV: Record<string, NavItem> = {
  dashboard:   { key: 'dashboard',   label: 'Dashboard',         icon: LayoutDashboard, group: 'OVERVIEW' },
  machines:    { key: 'machines',    label: 'Machines',          icon: Cpu,             group: 'OVERVIEW' },
  jobs:        { key: 'jobs',        label: 'Jobs & Tasks',      icon: ClipboardList,   group: 'OVERVIEW' },
  downtime:    { key: 'downtime',    label: 'Downtime',          icon: TimerReset,      group: 'MONITORING' },
  history:     { key: 'history',     label: 'History',           icon: History,         group: 'MONITORING' },
  historyLog:  { key: 'historyLog',  label: 'History Log',       icon: History,         group: 'MONITORING' },
  waterFlow:   { key: 'waterFlow',   label: 'Water Flow',        icon: Droplets,        group: 'UTILITIES' },
  electricity: { key: 'electricity', label: 'Electricity',       icon: Zap,             group: 'UTILITIES' },
  operatorMap: { key: 'operatorMap', label: 'Operator Map',      icon: Map,             group: 'MANAGEMENT' },
  org:         { key: 'org',         label: 'Org Chart',         icon: Network,         group: 'MANAGEMENT' },
  users:       { key: 'users',       label: 'User Management',   icon: UserPlus,        group: 'MANAGEMENT' },
  employees:   { key: 'employees',   label: 'Employees',         icon: Users,           group: 'MANAGEMENT' },
  roles:       { key: 'roles',       label: 'Roles & Permissions', icon: KeyRound,      group: 'MANAGEMENT' },
  shifts:      { key: 'shifts',      label: 'Shift Management',  icon: Clock,           group: 'MANAGEMENT' },
  aiQuery:     { key: 'aiQuery',     label: 'AI Query',          icon: Sparkles,        group: 'MANAGEMENT' },
};

// which pages each role sees, in order (mirrors backend roleConfig)
export const ROLE_NAV: Record<Role, string[]> = {
  superAdmin: ['dashboard','machines','jobs','downtime','historyLog','waterFlow','electricity','operatorMap','org','users','employees','roles','shifts','aiQuery'],
  admin: ['dashboard','machines','jobs','downtime','historyLog','waterFlow','electricity','operatorMap','org','employees','roles','shifts','aiQuery'],
  plantHead: ['dashboard','machines','jobs','downtime','history','waterFlow','electricity','org','employees','aiQuery'],
  prodManager: ['dashboard','machines','jobs','downtime','history','waterFlow','electricity','org','aiQuery'],
  supervisor: ['dashboard','machines','jobs','downtime','org'],
  operator: ['dashboard','machines','jobs','org'],
  employee: ['dashboard','machines','jobs','org'],
};

// Org hierarchy (top → bottom):
//   Super Admin → Production Head → Production Manager → Supervisor → Operator
export const ROLE_LABELS: Record<Role, string> = {
  superAdmin: 'Super Admin',
  admin: 'Admin',
  plantHead: 'Production Head',
  prodManager: 'Production Manager',
  supervisor: 'Supervisor',
  operator: 'Operator',
  employee: 'Employee',
};

export const ALL_ROLES: Role[] = ['superAdmin', 'admin', 'plantHead', 'prodManager', 'supervisor', 'operator', 'employee'];

// roles the Super Admin can assign when creating a login account
// (admin is merged into superAdmin, so it is no longer offered)
export const ASSIGNABLE_ROLES: Role[] = ['plantHead', 'prodManager', 'supervisor', 'operator', 'employee'];
