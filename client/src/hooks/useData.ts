// ============================================================
//  DATA HOOKS
//  Fetch scoped data; refetch when the role changes and when
//  the socket signals a live update.
// ============================================================
import { useEffect, useState, useCallback } from 'react';
import { api, cachedGet, getSocket } from '../api/client';
import { useAuth } from '../context/auth';
import type { MachineState, MachineType, DashboardData, ShiftDef, Role } from '@shared/types';

// live-update poll interval (fallback when socket/change-stream is quiet)
const POLL_MS = 8000;

export interface MachineWithState {
  _id: string;
  code: string;
  name: string;
  department: string;
  status: MachineState['status'];
  state: (MachineState & { _id: string }) | null;
  machineType: MachineType | null;
}

// Shared live/stale summary across a set of machines. "live" means at least one
// machine is reporting fresh data (status not disconnected); lastUpdated is the
// most recent reading time across them.
export function liveSummary(machines: MachineWithState[]): { live: boolean; lastUpdated: string } {
  const live = machines.some((m) => m.status !== 'disconnected');
  const lastUpdated = machines.reduce<string>((max, m) => {
    const t = m.state?.updatedAt;
    return t && t > max ? t : max;
  }, '');
  return { live, lastUpdated };
}
export function fmtLastSeen(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}
// compact relative time: "5m ago" / "3h ago" / "2d ago"
export function fmtAgo(iso: string): string {
  if (!iso) return 'no data';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function useMachines(from?: string, to?: string) {
  const { role } = useAuth();
  const [data, setData] = useState<MachineWithState[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    try {
      const qs = from && to ? '?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) : '';
      const data = await cachedGet<MachineWithState[]>('/api/machines' + qs, { force });
      setData(data);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [role, load]);

  // live: refetch on socket nudge (debounced, fresh) + steady poll fallback (cached/deduped)
  useEffect(() => {
    const socket = getSocket();
    let t: ReturnType<typeof setTimeout>;
    const onUpdate = () => {
      clearTimeout(t);
      t = setTimeout(() => load(true), 400);
    };
    socket.on('state:update', onUpdate);
    const poll = setInterval(() => load(), POLL_MS);
    return () => {
      socket.off('state:update', onUpdate);
      clearTimeout(t);
      clearInterval(poll);
    };
  }, [load]);

  return { machines: data, loading, reload: () => load(true) };
}

export function useDashboard(from?: string, to?: string) {
  const { role } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      const p = new URLSearchParams();
      if (from && to) { p.set('from', from); p.set('to', to); }
      // local midnight today → server computes "today's production" (counter delta) for the live view
      const ds = new Date(); ds.setHours(0, 0, 0, 0);
      p.set('dayStart', ds.toISOString());
      const data = await cachedGet<DashboardData>('/api/dashboard?' + p.toString(), { force });
      setData(data);
    } catch {
      setData(null);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [role, load]);

  useEffect(() => {
    const socket = getSocket();
    let t: ReturnType<typeof setTimeout>;
    const onUpdate = () => { clearTimeout(t); t = setTimeout(() => load(true), 400); };
    socket.on('state:update', onUpdate);
    const poll = setInterval(() => load(), POLL_MS);
    return () => { socket.off('state:update', onUpdate); clearTimeout(t); clearInterval(poll); };
  }, [load]);

  return data;
}

// ============================================================
//  GENERIC ENDPOINT HOOK
//  Fetches `path`, refetches on role change + (debounced) live
//  socket updates. Changing `path` (e.g. ?by=supervisor) refetches.
// ============================================================
export function useEndpoint<T>(path: string, fallback: T, live = true) {
  const { role } = useAuth();
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    try {
      const result = await cachedGet<T>(path, { force });
      setData(result);
    } catch {
      /* keep last good data */
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [role, load]);

  useEffect(() => {
    if (!live) return;
    const socket = getSocket();
    let t: ReturnType<typeof setTimeout>;
    const onUpdate = () => {
      clearTimeout(t);
      t = setTimeout(() => load(true), 600);
    };
    socket.on('state:update', onUpdate);
    const poll = setInterval(() => load(), POLL_MS);
    return () => {
      socket.off('state:update', onUpdate);
      clearTimeout(t);
      clearInterval(poll);
    };
  }, [load, live]);

  return { data, loading, reload: () => load(true) };
}

// ─── response shapes (frontend view-models) ─────────────────
export interface JobRow {
  _id: string;
  jobNumber: string;
  orderNumber: string;
  fabricName: string;
  stage: string;
  targetProduction: number;
  achievedProduction: number;
  pct: number;
  status: 'pending' | 'inProgress' | 'completed';
  machineId: string | null;
  machineCode: string | null;
  operatorName: string | null;
  supervisorName: string | null;
  operatorId: string | null;
  supervisorId: string | null;
  batchId: string;
  processType: string;
  loadedAt: string | null;
  glm: number;
  liquorRatio: string;
  dyeStage: string;
  shift: string;
  createdAt: string | null; // when the job was allotted
}

export interface EmployeeRow {
  _id: string;
  code: string;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  team: string;
  roleSlug: string;
  role: string;
  department: string;
  shift: 'A' | 'B' | 'C';
  machineCodes: string[];
  operatorsCount: number;
  supervisorId: string;
  supervisorName: string;
}

export interface RoleRow {
  _id: string;
  name: string;
  slug: string;
  description: string;
  isSystem: boolean;
  permissions: Record<string, string[]>;
}

export interface ShiftCard extends ShiftDef {
  supervisors: number;
  operators: number;
  names: string[];
}
export interface ShiftAssignment {
  _id: string;
  name: string;
  role: string;
  department: string;
  shift: 'A' | 'B' | 'C';
  machineCodes: string[];
}

export interface DowntimeEventRow {
  _id: string;
  type: 'idle' | 'stopped';
  startTs: string;
  endTs: string | null;
  durationSec: number;
  ongoing: boolean;
}
export interface DowntimeCard {
  _id: string;
  code: string;
  name: string;
  department: string;
  status: MachineState['status'];
  idleSec: number;
  stoppedSec: number;
  eventCount: number;
  idleCount?: number;
  stoppedCount?: number;
  lastSpell?: { type: 'idle' | 'stopped'; durationSec: number; ts: string } | null;
  events: DowntimeEventRow[];
}

export interface HistoryRow {
  _id: string;
  ts: string;
  machineCode: string;
  department: string;
  status: MachineState['status'];
  speed: number;
  production: number;
  temperature: number;
  waterFlow: number;
  efficiency: number;
}

export interface OperatorGroup {
  key: string;
  name: string;
  code: string | null;
  stats: { machines: number; running: number; production: number; avgEff: number };
  machines: {
    _id: string;
    code: string;
    name: string;
    department: string;
    type: string;
    status: MachineState['status'];
    production: number;
    efficiency: number;
  }[];
}

// ─── domain hooks ───────────────────────────────────────────
export const useJobs = () => useEndpoint<JobRow[]>('/api/jobs', []);
export const useEmployees = () => useEndpoint<EmployeeRow[]>('/api/employees', [], false);
export const useRoles = () =>
  useEndpoint<{ roles: RoleRow[]; modules: string[]; actions: string[] }>('/api/roles', { roles: [], modules: [], actions: [] }, false);

// ─── people (login users) for assignment dropdowns ──────────
export interface PersonRow { _id: string; name: string; role: string; email: string; assignedMachineIds: string[] }
export function usePeople(): PersonRow[] {
  const { data } = useEndpoint<{ people: PersonRow[] }>('/api/people', { people: [] }, false);
  return data.people;
}

// ─── alerts (role-scoped machine health) ────────────────────
export type AlertSeverity = 'critical' | 'warning' | 'info';
export interface AlertItem {
  id: string;
  machineId: string;
  machineCode: string;
  department: string;
  severity: AlertSeverity;
  type: string;
  title: string;
  detail: string;
  ts: string;
}
export const useAlerts = () =>
  useEndpoint<{ alerts: AlertItem[]; counts: { critical: number; warning: number; info: number; total: number } }>(
    '/api/alerts',
    { alerts: [], counts: { critical: 0, warning: 0, info: 0, total: 0 } }
  );
// ─── personal notifications (job assignments) ───────────────
export interface NotificationItem {
  id: string;
  audience: 'operator' | 'supervisor' | 'plantHead';
  type: string;
  severity: 'info' | 'warning' | 'critical';
  refType: string | null;
  refId: string | null;
  actionType: string | null; // 'acknowledge' | null
  machineCode: string;
  jobNumber: string;
  orderNumber: string;
  fabricName: string;
  stage: string;
  machineId: string | null;
  targetProduction: number;
  shift: string;
  title: string;
  body: string;
  read: boolean;
  ts: string;
}

export function useNotifications() {
  const { role } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async (force = false) => {
    try {
      const data = await cachedGet<{ items: NotificationItem[]; unread: number }>('/api/notifications', { force });
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      /* keep last good data */
    }
  }, []);

  useEffect(() => { load(); }, [role, load]);

  // refresh on socket nudge (real-time, fresh) + steady poll fallback (cached/deduped)
  useEffect(() => {
    const socket = getSocket();
    const onNew = () => load(true);
    socket.on('notify:new', onNew);
    const poll = setInterval(() => load(), POLL_MS);
    return () => { socket.off('notify:new', onNew); clearInterval(poll); };
  }, [load]);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    try { await api.post(`/api/notifications/${id}/read`); } catch { load(true); }
  }, [load]);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try { await api.post('/api/notifications/read-all'); } catch { load(true); }
  }, [load]);

  return { items, unread, reload: () => load(true), markRead, markAllRead };
}

