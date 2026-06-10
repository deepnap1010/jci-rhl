// ============================================================
//  DERIVATION LAYER
//  The canonical telemetry `data` is free-form. The dashboard
//  needs a consistent view (status, speed, production, temp,
//  water, efficiency, downtime, department). This module resolves
//  that view from whatever fields a machine actually sends.
//
//  Field aliases are DATA-DRIVEN: to support a new field name,
//  add it to the alias list below — no route changes needed.
// ============================================================
import { TelemetryModel } from '../models/Telemetry';
import { MachineModel } from '../models/Machine';
import { Department, User } from '@shared/types';

export type LiveStatus = 'running' | 'idle' | 'stopped' | 'disconnected';

// ---- common metric aliases (first match wins) ----
const ALIASES = {
  speed: ['speed', 'machineSpeed', 'fabricSpeed', 'fabricSpeedRef'],
  production: ['production', 'fabricLength', 'counter'],
  temperature: ['temperature', 'temp', 'bathTemp'],
  waterFlow: ['waterLPH', 'waterFlow', 'water', 'mainWaterTotal'],
};

// ---- dept code / machine type → one of the 12 pipeline departments ----
const DEPT_MAP: Record<string, Department> = {
  rebatching: 'Rebatching',
  singeing: 'Singeing', sing: 'Singeing',
  brushing: 'Brushing',
  cbr: 'CBR (Bleaching)', bleaching: 'CBR (Bleaching)',
  washer: 'Washing', wash: 'Washing', print_washer: 'Washing',
  mercerizer: 'Mercerizing', merc: 'Mercerizing',
  cold_dyeing: 'Cold Dyeing', cold: 'Cold Dyeing',
  maxi: 'Hot Dyeing', jet: 'Hot Dyeing', soft_flow: 'Hot Dyeing', soft: 'Hot Dyeing',
  loopager: 'Supporting', asrs: 'Supporting',
  rotary: 'Printing', printing: 'Printing', print: 'Printing',
  stenter: 'Finishing', sanforizing: 'Finishing', vdr_finish: 'Finishing', peach: 'Finishing', finishing: 'Finishing',
  quality: 'Quality Control', qc: 'Quality Control',
};

type Data = Record<string, unknown>;

function num(data: Data, keys: string[]): number {
  for (const k of keys) {
    const v = data[k];
    if (typeof v === 'number' && !isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);
  }
  return 0;
}

export function departmentFor(data: Data, type?: string): Department {
  const fromData = typeof data.dept === 'string' ? data.dept.toLowerCase() : '';
  const fromType = (type || '').toLowerCase();
  return DEPT_MAP[fromData] || DEPT_MAP[fromType] || 'Rebatching';
}

function liveStatus(data: Data, speed: number, hasTelemetry: boolean): LiveStatus {
  if (!hasTelemetry) return 'disconnected';
  const s = typeof data.status === 'string' ? data.status.toLowerCase() : '';
  if (s === 'running' || s === 'idle' || s === 'stopped') return s;
  if (data.machineRunning === true) return 'running';
  return speed > 0 ? 'running' : 'idle';
}

export interface MachineDoc {
  machineId: string;
  name?: string;
  type?: string;
  metricsSeen?: string[];
  lastSeen?: Date | null;
}
export interface TelemetryDoc {
  machineId: string;
  serverTs: Date;
  deviceTs?: Date;
  data: Data;
}

// The view-model the dashboard frontend already consumes (MachineWithState).
export interface MachineView {
  _id: string;
  code: string;
  machineId: string;
  name: string;
  type: string;
  department: Department;
  status: LiveStatus;
  lastSeen: string | null; // last time the machine reported (persisted, survives the live window)
  state: {
    machineId: string;
    status: LiveStatus;
    speed: number;
    production: number;
    temperature: number;
    waterFlow: number;
    efficiency: number;
    idleSec: number;
    stoppedSec: number;
    runningSec: number;
    downtimeSec: number;
    data: Data;
    updatedAt: string;
  } | null;
  machineType: { name: string; fields: { key: string; label: string; dataType: string; category: string }[] } | null;
}

export function deriveView(machine: MachineDoc, latest: TelemetryDoc | null, pointInTime = false): MachineView {
  const data: Data = latest?.data || {};
  // Values are passed through EXACTLY as the PLC/server reports them — no clamping or
  // overflow-unwrapping. A negative counter is shown as-is (the raw device value).
  const speed = num(data, ALIASES.speed);
  const production = num(data, ALIASES.production);
  const temperature = num(data, ALIASES.temperature);
  const waterFlow = num(data, ALIASES.waterFlow);

  const runningSec = num(data, ['runningSeconds']);
  const idleSec = num(data, ['idleSeconds']);
  const stoppedSec = num(data, ['stoppedSeconds']);
  const downtimeSec = num(data, ['downtimeSeconds']) || idleSec + stoppedSec;

  const totalSec = runningSec + idleSec + stoppedSec;
  const efficiency =
    totalSec > 0 ? Math.round((runningSec / totalSec) * 100) : Math.max(0, Math.min(100, Math.round(speed)));

  // LIVE view: a reading older than FRESH_MS is stale (disconnected), though its
  // values still display. POINT-IN-TIME view (history / date-range): the reading
  // IS the snapshot for that moment, so keep its operational status as recorded.
  const fresh = pointInTime ? !!latest : !!latest && Date.now() - new Date(latest.serverTs).getTime() <= FRESH_MS;
  const status = liveStatus(data, speed, fresh);
  const department = departmentFor(data, machine.type);

  // synthesize a dynamic field registry from everything this machine has sent
  const fields = (machine.metricsSeen || []).map((k) => ({
    key: k,
    label: k,
    dataType: typeof data[k] === 'boolean' ? 'boolean' : typeof data[k] === 'string' ? 'string' : 'number',
    category: 'metric',
  }));

  return {
    _id: machine.machineId,
    code: machine.machineId,
    machineId: machine.machineId,
    name: machine.name || machine.machineId,
    type: machine.type || 'unknown',
    department,
    status,
    lastSeen: machine.lastSeen ? new Date(machine.lastSeen).toISOString() : (latest ? new Date(latest.serverTs).toISOString() : null),
    state: latest
      ? {
          machineId: machine.machineId,
          status,
          speed,
          production,
          temperature,
          waterFlow,
          efficiency,
          idleSec,
          stoppedSec,
          runningSec,
          downtimeSec,
          data,
          updatedAt: new Date(latest.serverTs).toISOString(),
        }
      : null,
    machineType: { name: machine.type || 'unknown', fields },
  };
}

