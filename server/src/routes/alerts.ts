// ============================================================
//  ALERTS ROUTE  —  role-scoped health alerts
//  GET /api/alerts → { alerts, counts }
//  Built from the same scoped views the dashboards use, joined
//  with each machine's current job for target/pace alerts.
// ============================================================
import { Router } from 'express';
import { getScopedViews } from '../lib/derive';
import { JobModel } from '../models/Job';
import { computeAlerts, alertCounts, JobLite } from '../lib/alerts';

const router = Router();

router.get('/api/alerts', async (req, res) => {
  try {
    const views = await getScopedViews(req.user!);
    const jobs = await JobModel.find().lean();
    const jobByMachine = new Map<string, JobLite & { status?: string }>();
    for (const j of jobs) {
      if (!j.machineId) continue;
      const ex = jobByMachine.get(j.machineId);
      // prefer an in-progress job when a machine has several
      if (!ex || (j.status === 'inProgress' && ex.status !== 'inProgress')) {
        jobByMachine.set(j.machineId, { jobNumber: j.jobNumber, targetProduction: j.targetProduction || 0, status: j.status });
      }
    }
    const alerts = computeAlerts(views, jobByMachine);
    res.json({ alerts, counts: alertCounts(alerts) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load alerts' });
  }
});

export default router;