// ─── downtime reports (operator-reported idle + escalation) ──
export interface DowntimeReportRow {
  _id: string;
  machineId: string;
  machineCode: string;
  department: string;
  reason: string;
  note: string;
  status: 'open' | 'acknowledged' | 'escalated' | 'resolved';
  operatorName: string;
  supervisorId: string | null;
  plantHeadId: string | null;
  startedAt: string | null;
  supervisorNotifiedAt: string | null;
  level: number;
  escalatedToName: string | null;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
  escalatedAt: string | null;
  resolvedAt: string | null;
}

export function useDowntimeReports() {
  const { role } = useAuth();
  const [reports, setReports] = useState<DowntimeReportRow[]>([]);

  const load = useCallback(async (force = false) => {
    try {
      const data = await cachedGet<{ reports: DowntimeReportRow[] }>('/api/downtime-reports', { force });
      setReports(data.reports);
    } catch { /* keep last good */ }
  }, []);

  useEffect(() => { load(); }, [role, load]);
  useEffect(() => {
    const socket = getSocket();
    const onNew = () => load(true);
    socket.on('notify:new', onNew);
    const poll = setInterval(() => load(), POLL_MS);
    return () => { socket.off('notify:new', onNew); clearInterval(poll); };
  }, [load]);

  const report = useCallback(async (machineId: string, reason: string, note?: string) => {
    await api.post('/api/downtime-reports', { machineId, reason, note });
    load(true);
  }, [load]);
  const acknowledge = useCallback(async (id: string) => {
    await api.post(`/api/downtime-reports/${id}/acknowledge`);
    load(true);
  }, [load]);
  const resolve = useCallback(async (id: string) => {
    await api.post(`/api/downtime-reports/${id}/resolve`);
    load(true);
  }, [load]);

  return { reports, reload: () => load(true), report, acknowledge, resolve };
}

