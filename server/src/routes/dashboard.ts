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
import { DashboardData, DEPARTMENTS, Department } from '@shared/types';

const router = Router();

// production counters are cumulative; output over a window = (counter at window end) − (counter at start).
// "start" = the last reading before the window; if none (machine first seen inside it), the window's
// earliest reading. Clamped at 0 so a counter reset/rollover can't make a window go negative.
function asNum(x: unknown): number | null {
  if (typeof x === 'number' && !isNaN(x)) return x;
  if (typeof x === 'string' && x.trim() !== '' && !isNaN(Number(x))) return Number(x);
  return null;
}
async function windowProduction(ids: string[], winStart: Date, winEnd: Date): Promise<number> {
  const proj = { 'data.production': 1, 'data.fabricLength': 1 } as const;
  const prodOf = (d: { data?: Record<string, unknown> } | null): number | null =>
    d ? (asNum(d.data?.production) ?? asNum(d.data?.fabricLength)) : null;
  const per = await Promise.all(
    ids.map(async (id) => {
      const [endDoc, baseDoc] = await Promise.all([
        TelemetryModel.findOne({ machineId: id, serverTs: { $lte: winEnd } }, proj).sort({ serverTs: -1 }).lean(),
        TelemetryModel.findOne({ machineId: id, serverTs: { $lt: winStart } }, proj).sort({ serverTs: -1 }).lean(),
      ]);
      const end = prodOf(endDoc as never);
      if (end == null) return 0;
      let start = prodOf(baseDoc as never);
      if (start == null) {
        const firstDoc = await TelemetryModel.findOne({ machineId: id, serverTs: { $gte: winStart, $lte: winEnd } }, proj).sort({ serverTs: 1 }).lean();
        start = prodOf(firstDoc as never);
      }
      if (start == null) return 0;
      return Math.max(0, end - start);
    })
  );
  return per.reduce((s, x) => s + x, 0);
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
    const totalProduction = withState.reduce((s, v) => s + (v.state!.production || 0), 0);

    // production within the active window: the selected day range, or "today" (from the
    // client's local midnight in ?dayStart=) up to now for the live view.
    const ds = req.query.dayStart ? new Date(String(req.query.dayStart)) : null;
    const winStart = range ? range.from : (ds && !isNaN(ds.getTime()) ? ds : null);
    const winEnd = range ? range.to : new Date();
    const todayProduction = winStart ? await windowProduction(views.map((v) => v.machineId), winStart, winEnd) : 0;

    const avgEfficiency = withState.length
      ? Math.round(withState.reduce((s, v) => s + (v.state!.efficiency || 0), 0) / withState.length)
      : 0;

    const runningSec = withState.reduce((s, v) => s + (v.state!.runningSec || 0), 0);
    const idleSec = withState.reduce((s, v) => s + (v.state!.idleSec || 0), 0);
    const stoppedSec = withState.reduce((s, v) => s + (v.state!.stoppedSec || 0), 0);
    const downtimeSec = withState.reduce((s, v) => s + (v.state!.downtimeSec || 0), 0);

    // jobs (scoped by machine) + employees (scoped by department)
    const isAdmin = req.user!.role === 'superAdmin' || req.user!.role === 'admin' || req.user!.role === 'plantHead';
    const scopedMachineIds = new Set(views.map((v) => v.machineId));
    const scopedDepts = new Set(views.map((v) => v.department));

    const allJobs = await JobModel.find().lean();
    const jobs = allJobs.filter((j) => isAdmin || (j.machineId && scopedMachineIds.has(String(j.machineId))));
    // "on the floor" = operator + supervisor login accounts within the viewer's scope
    const floor = await UserModel.find({ role: { $in: ['operator', 'supervisor'] }, isActive: { $ne: false } }).select('assignedMachineIds').lean();
    const employees = floor.filter((u) => isAdmin || (u.assignedMachineIds || []).some((m: string) => scopedMachineIds.has(String(m)))).length;

    const deptStats = DEPARTMENTS.map((d) => {
      const ms = views.filter((v) => v.department === d && v.state);
      const production = ms.reduce((s, v) => s + (v.state!.production || 0), 0);
      const efficiency = ms.length
        ? Math.round(ms.reduce((s, v) => s + (v.state!.efficiency || 0), 0) / ms.length)
        : 0;
      return { dept: d as Department, machines: views.filter((v) => v.department === d).length, production, efficiency };
    }).filter((d) => d.machines > 0);

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
    };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

export default router;
