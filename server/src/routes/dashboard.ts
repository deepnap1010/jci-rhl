// ============================================================
//  DASHBOARD ROUTE
//  KPI summary, role-scoped. Built from derived machine views +
//  jobs + employees. Time/downtime KPIs come from the PLC's own
//  per-machine counters in the latest telemetry.
// ============================================================
import { Router } from 'express';
import { JobModel } from '../models/Job';
import { UserModel } from '../models/User';
import { getScopedViews, latestByMachineInWindow } from '../lib/derive';
import { DashboardData, DEPARTMENTS, Department } from '@shared/types';

const router = Router();

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
