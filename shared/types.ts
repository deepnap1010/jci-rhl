// ============================================================
//  SHARED TYPES  —  the single source of truth for data shapes
//  Both client/ and server/ import from this file.
//  RULE: any new data field must be added HERE first.
// ============================================================

// ─── ROLES ──────────────────────────────────────────────────
// superAdmin sits above admin: it owns user management (creating logins,
// assigning roles) and has full access. employee is a basic floor account.
export type Role =
  | 'superAdmin'
  | 'admin'
  | 'plantHead'
  | 'prodManager'
  | 'supervisor'
  | 'operator'
  | 'employee';

// ─── DEPARTMENTS (the 12 process stages, exact strings) ─────
// These are used for: the production pipeline, the Machines
// department filter, and prodManager scoping (assignedLines).
// `as const` means TypeScript rejects any typo'd department.
export const DEPARTMENTS = [
  'Rebatching',
  'Singeing',
  'Brushing',
  'CBR (Bleaching)',
  'Washing',
  'Mercerizing',
  'Cold Dyeing',
  'Hot Dyeing',
  'Supporting',
  'Printing',
  'Finishing',
  'Quality Control',
] as const;

export type Department = (typeof DEPARTMENTS)[number];

// ─── DYNAMIC SCHEMA REGISTRY ────────────────────────────────
// FieldDef describes ONE parameter a machine type can report.
// A MachineType is a list of these. This is how we support
// N machine types without writing N interfaces.
export interface FieldDef {
  key: string; // e.g. "bathTemp", "CHEM1TOTALLTR"
  label: string; // e.g. "Bath Temperature"
  unit?: string; // e.g. "°C", "L/hr"
  dataType: 'number' | 'boolean' | 'string';
  category: 'metric' | 'status' | 'counter';
  thresholds?: { warn?: number; critical?: number };
}

export interface MachineType {
  _id: string;
  name: string; // "SOPAR Washer", "CBR Bleaching", "Mercerizer"
  fields: FieldDef[]; // the dynamic IOT parameters for this type
}

// ─── MACHINE STATUS ─────────────────────────────────────────
export type MachineStatus = 'running' | 'idle' | 'stopped' | 'disconnected';

// ─── PHYSICAL MACHINE (one real unit on the floor) ──────────
export interface Machine {
  _id: string;
  machineTypeId: string; // links to MachineType
  code: string; // "WASHER-01", "CBR-02"
  name: string; // human-friendly display name
  department: Department; // used for scoping + filtering
  status: MachineStatus;
  lastSeenAt: string; // ISO date — used to detect "disconnected"
}

// ─── LIVE STATE (latest snapshot — dashboards read THIS) ────
// `data` holds the dynamic IOT params. The keys here match the
// `key` values in the machine's MachineType.fields.
export interface MachineState {
  machineId: string;
  status: MachineStatus;
  // Fixed/common metrics every machine reports:
  speed: number; // m/min
  production: number; // mtr
  temperature: number; // °C
  waterFlow: number; // L/hr
  efficiency: number; // computed %, 0–100
  // Derived time accounting (filled in by the server's deriveView):
  runningSec?: number;
  idleSec?: number;
  stoppedSec?: number;
  downtimeSec?: number; // idle + stopped
  // Dynamic IOT params (washer squeezers, printer colors, etc.):
  data: Record<string, number | string | boolean>;
  updatedAt: string; // ISO date
}

// ─── JOB (human-assigned context attached to a machine) ─────
// The PLC sends telemetry; a person assigns which job runs.
// Kept as its own entity so history survives job changes.
export type JobStatus = 'pending' | 'inProgress' | 'completed';

export interface Job {
  _id: string;
  jobNumber: string; // "JOB-10592"
  orderNumber: string; // "LOT1-05"
  fabricName: string; // "Cotrize"
  stage: Department; // current pipeline stage
  targetProduction: number; // meters
  achievedProduction: number; // meters
  status: JobStatus;
  machineId?: string; // which machine is running it
  operatorId?: string;
  supervisorId?: string;
}

// ─── USER ───────────────────────────────────────────────────
export interface User {
  _id: string;
  name: string;
  email?: string; // login identifier
  role: Role; // the EFFECTIVE built-in role used for auth/scope enforcement
  roleSlug?: string | null; // the admin-created role actually assigned (for display)
  roleName?: string | null; // its display name
  assignedMachineIds: string[]; // for supervisor / operator
  assignedLines: Department[]; // for prodManager
  mustChangePassword?: boolean; // true until a freshly-created user resets their temp password
  isActive?: boolean; // a disabled user cannot log in
  // org chart: who this person reports to. Operator → Supervisor → Plant Head → Super Admin.
  // Drives both assignment delegation and idle-alert escalation.
  managerId?: string | null;
}