// ─── tasks (delegated work down the org chart) ──────────────
export interface TaskRow {
  _id: string;
  taskNumber: string;
  title: string;
  details: string;
  targetProduction: number;
  department: string;
  machineId: string | null;
  jobId: string | null;
  jobNumber: string;
  assignedToId: string | null;
  assignedToName: string;
  assignedToRole: string;
  assignedById: string | null;
  assignedByName: string;
  assignedByRole: string;
  status: 'assigned' | 'inProgress' | 'done';
  createdAt: string | null;
}
export interface ReportUser { _id: string; name: string; email?: string; role: Role }

export interface AssignTaskInput {
  assignedToId: string;
  title: string;
  details?: string;
  targetProduction?: number;
  department?: string;
  machineId?: string | null;
  jobId?: string | null;
  jobNumber?: string;
}

export function useTasks() {
  const { role } = useAuth();
  const [toMe, setToMe] = useState<TaskRow[]>([]);
  const [byMe, setByMe] = useState<TaskRow[]>([]);
  const [reports, setReports] = useState<ReportUser[]>([]);

  const load = useCallback(async (force = false) => {
    try {
      const data = await cachedGet<{ toMe: TaskRow[]; byMe: TaskRow[] }>('/api/tasks', { force });
      setToMe(data.toMe);
      setByMe(data.byMe);
    } catch { /* keep last good */ }
  }, []);
  const loadReports = useCallback(async () => {
    try {
      const d = await cachedGet<{ reports: ReportUser[] }>('/api/tasks/reports');
      setReports(d.reports);
    } catch { /* keep last good */ }
  }, []);

  useEffect(() => { load(); loadReports(); }, [role, load, loadReports]);
  useEffect(() => {
    const socket = getSocket();
    const onNew = () => load(true);
    socket.on('notify:new', onNew);
    const poll = setInterval(() => load(), POLL_MS);
    return () => { socket.off('notify:new', onNew); clearInterval(poll); };
  }, [load]);

  const assign = useCallback(async (input: AssignTaskInput) => {
    await api.post('/api/tasks', input);
    load(true);
  }, [load]);
  const setStatus = useCallback(async (id: string, status: TaskRow['status']) => {
    await api.patch(`/api/tasks/${id}`, { status });
    load(true);
  }, [load]);

  return { toMe, byMe, reports, reload: () => load(true), assign, setStatus };
}

