// ============================================================
//  JOBS ROUTE  —  Job Tracking
//  Jobs reference machines by string machineId. Achieved
//  production is read live from the machine's latest telemetry.
// ============================================================
import { Router } from 'express';
import { JobModel } from '../models/Job';
import { UserModel } from '../models/User';
import { getScopedViews, machineCodesInScope } from '../lib/derive';
import { notifyJobAssignees } from '../lib/jobNotify';
import { can } from '@shared/permissions';

const router = Router();

// Gate a write: the actor must be allowed to assign jobs, and (if a machine is
// targeted) that machine must be within their scope. Production Head / Super
// Admin see all; Production Manager is limited to their lines; Supervisor to
// their machines; Operators can't assign at all.
async function assertCanAssign(req: import('express').Request, res: import('express').Response, machineId?: unknown): Promise<boolean> {
  if (!can(req.user!.role, 'assignJobs')) {
    res.status(403).json({ error: 'Your role is not allowed to assign or configure jobs' });
    return false;
  }
  if (machineId) {
    const scope = await machineCodesInScope(req.user!);
    if (scope !== 'all' && !scope.has(String(machineId))) {
      res.status(403).json({ error: 'That machine is outside the area you manage' });
      return false;
    }
  }
  return true;
}

const pct = (a: number, t: number) => (!t || t <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((a / t) * 100))));

