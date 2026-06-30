// ============================================================
//  ROLE CONFIG (frontend mirror)
//  The backend has the authoritative copy (it enforces scope).
//  The frontend uses this only to render the correct sidebar
//  nav per role. Labels + icons + header subtitles live here too.
// ============================================================
import type { Role } from '@shared/types';
import {
  LayoutDashboard, Cpu, ClipboardList, TimerReset, History,
  Sparkles, Map, KeyRound, UserPlus, Network, Settings as SettingsIcon, Bell, FileBarChart, Inbox,
} from 'lucide-react';

export interface NavItem {
  key: string;
  label: string;
  subtitle?: string; // shown under the page title in the topbar (EKC PageHeader style)
  icon: typeof LayoutDashboard;
  group: 'OVERVIEW' | 'MONITORING' | 'UTILITIES' | 'MANAGEMENT' | 'SYSTEM' | 'MY VIEW' | 'MY WORK';
}

// master list of every page (key must match a route)
export const NAV: Record<string, NavItem> = {
  dashboard:   { key: 'dashboard',   label: 'Dashboard',         subtitle: 'Production overview & live insights', icon: LayoutDashboard, group: 'OVERVIEW' },
  machines:    { key: 'machines',    label: 'Machines',          subtitle: 'Live machine status & control',       icon: Cpu,             group: 'OVERVIEW' },
  jobs:        { key: 'jobs',        label: 'Jobs & Tasks',      subtitle: 'Jobs, assignments & progress',        icon: ClipboardList,   group: 'OVERVIEW' },
  downtime:    { key: 'downtime',    label: 'Downtime',          subtitle: 'Idle & stopped time analysis',        icon: TimerReset,      group: 'MONITORING' },
  history:     { key: 'history',     label: 'History',           subtitle: 'Telemetry log & exports',             icon: History,         group: 'MONITORING' },
  historyLog:  { key: 'historyLog',  label: 'History Log',       subtitle: 'Telemetry log & exports',             icon: History,         group: 'MONITORING' },
  reports:     { key: 'reports',     label: 'Reports',           subtitle: 'Production & downtime summaries',      icon: FileBarChart,    group: 'MONITORING' },
  alerts:      { key: 'alerts',      label: 'Alerts',            subtitle: 'Machine-health alerts',               icon: Bell,            group: 'MONITORING' },
  operatorMap: { key: 'operatorMap', label: 'Operator Map',      subtitle: 'Machines by operator & supervisor',   icon: Map,             group: 'MANAGEMENT' },
  org:         { key: 'org',         label: 'Org Chart',         subtitle: 'Team hierarchy & reporting lines',    icon: Network,         group: 'MANAGEMENT' },
  users:       { key: 'users',       label: 'User Management',   subtitle: 'Login accounts & access',             icon: UserPlus,        group: 'MANAGEMENT' },
  roles:       { key: 'roles',       label: 'Roles & Permissions', subtitle: 'Role permissions & scope',          icon: KeyRound,        group: 'MANAGEMENT' },
  aiQuery:     { key: 'aiQuery',     label: 'AI Query',          subtitle: 'Ask your plant data',                 icon: Sparkles,        group: 'MANAGEMENT' },
  notifications: { key: 'notifications', label: 'Notifications',   subtitle: 'Your notification history',            icon: Inbox,           group: 'SYSTEM' },
  settings:    { key: 'settings',    label: 'Settings',          subtitle: 'Preferences & account',               icon: SettingsIcon,    group: 'SYSTEM' },

};

// which pages each role sees, in order (mirrors backend roleConfig)
export const ROLE_NAV: Record<Role, string[]> = {
  superAdmin: ['dashboard','machines','jobs','downtime','historyLog','reports','alerts','operatorMap','org','users','roles','aiQuery','notifications','settings'],
  admin: ['dashboard','machines','jobs','downtime','historyLog','reports','alerts','operatorMap','org','roles','aiQuery','notifications','settings'],
  plantHead: ['dashboard','machines','jobs','downtime','history','reports','alerts','org','aiQuery','notifications','settings'],
  prodManager: ['dashboard','machines','jobs','downtime','history','reports','alerts','org','aiQuery','notifications','settings'],
  supervisor: ['dashboard','machines','jobs','downtime','alerts','org','notifications','settings'],
  operator: ['dashboard','machines','jobs','org','notifications','settings'],
  employee: ['dashboard','machines','jobs','org','notifications','settings'],
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
