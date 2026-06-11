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
import { DashboardData, MachineBreakdown, DEPARTMENTS, Department } from '@shared/types';

const router = Router();

// Telemetry counters (production meters, run/idle/stopped/downtime seconds) are CUMULATIVE
// lifetime totals. A timeframe's value is therefore a delta:
//   value(window) = (counter at the window's latest reading) − (last counter before it started)
// clamped at 0 so a counter reset/rollover can never make a window go negative. Efficiency is
// time-weighted from those windowed seconds (runningSec / active), not a mean of per-machine %.
type Cum = { production: number; runningSec: number; idleSec: number; stoppedSec: number; downtimeSec: number };
const ZERO: Cum = { production: 0, runningSec: 0, idleSec: 0, stoppedSec: 0, downtimeSec: 0 };

function asNum(x: unknown): number | null {
  if (typeof x === 'number' && !isNaN(x)) return x;
  if (typeof x === 'string' && x.trim() !== '' && !isNaN(Number(x))) return Number(x);
  return null;
}
function pick(data: Record<string, unknown> | undefined, keys: string[]): number {
  if (!data) return 0;
  for (const k of keys) { const v = asNum(data[k]); if (v != null) return v; }
  return 0;
}
// cumulative counters out of a raw telemetry blob (the day-start baseline)
function cumFromData(data?: Record<string, unknown>): Cum {
  const idleSec = pick(data, ['idleSeconds']);
  const stoppedSec = pick(data, ['stoppedSeconds']);
  return {
    production: pick(data, ['production', 'fabricLength', 'counter']),
    runningSec: pick(data, ['runningSeconds']),
    idleSec,
    stoppedSec,
    downtimeSec: pick(data, ['downtimeSeconds']) || idleSec + stoppedSec,
  };
}

router.get('/api/dashboard', async (req, res) => {
  try {
    // optional ?from=&to= → historical dashboard (each machine's latest reading in the window)
    const f = req.query.from ? new Date(String(req.query.from)) : null;
    const t = req.query.to ? new Date(String(req.query.to)) : null;
    const range = f && t && !isNaN(f.getTime()) && !isNaN(t.getTime()) ? { from: f, to: t } : null;
    const latest = range ? await latestByMachineInWindow(range.from, range.to) : undefined;
    const views = await getScopedViews(req.user!, latest);

    const running = views.filter((v) => v.status === 'running').length;
    const idle = views.filter((v) => v.status === 'idle').length;
    const stopped = views.filter((v) => v.status === 'stopped').length;

    const withState = views.filter((v) => v.state);
    // lifetime cumulative production (the "Total" sub-line on the card)
    const totalProduction = withState.reduce((s, v) => s + (v.state!.production || 0), 0);

    // active window: a selected day range, or "today" (client's local midnight in ?dayStart=)
    // up to now for the live view. v.state already holds the counter at the window's latest reading.
    const ds = req.query.dayStart ? new Date(String(req.query.dayStart)) : null;
    const winStart = range ? range.from : (ds && !isNaN(ds.getTime()) ? ds : null);

    // per-machine windowed delta = latest counters − counters just before the window started
    const metricByMachine = new Map<string, Cum>();
    await Promise.all(views.map(async (v) => {
      if (!v.state) { metricByMachine.set(v.machineId, ZERO); return; }
      const end: Cum = {
        production: v.state.production || 0,
        runningSec: v.state.runningSec || 0,
        idleSec: v.state.idleSec || 0,
        stoppedSec: v.state.stoppedSec || 0,
        downtimeSec: v.state.downtimeSec || 0,
      };
      if (!winStart) { metricByMachine.set(v.machineId, end); return; } // no window → lifetime totals
      const baseDoc = await TelemetryModel.findOne({ machineId: v.machineId, serverTs: { $lt: winStart } }, { data: 1 })
        .sort({ serverTs: -1 }).lean();
      const base = baseDoc ? cumFromData((baseDoc as { data?: Record<string, unknown> }).data) : ZERO;
      // reset-aware delta: counters reset to 0 mid-day (CBR-02's runningSeconds went 15716→7831).
      // When the current value dropped below the baseline, the counter reset, so the window's
      // value is what's accumulated since the reset (≈ the current value), not a clamped 0.
      const delta = (e: number, b: number) => Math.max(0, e >= b ? e - b : e);
      metricByMachine.set(v.machineId, {
        production: delta(end.production, base.production),
        runningSec: delta(end.runningSec, base.runningSec),
        idleSec: delta(end.idleSec, base.idleSec),
        stoppedSec: delta(end.stoppedSec, base.stoppedSec),
        downtimeSec: delta(end.downtimeSec, base.downtimeSec),
      });
    }));

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
    const isAdmin = req.user!.role === 'superAdmin' || req.user!.role === 'admin' || req.user!.role === 'plantHead';
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
    };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

export default router;