// Auto-generate the next sequential job number (JOB-#####). Manual entry
// risks collisions; this derives the next from the highest existing number.
// Callers retry on the unique-index error, which is the ultimate guard.
async function nextJobNumber(): Promise<string> {
  const jobs = await JobModel.find({}, { jobNumber: 1 }).lean();
  let max = 10000;
  for (const j of jobs) {
    const m = /^JOB-(\d+)$/.exec(j.jobNumber || '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `JOB-${max + 1}`;
}

router.get('/api/jobs', async (req, res) => {
  try {
    const views = await getScopedViews(req.user!);
    const scopedIds = new Set(views.map((v) => v.machineId));
    const prodBy = new Map(views.map((v) => [v.machineId, v.state?.production || 0]));

    const isAdmin = req.user!.role === 'superAdmin' || req.user!.role === 'admin' || req.user!.role === 'plantHead';
    const all = await JobModel.find().sort({ updatedAt: -1 }).lean();
    const jobs = all.filter((j) => isAdmin || (j.machineId && scopedIds.has(String(j.machineId))));

    const people = await UserModel.find().select('name').lean();
    const nameById = new Map(people.map((u) => [String(u._id), u.name]));

    const rows = jobs.map((j) => {
      const live = j.machineId ? prodBy.get(String(j.machineId)) : undefined;
      const achieved = live !== undefined ? live : j.achievedProduction || 0;
      return {
        _id: String(j._id),
        jobNumber: j.jobNumber,
        orderNumber: j.orderNumber,
        fabricName: j.fabricName,
        stage: j.stage,
        targetProduction: j.targetProduction || 0,
        achievedProduction: achieved,
        pct: pct(achieved, j.targetProduction || 0),
        status: j.status,
        machineId: j.machineId || null,
        machineCode: j.machineId || null,
        operatorName: j.operatorId ? nameById.get(String(j.operatorId)) ?? null : null,
        supervisorName: j.supervisorId ? nameById.get(String(j.supervisorId)) ?? null : null,
        operatorId: j.operatorId ? String(j.operatorId) : null,
        supervisorId: j.supervisorId ? String(j.supervisorId) : null,
        batchId: j.batchId || '',
        processType: j.processType || '',
        loadedAt: j.loadedAt ? new Date(j.loadedAt).toISOString() : null,
        shift: j.shift || 'A',
      };
    });

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load jobs' });
  }
});

router.post('/api/jobs', async (req, res) => {
  try {
    const b = req.body ?? {};
    if (!(await assertCanAssign(req, res, b.machineId))) return;
    if (!b.orderNumber || !b.fabricName || !b.stage) {
      return res.status(400).json({ error: 'orderNumber, fabricName and stage are required' });
    }
    const base = {
      orderNumber: b.orderNumber,
      fabricName: b.fabricName,
      stage: b.stage,
      targetProduction: Number(b.targetProduction) || 0,
      achievedProduction: Number(b.achievedProduction) || 0,
      status: b.status || 'pending',
      machineId: b.machineId || undefined, // string machine code
      operatorId: b.operatorId || undefined,
      supervisorId: b.supervisorId || undefined,
      shift: b.shift || 'A',
    };
    // job number is assigned automatically; retry if a concurrent create took it
    for (let attempt = 0; attempt < 6; attempt++) {
      const jobNumber = await nextJobNumber();
      try {
        const job = await JobModel.create({ jobNumber, ...base });
        // notify the assigned operator / supervisor (in-app + email)
        notifyJobAssignees(req.app.get('io'), job.toObject(), {
          notifyOperator: !!base.operatorId,
          notifySupervisor: !!base.supervisorId,
        }).catch(() => {});
        return res.json({ ok: true, id: job._id, jobNumber });
      } catch (e) {
        if ((e as { code?: number })?.code === 11000) continue; // collision → next number
        throw e;
      }
    }
    return res.status(500).json({ error: 'Could not allocate a unique job number, please retry' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create job', detail: String(err) });
  }
});

// PUT /api/jobs/by-machine/:machineId  → upsert the machine's job (Configure modal)
// One active job per machine: updates it in place, or creates it if none exists.
router.put('/api/jobs/by-machine/:machineId', async (req, res) => {
  try {
    const machineId = req.params.machineId;
    if (!(await assertCanAssign(req, res, machineId))) return;
    const b = req.body ?? {};
    const fields = {
      orderNumber: b.orderNumber ? String(b.orderNumber) : '—',
      fabricName: b.fabricName ? String(b.fabricName) : '—',
      stage: b.stage, // a valid Department (enum-validated by the model)
      targetProduction: Number(b.targetProduction) || 0,
      status: b.status || 'inProgress',
      machineId,
      operatorId: b.operatorId || null,
      supervisorId: b.supervisorId || null,
      batchId: b.batchId || '',
      processType: b.processType || '',
      loadedAt: b.loadedAt ? new Date(b.loadedAt) : null,
      shift: b.shift || 'A',
    };
    // one job per machine: update in place (keep its number), else create with an auto number
    const existing = await JobModel.findOne({ machineId });
    if (existing) {
      // only notify people who were NEWLY assigned (avoid spamming on every save)
      const oldOp = existing.get('operatorId') ? String(existing.get('operatorId')) : '';
      const oldSup = existing.get('supervisorId') ? String(existing.get('supervisorId')) : '';
      const newOp = fields.operatorId ? String(fields.operatorId) : '';
      const newSup = fields.supervisorId ? String(fields.supervisorId) : '';
      await JobModel.updateOne({ _id: existing._id }, { $set: fields });
      notifyJobAssignees(
        req.app.get('io'),
        { _id: existing._id, jobNumber: existing.get('jobNumber'), ...fields },
        { notifyOperator: !!newOp && newOp !== oldOp, notifySupervisor: !!newSup && newSup !== oldSup }
      ).catch(() => {});
      return res.json({ ok: true, id: existing._id, jobNumber: existing.get('jobNumber') });
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      const jobNumber = await nextJobNumber();
      try {
        const job = await JobModel.create({ jobNumber, ...fields });
        notifyJobAssignees(req.app.get('io'), job.toObject(), {
          notifyOperator: !!fields.operatorId,
          notifySupervisor: !!fields.supervisorId,
        }).catch(() => {});
        return res.json({ ok: true, id: job._id, jobNumber });
      } catch (e) {
        if ((e as { code?: number })?.code === 11000) continue; // collision → next number
        throw e;
      }
    }
    return res.status(500).json({ error: 'Could not allocate a unique job number, please retry' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save configuration', detail: String(err) });
  }
});

router.patch('/api/jobs/:id', async (req, res) => {
  try {
    const b = req.body ?? {};
    const set: Record<string, unknown> = {};
    for (const k of ['stage', 'status', 'targetProduction', 'achievedProduction', 'machineId', 'operatorId', 'supervisorId']) {
      if (b[k] !== undefined) set[k] = b[k];
    }
    const before = await JobModel.findById(req.params.id).lean();
    if (!(await assertCanAssign(req, res, (b.machineId ?? before?.machineId) || undefined))) return;
    await JobModel.updateOne({ _id: req.params.id }, set);
    const after = await JobModel.findById(req.params.id).lean();
    if (after) {
      const oldOp = before?.operatorId ? String(before.operatorId) : '';
      const oldSup = before?.supervisorId ? String(before.supervisorId) : '';
      const newOp = after.operatorId ? String(after.operatorId) : '';
      const newSup = after.supervisorId ? String(after.supervisorId) : '';
      notifyJobAssignees(req.app.get('io'), after, {
        notifyOperator: !!newOp && newOp !== oldOp,
        notifySupervisor: !!newSup && newSup !== oldSup,
      }).catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update job' });
  }
});

export default router;
