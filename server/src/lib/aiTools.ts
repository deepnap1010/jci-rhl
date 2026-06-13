// ============================================================
//  AI TOOLS  —  the functions the AI Query assistant may call.
//  Each runs against LIVE data, scoped to the asking user (so the
//  assistant can never reveal anything outside their permissions).
//  Read-only by design.
// ============================================================
import { getScopedViews } from './derive';
import { windowMetrics } from '../routes/dashboard';
import { downtimeByMachine } from '../routes/downtime';
import { JobModel } from '../models/Job';
import { UserModel } from '../models/User';
import type { User } from '@shared/types';

// Gemini function declarations (OpenAPI-subset; types are the uppercase Type enum)
export const AI_TOOLS = [
  {
    name: 'get_fleet_status',
    description: "Current status of every machine the user can see: running/idle/stopped/disconnected counts and each machine's live production (m), speed (m/min), temperature (°C) and efficiency (%). Use for 'how many are running', 'is X working', etc.",
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'get_production',
    description: "Total and per-machine production in meters over a time window. Use for 'how much did we produce' and date-range questions. Dates are ISO 8601; omit both for the last 24h.",
    parameters: { type: 'OBJECT', properties: { fromISO: { type: 'STRING', description: 'window start, ISO 8601' }, toISO: { type: 'STRING', description: 'window end, ISO 8601' } } },
  },
  {
    name: 'get_jobs',
    description: 'Production jobs the user can see, with operator, supervisor, machine, stage, status and progress. Optionally filter by a person name or status (pending|inProgress|completed).',
    parameters: { type: 'OBJECT', properties: { person: { type: 'STRING', description: 'operator or supervisor name to filter by' }, status: { type: 'STRING', description: 'pending | inProgress | completed' } } },
  },
  {
    name: 'get_downtime',
    description: "Per-machine idle and stopped time (minutes) and occurrence counts over a window (default last 24h), plus each machine's most recent downtime spell. Use for 'which machine had the most downtime'.",
    parameters: { type: 'OBJECT', properties: { fromISO: { type: 'STRING' }, toISO: { type: 'STRING' } } },
  },
];

const DAY = 24 * 3600 * 1000;

export async function runTool(name: string, args: Record<string, unknown>, user: User): Promise<unknown> {
  const views = await getScopedViews(user);
  const ids = views.map((v) => v.machineId);

  if (name === 'get_fleet_status') {
    const counts = { total: views.length, running: 0, idle: 0, stopped: 0, disconnected: 0 };
    for (const v of views) {
      if (v.status === 'running') counts.running++;
      else if (v.status === 'idle') counts.idle++;
      else if (v.status === 'stopped') counts.stopped++;
      else counts.disconnected++;
    }
    const machines = views.map((v) => ({
      code: v.code, name: v.name, department: v.department, status: v.status,
      production: v.state?.production ?? 0, speed: v.state?.speed ?? 0,
      temperature: v.state?.temperature ?? 0, efficiency: v.state?.efficiency ?? 0,
    }));
    return { counts, machines };
  }

  if (name === 'get_production') {
    const to = args.toISO ? new Date(String(args.toISO)) : new Date();
    const from = args.fromISO ? new Date(String(args.fromISO)) : new Date(to.getTime() - DAY);
    const m = await windowMetrics(ids, from, to);
    let total = 0;
    const perMachine = views.map((v) => { const p = m.get(v.machineId)?.production ?? 0; total += p; return { code: v.code, department: v.department, production: Math.round(p) }; })
      .sort((a, b) => b.production - a.production);
    return { from: from.toISOString(), to: to.toISOString(), totalProduction: Math.round(total), perMachine };
  }

  if (name === 'get_jobs') {
    const scoped = new Set(views.map((v) => v.code));
    const jobs = await JobModel.find().sort({ createdAt: -1 }).lean();
    const userIds = new Set<string>();
    jobs.forEach((j: Record<string, unknown>) => { if (j.operatorId) userIds.add(String(j.operatorId)); if (j.supervisorId) userIds.add(String(j.supervisorId)); });
    const people = await UserModel.find({ _id: { $in: [...userIds] } }).select('name').lean();
    const nameById = new Map(people.map((p: Record<string, unknown>) => [String(p._id), p.name as string]));
    const isAdmin = user.role === 'superAdmin' || user.role === 'admin' || user.role === 'plantHead';
    let rows = jobs.map((j: Record<string, unknown>) => ({
      jobNumber: j.jobNumber, order: j.orderNumber, fabric: j.fabricName, stage: j.stage, status: j.status,
      target: (j.targetProduction as number) || 0, achieved: (j.achievedProduction as number) || 0,
      operator: j.operatorId ? nameById.get(String(j.operatorId)) ?? null : null,
      supervisor: j.supervisorId ? nameById.get(String(j.supervisorId)) ?? null : null,
      machine: (j.machineId as string) || null,
      allottedAt: j.createdAt ? new Date(j.createdAt as Date).toISOString() : null,
    }));
    if (!isAdmin) rows = rows.filter((r) => !r.machine || scoped.has(r.machine));
    const person = args.person ? String(args.person).toLowerCase() : '';
    const status = args.status ? String(args.status) : '';
    if (person) rows = rows.filter((r) => (r.operator || '').toLowerCase().includes(person) || (r.supervisor || '').toLowerCase().includes(person));
    if (status) rows = rows.filter((r) => r.status === status);
    return { count: rows.length, jobs: rows.slice(0, 50) };
  }

  if (name === 'get_downtime') {
    const to = args.toISO ? new Date(String(args.toISO)) : new Date();
    const from = args.fromISO ? new Date(String(args.fromISO)) : new Date(to.getTime() - DAY);
    const dt = await downtimeByMachine(ids, from, to, `ai|${from.toISOString()}|${to.toISOString()}`);
    const machines = views.map((v) => {
      const a = dt.get(v.machineId);
      return {
        code: v.code, department: v.department,
        idleMin: Math.round((a?.idleSec || 0) / 60), stoppedMin: Math.round((a?.stoppedSec || 0) / 60),
        occurrences: (a?.idleCount || 0) + (a?.stoppedCount || 0),
        lastSpell: a?.lastSpell ? { type: a.lastSpell.type, durationSec: a.lastSpell.durationSec, at: new Date(a.lastSpell.ts).toISOString() } : null,
      };
    }).filter((r) => r.idleMin > 0 || r.stoppedMin > 0)
      .sort((x, y) => (y.idleMin + y.stoppedMin) - (x.idleMin + x.stoppedMin));
    return { from: from.toISOString(), to: to.toISOString(), machines };
  }

  return { error: `Unknown tool: ${name}` };
}