// What POST /api/auth/login returns to the client.
export interface AuthResponse {
  token: string;
  user: User;
}

// ─── DOWNTIME REPORT (operator-reported idle, with escalation) ─
export type DowntimeReportStatus = 'open' | 'acknowledged' | 'escalated' | 'resolved';
export interface DowntimeReport {
  _id: string;
  machineId: string;
  machineCode: string;
  department: string;
  reason: string;
  note?: string;
  status: DowntimeReportStatus;
  operatorId: string | null;
  operatorName: string;
  supervisorId: string | null; // the operator's manager (notified at 5 min)
  plantHeadId: string | null; // the supervisor's manager (escalated at 30 min)
  startedAt: string;
  supervisorNotifiedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
  escalatedAt: string | null;
  resolvedAt: string | null;
  createdAt?: string;
}

// ─── EMPLOYEE (people on the floor — operators, supervisors…) ─
// Drives Employees & Roles, Shift Management, Operator Map, and
// the operator/supervisor names shown on machines + jobs.
export type ShiftCode = 'A' | 'B' | 'C';

export interface Employee {
  _id: string;
  code: string; // "OPR-01", "SUP-02", "PM-01"
  name: string;
  role: Role; // operator | supervisor | prodManager | plantHead | admin
  department: Department;
  shift: ShiftCode;
  assignedMachineIds: string[]; // machines this person runs / oversees
  supervisorId?: string; // for operators: who supervises them
}

// Static shift definitions (timings). Counts are computed live.
export interface ShiftDef {
  code: ShiftCode;
  name: string; // "Morning Shift"
  start: string; // "06:00"
  end: string; // "14:00"
}

// ─── DOWNTIME EVENT (a spell of idle / stopped time) ─────────
// Opened when a machine leaves "running", closed when it returns.
export type DowntimeType = 'idle' | 'stopped';

export interface DowntimeEvent {
  _id: string;
  machineId: string;
  type: DowntimeType;
  startTs: string; // ISO
  endTs?: string; // ISO — absent while still ongoing
  durationSec: number; // running tally; final when closed
  reason?: string;
}

// ─── DASHBOARD SUMMARY (what /api/dashboard returns) ────────
export interface DashboardData {
  totalMachines: number;
  running: number;
  idle: number;
  stopped: number;
  totalProduction: number; // sum of each machine's current cumulative counter
  todayProduction: number; // produced within the active window (today, or the selected day) — counter delta
  avgEfficiency: number;
  activeJobs: number;
  alerts: number;
  // richer KPIs (v3):
  employees: number;
  totalJobs: number;
  completedJobs: number;
  pendingJobs: number;
  runningSec: number; // aggregate time spent running (today)
  idleSec: number;
  stoppedSec: number;
  downtimeSec: number; // idle + stopped
  deptStats: { dept: Department; machines: number; production: number; efficiency: number }[];
  machineBreakdown: MachineBreakdown[]; // per-machine windowed values that drive the KPI drill-downs
  stale?: boolean;            // live feed offline → values are the last available day, not "today"
  lastUpdated?: string | null; // ISO timestamp of the most recent reading
}

// per-machine values for the active window (today / selected day), used by the dashboard modals
export interface MachineBreakdown {
  machineId: string;
  code: string;
  name: string;
  department: Department;
  status: MachineStatus;
  production: number; // produced in the window (today)
  productionTotal: number; // lifetime cumulative counter
  runningSec: number;
  idleSec: number;
  stoppedSec: number;
  downtimeSec: number;
  efficiency: number; // time-weighted for the window
}

// ─── RAW PAYLOAD (ingestion truth — what machines actually send) ──
// Stored exactly as received, never edited. This is the audit log
// and replay source. The processing status tells you whether we
// understood the packet or not.
export type RawStatus =
  | 'pending' // received, not processed yet
  | 'ok' // fully mapped + validated
  | 'partial' // mapped, but had unmapped/suspect fields
  | 'unknown_machine' // machineCode didn't match any machine
  | 'error'; // processing threw

export interface RawPayload {
  _id: string;
  receivedAt: string; // ISO timestamp
  machineCode?: string; // whatever the packet used to identify itself
  body: Record<string, unknown>; // the ENTIRE payload, untouched
  status: RawStatus;
  unmapped?: string[]; // field keys we received but don't know
  suspect?: string[]; // field keys whose values failed validation
  note?: string; // human-readable processing note
}

// ─── HISTORY / TELEMETRY ROW ────────────────────────────────
export interface TelemetryRow {
  _id: string;
  machineId: string;
  ts: string; // ISO timestamp
  status: MachineStatus;
  speed: number;
  production: number;
  data: Record<string, number | string | boolean>;
}