// ─── org chart (team hierarchy) ─────────────────────────────
export interface OrgMachine { code: string; name: string; department: string }
export interface OrgNode {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  machines: OrgMachine[];
  reports: number;
  children: OrgNode[];
}
export const useOrg = () =>
  useEndpoint<{ nodes: OrgNode[]; viewerRole: string }>('/api/org', { nodes: [], viewerRole: '' }, false);

export const useShifts = () =>
  useEndpoint<{ shifts: ShiftCard[]; assignments: ShiftAssignment[] }>('/api/shifts', { shifts: [], assignments: [] });
export const useDowntimeData = (qs = '') =>
  useEndpoint<{ cards: DowntimeCard[]; kpis: { totalDowntimeSec: number; stopped: number; idle: number; running: number } }>(
    '/api/downtime' + qs,
    { cards: [], kpis: { totalDowntimeSec: 0, stopped: 0, idle: 0, running: 0 } }
  );
export const useWater = (from?: string, to?: string) =>
  useEndpoint<{
    kpis: { totalKL: number; dyeingUsage: number; cbrSteamWater: number; wastageAlerts: number };
    deptWise: { dept: string; kl: number }[];
    topConsumers: { code: string; type: string; department: string; lhr: number; dailyKL: number }[];
  }>('/api/water' + (from && to ? '?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) : ''), { kpis: { totalKL: 0, dyeingUsage: 0, cbrSteamWater: 0, wastageAlerts: 0 }, deptWise: [], topConsumers: [] });
export const useElectricity = (from?: string, to?: string) =>
  useEndpoint<{
    kpis: { todayKwh: number; peakLoadKw: number; powerFactor: number; costToday: number };
    deptWise: { dept: string; kwh: number }[];
    hourly: { label: string; kw: number }[];
    machines: { code: string; type: string; department: string; kw: number; kwhToday: number }[];
    days: number;
    ranged: boolean;
  }>('/api/electricity' + (from && to ? '?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) : ''), { kpis: { todayKwh: 0, peakLoadKw: 0, powerFactor: 0, costToday: 0 }, deptWise: [], hourly: [], machines: [], days: 1, ranged: false });
export const useOperatorMap = (by: 'operator' | 'supervisor') =>
  useEndpoint<{ by: string; groups: OperatorGroup[] }>(`/api/operator-map?by=${by}`, { by, groups: [] });
