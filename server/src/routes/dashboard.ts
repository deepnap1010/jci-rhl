// ============================================================
//  DASHBOARD ROUTE
//  KPI summary, role-scoped. Built from derived machine views +
//  jobs + employees. Time/downtime KPIs come from the PLC's own
//  per-machine counters in the latest telemetry.
// ============================================================
import { Router } from 'express';
import { JobModel } from '../models/Job';
import { UserModel } from '../models/User';
import { TelemetryModel } from '../models/Telemetry';
import { getScopedViews, latestByMachineInWindow } from '../lib/derive';
import { DashboardData, MachineBreakdown, DEPARTMENTS, Department, User } from '@shared/types';

const router = Router();

// Telemetry counters (production meters, run/idle/stopped/downtime seconds) are CUMULATIVE
// lifetime totals. A timeframe's value is therefore a delta:
//   value(window) = (counter at the window's latest reading) − (last counter before it started)
// clamped at 0 so a counter reset/rollover can never make a window go negative. Efficiency is
// time-weighted from those windowed seconds (runningSec / active), not a mean of per-machine %.
type Cum = { production: number; runningSec: number; idleSec: number; stoppedSec: number; downtimeSec: number };
const ZERO: Cum = { production: 0, runningSec: 0, idleSec: 0, stoppedSec: 0, downtimeSec: 0 };
const STALE_MS = 5 * 60 * 1000;       // live feed older than this → show last-known instead of zeros
const IST_OFFSET = 5.5 * 3600 * 1000; // factory-local day boundary

// Window total = SUM of per-day deltas. A single (end−start) delta over a multi-day range is wrong
// because counters reset several times inside the window (so a 6-day range came out < one day).
// Per day we take the day's MAX counter and diff it against the prior day's (reset-aware: a counter
// that dropped below the previous value reset, so that day's value is the post-reset reading).
//
// MAX — not "the last reading" — because machines send PARTIAL packets (a reading may omit
// `production` etc.). With last-reading extraction the counter flapped between the real value and
// 0/an alias whenever the newest packet lacked the field, so "Production Today" visibly jumped
// (e.g. 25,000 → 20,000 → back). For a cumulative counter max == latest-known value; packets
// without the field are ignored ($max skips nulls) and the total can never go DOWN.
const cvn = (input: unknown) => ({ $convert: { input, to: 'double', onError: null, onNull: null } });
const maxOf = (input: unknown) => ({ $max: cvn(input) });
const COUNTERS = {
  prod: { $ifNull: ['$data.production', '$data.fabricLength'] },
  run: '$data.runningSeconds', idle: '$data.idleSeconds', stop: '$data.stoppedSeconds',
};
type DayRow = { _id: { m: string; d: Date }; prod: number | null; run: number | null; idle: number | null; stop: number | null };
type BaseRow = { _id: string; prod: number | null; run: number | null; idle: number | null; stop: number | null };

export async function windowMetrics(ids: string[], from: Date, to: Date): Promise<Map<string, Cum>> {
  const project = { prod: maxOf(COUNTERS.prod), run: maxOf(COUNTERS.run), idle: maxOf(COUNTERS.idle), stop: maxOf(COUNTERS.stop) };
  // last reading per (machine, IST day) within the window + last reading just before the window
  const [dayRows, baseRows] = await Promise.all([
    TelemetryModel.aggregate([
      { $match: { machineId: { $in: ids }, serverTs: { $gte: from, $lte: to } } },
      { $group: { _id: { m: '$machineId', d: { $dateTrunc: { date: '$serverTs', unit: 'day', timezone: 'Asia/Kolkata' } } }, ...project } },
      { $sort: { '_id.d': 1 } },
    ]) as Promise<DayRow[]>,
    TelemetryModel.aggregate([
      { $match: { machineId: { $in: ids }, serverTs: { $gte: new Date(from.getTime() - 3 * 864e5), $lt: from } } },
      { $group: { _id: '$machineId', ...project } },
    ]) as Promise<BaseRow[]>,
  ]);

  const baseBy = new Map<string, Cum>();
  for (const b of baseRows) baseBy.set(String(b._id), { production: b.prod || 0, runningSec: b.run || 0, idleSec: b.idle || 0, stoppedSec: b.stop || 0, downtimeSec: 0 });
  const daysByMachine = new Map<string, DayRow[]>();
  for (const r of dayRows) { const m = String(r._id.m); (daysByMachine.get(m) ?? daysByMachine.set(m, []).get(m)!).push(r); }

  const d = (cur: number, prev: number) => Math.max(0, cur >= prev ? cur - prev : cur); // reset-aware
  const out = new Map<string, Cum>();
  for (const id of ids) {
    let prev = baseBy.get(id) ?? ZERO;
    const acc: Cum = { production: 0, runningSec: 0, idleSec: 0, stoppedSec: 0, downtimeSec: 0 };
    for (const r of daysByMachine.get(id) ?? []) {
      const cur: Cum = { production: r.prod || 0, runningSec: r.run || 0, idleSec: r.idle || 0, stoppedSec: r.stop || 0, downtimeSec: 0 };
      const idleD = d(cur.idleSec, prev.idleSec), stopD = d(cur.stoppedSec, prev.stoppedSec);
      acc.production += d(cur.production, prev.production);
      acc.runningSec += d(cur.runningSec, prev.runningSec);
      acc.idleSec += idleD;
      acc.stoppedSec += stopD;
      acc.downtimeSec += idleD + stopD; // downtime ≡ idle + stopped
      prev = cur;
    }
    out.set(id, acc);
  }
  return out;
}