// Which machine codes may a user WRITE to (configure / assign jobs)?
// Light: reads only the (tiny) machines collection, no telemetry. Returns
// 'all' for plant-wide roles. Mirrors the read-scope used by getScopedViews.
export async function machineCodesInScope(user: User): Promise<Set<string> | 'all'> {
  if (user.role === 'superAdmin' || user.role === 'admin' || user.role === 'plantHead') return 'all';
  const machines = (await MachineModel.find().lean()) as unknown as { machineId: string; type?: string }[];
  if (user.role === 'prodManager') {
    const lines = new Set(user.assignedLines);
    return new Set(machines.filter((m) => lines.has(departmentFor({}, m.type))).map((m) => m.machineId));
  }
  return new Set(user.assignedMachineIds || []);
}

// ============================================================
//  CACHING LAYER
//  Every data route derives from latestByMachine()/machines, and
//  the dashboard polls every few seconds across many panels and
//  clients. Without caching, each call re-hits Atlas with the same
//  aggregation. Short TTLs keep the data fresh enough for a live
//  monitor (telemetry granularity is seconds) while collapsing
//  bursts of identical queries into a single DB round-trip.
// ============================================================
const FRESH_MS = 2 * 60 * 1000; // older than this → shown as stale (disconnected), but its last values still display
const LATEST_TTL_MS = 2000; // live telemetry — invisible staleness on an 8s poll
const MACHINE_TTL_MS = 15000; // machine metadata changes rarely

let latestCache: { at: number; map: Map<string, TelemetryDoc> } | null = null;
let machineCache: { at: number; docs: MachineDoc[] } | null = null;

/** Drop caches immediately (call after a machine config write). */
export function invalidateMachineCaches(): void {
  latestCache = null;
  machineCache = null;
}

/** The (tiny, rarely-changing) machines collection, cached for MACHINE_TTL_MS. */
export async function machinesCached(): Promise<MachineDoc[]> {
  const now = Date.now();
  if (machineCache && now - machineCache.at < MACHINE_TTL_MS) return machineCache.docs;
  const docs = (await MachineModel.find().lean()) as unknown as MachineDoc[];
  machineCache = { at: now, docs };
  return docs;
}

// ---- latest telemetry per machine — NO time window ----
// Always returns each machine's most recent reading, however old, so the UI
// shows last-known values instead of 0/null when a machine goes silent.
// Staleness is conveyed via the derived status, not by dropping the data.
// Cached (LATEST_TTL_MS) so the scan is amortized across requests.
export async function latestByMachine(): Promise<Map<string, TelemetryDoc>> {
  const now = Date.now();
  if (latestCache && now - latestCache.at < LATEST_TTL_MS) return latestCache.map;
  const rows = await TelemetryModel.aggregate([
    { $sort: { serverTs: -1 } },
    { $group: { _id: '$machineId', doc: { $first: '$$ROOT' } } },
  ]);
  const map = new Map<string, TelemetryDoc>();
  for (const r of rows) map.set(r._id, r.doc as TelemetryDoc);
  latestCache = { at: now, map };
  return map;
}

// ---- scoped, derived machine views (the single source for dashboards) ----
// Department-based scoping (prodManager) happens AFTER derivation,
// because department is derived from telemetry, not stored on Machine.
// latest telemetry per machine within an explicit [from,to] window — used for
// historical ("as of that period") dashboard/views. Not cached (range varies).
export async function latestByMachineInWindow(from: Date, to: Date): Promise<Map<string, TelemetryDoc>> {
  const rows = await TelemetryModel.aggregate([
    { $match: { serverTs: { $gte: from, $lte: to } } },
    { $sort: { serverTs: -1 } },
    { $group: { _id: '$machineId', doc: { $first: '$$ROOT' } } },
  ]);
  const map = new Map<string, TelemetryDoc>();
  for (const r of rows) map.set(r._id, r.doc as TelemetryDoc);
  return map;
}

// `latest` override lets callers pass a historical window's snapshot.
export async function getScopedViews(user: User, latest?: Map<string, TelemetryDoc>): Promise<MachineView[]> {
  const machines = await machinesCached();
  // a caller-supplied `latest` is a historical window snapshot → point-in-time status
  const pointInTime = !!latest;
  const latestMap = latest ?? (await latestByMachine());
  const views = machines.map((m) => deriveView(m, latestMap.get(m.machineId) || null, pointInTime));

  if (user.role === 'superAdmin' || user.role === 'admin' || user.role === 'plantHead') return views;
  if (user.role === 'prodManager') {
    const lines = new Set(user.assignedLines);
    return views.filter((v) => lines.has(v.department));
  }
  // supervisor / operator → only their machines (assignedMachineIds are string codes)
  const ids = new Set(user.assignedMachineIds);
  return views.filter((v) => ids.has(v.machineId));
}