// Concurrent identical-scope requests collapse into ONE aggregation, and the result is cached
// for a few seconds. This is the main defence against the broadcast→force-refetch storm:
// thousands of users hitting /api/dashboard in the same ~700ms burst now share a single set of
// telemetry aggregations instead of each running their own two fleet-wide $group passes.
const DASH_TTL_MS = Number(process.env.DASHBOARD_CACHE_MS) || 4000;
const dashCache = new Map<string, { at: number; data: DashboardData }>();
const dashInflight = new Map<string, Promise<DashboardData>>();

// Cache key = the viewer's data scope + the requested window. Admin/plantHead all share 'ALL',
// so their requests dedupe to one query fleet-wide; scoped users key by their assignments.
function scopeKey(user: User): string {
  const seesAll = user.role === 'superAdmin' || user.role === 'admin' || user.role === 'plantHead';
  if (seesAll) return 'ALL';
  const ids = [...(user.assignedMachineIds || [])].sort().join(',');
  const lines = [...(user.assignedLines || [])].sort().join(',');
  return `${user.role}:${ids}:${lines}`;
}

async function getDashboard(user: User, q: { from?: string; to?: string; dayStart?: string }): Promise<DashboardData> {
  const key = `${scopeKey(user)}|${q.from || ''}|${q.to || ''}|${q.dayStart || ''}`;
  const hit = dashCache.get(key);
  if (hit && Date.now() - hit.at < DASH_TTL_MS) return hit.data;       // fresh enough → serve cached
  const flying = dashInflight.get(key);
  if (flying) return flying;                                            // identical request in flight → await it
  const p = (async () => {
    try {
      const data = await computeDashboard(user, q);
      if (dashCache.size > 500) dashCache.clear();                      // bound the cache
      dashCache.set(key, { at: Date.now(), data });
      return data;
    } finally {
      dashInflight.delete(key);
    }
  })();
  dashInflight.set(key, p);
  return p;
}

async function computeDashboard(user: User, q: { from?: string; to?: string; dayStart?: string }): Promise<DashboardData> {
    // optional ?from=&to= → historical dashboard (each machine's latest reading in the window)
    const f = q.from ? new Date(q.from) : null;
    const t = q.to ? new Date(q.to) : null;
    const range = f && t && !isNaN(f.getTime()) && !isNaN(t.getTime()) ? { from: f, to: t } : null;

    // active window: a selected range, or "today" (client's local midnight in ?dayStart=) → now.
    const ds = q.dayStart ? new Date(q.dayStart) : null;
    let winStart = range ? range.from : (ds && !isNaN(ds.getTime()) ? ds : null);
    let winEnd = range ? range.to : new Date();
    let latest = range ? await latestByMachineInWindow(range.from, range.to) : undefined;

    // Live feed gone stale (no data today)? Fall back to the last day that DOES have data, so the
    // dashboard shows last-known values + statuses "as of <time>" instead of a wall of zeros.
    let stale = false;
    let lastUpdated: string | null = null;
    if (!range) {
      const latestDoc = (await TelemetryModel.findOne({}, { serverTs: 1 }).sort({ serverTs: -1 }).lean()) as { serverTs: Date } | null;
      const asOf = latestDoc ? new Date(latestDoc.serverTs) : null;
      if (asOf) {
        lastUpdated = asOf.toISOString();
        const noDataToday = !!winStart && asOf.getTime() < winStart.getTime();
        if (noDataToday || Date.now() - asOf.getTime() > STALE_MS) {
          stale = true;
          const ist = new Date(asOf.getTime() + IST_OFFSET);
          winStart = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET);
          winEnd = asOf;
          latest = await latestByMachineInWindow(winStart, asOf); // snapshot → as-recorded statuses
        }
      }
    }

    const views = await getScopedViews(user, latest);

    const running = views.filter((v) => v.status === 'running').length;
    const idle = views.filter((v) => v.status === 'idle').length;
    const stopped = views.filter((v) => v.status === 'stopped').length;

    const withState = views.filter((v) => v.state);
    // lifetime cumulative production (the "Total" sub-line on the card)
    const totalProduction = withState.reduce((s, v) => s + (v.state!.production || 0), 0);

    // per-machine windowed metrics = sum of positive counter increments over the window (handles
    // the daily/intra-day counter resets, so a multi-day range = the sum of its days).
    const ids = views.map((v) => v.machineId);
    const metricByMachine = winStart
      ? await windowMetrics(ids, winStart, winEnd)
      : new Map(views.filter((v) => v.state).map((v) => [v.machineId, { // no window → lifetime totals
          production: v.state!.production || 0, runningSec: v.state!.runningSec || 0, idleSec: v.state!.idleSec || 0,
          stoppedSec: v.state!.stoppedSec || 0, downtimeSec: v.state!.downtimeSec || 0,
        } as Cum]));

    // aggregate the windowed metrics across the scoped fleet
    let todayProduction = 0, runningSec = 0, idleSec = 0, stoppedSec = 0, downtimeSec = 0;
    for (const v of views) {
      const m = metricByMachine.get(v.machineId) || ZERO;
      todayProduction += m.production;
      runningSec += m.runningSec;
      idleSec += m.idleSec;
      stoppedSec += m.stoppedSec;
      downtimeSec += m.downtimeSec;
    }
    // time-weighted fleet efficiency (correct aggregate, not a mean of per-machine percentages)
    const activeSec = runningSec + idleSec + stoppedSec;
    const avgEfficiency = activeSec > 0 ? Math.round((runningSec / activeSec) * 100) : 0;

    // jobs (scoped by machine) + employees (scoped by department)
    const isAdmin = user.role === 'superAdmin' || user.role === 'admin' || user.role === 'plantHead';
    const scopedMachineIds = new Set(views.map((v) => v.machineId));
    const scopedDepts = new Set(views.map((v) => v.department));

    const allJobs = await JobModel.find().lean();
    const jobs = allJobs.filter((j) => isAdmin || (j.machineId && scopedMachineIds.has(String(j.machineId))));
    // "on the floor" = operator + supervisor login accounts within the viewer's scope
    const floor = await UserModel.find({ role: { $in: ['operator', 'supervisor'] }, isActive: { $ne: false } }).select('assignedMachineIds').lean();
    const employees = floor.filter((u) => isAdmin || (u.assignedMachineIds || []).some((m: string) => scopedMachineIds.has(String(m)))).length;

    // department roll-up: production summed, efficiency time-weighted — over the same window
    const deptStats = DEPARTMENTS.map((d) => {
      const ms = views.filter((v) => v.department === d);
      const cums = ms.map((v) => metricByMachine.get(v.machineId) || ZERO);
      const production = cums.reduce((s, m) => s + m.production, 0);
      const rsec = cums.reduce((s, m) => s + m.runningSec, 0);
      const asec = cums.reduce((s, m) => s + m.runningSec + m.idleSec + m.stoppedSec, 0);
      return { dept: d as Department, machines: ms.length, production, efficiency: asec > 0 ? Math.round((rsec / asec) * 100) : 0 };
    }).filter((d) => d.machines > 0);

    // per-machine windowed breakdown — drives the dashboard KPI drill-down modals
    const machineBreakdown: MachineBreakdown[] = views.map((v) => {
      const m = metricByMachine.get(v.machineId) || ZERO;
      const active = m.runningSec + m.idleSec + m.stoppedSec;
      return {
        machineId: v.machineId, code: v.code, name: v.name, department: v.department, status: v.status,
        production: m.production,
        productionTotal: v.state?.production || 0,
        runningSec: m.runningSec, idleSec: m.idleSec, stoppedSec: m.stoppedSec, downtimeSec: m.downtimeSec,
        efficiency: active > 0 ? Math.round((m.runningSec / active) * 100) : 0,
      };
    });

    const data: DashboardData = {
      totalMachines: views.length,
      running,
      idle,
      stopped,
      totalProduction,
      todayProduction,
      avgEfficiency,
      activeJobs: jobs.filter((j) => j.status === 'inProgress').length,
      alerts: stopped,
      employees,
      totalJobs: jobs.length,
      completedJobs: jobs.filter((j) => j.status === 'completed').length,
      pendingJobs: jobs.filter((j) => j.status === 'pending').length,
      runningSec,
      idleSec,
      stoppedSec,
      downtimeSec,
      deptStats,
      machineBreakdown,
      stale,
      lastUpdated,
    };
    return data;
}

router.get('/api/dashboard', async (req, res) => {
  try {
    const data = await getDashboard(req.user!, {
      from: req.query.from ? String(req.query.from) : undefined,
      to: req.query.to ? String(req.query.to) : undefined,
      dayStart: req.query.dayStart ? String(req.query.dayStart) : undefined,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

export default router;
