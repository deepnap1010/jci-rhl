// ============================================================
//  ALERTS ROUTE  —  role-scoped machine-health alerts
//  GET  /api/alerts                     → { alerts, counts }  (acked ones hidden)
//  POST /api/alerts/acknowledge         → archive one alert into the inbox + hide it
//  POST /api/alerts/acknowledge-all     → acknowledge every current alert
//
//  Acknowledging an alert writes a READ Notification (refType:'alert', refId:<id>)
//  so it shows up in the user's Notification history, AND hides the live alert from
//  the bell — until a NEWER reading recurs (alert.ts > ack time), when it re-alerts.
// ============================================================
import { Router } from 'express';
import { getScopedViews } from '../lib/derive';
import { JobModel } from '../models/Job';
import { NotificationModel } from '../models/Notification';
import { computeAlerts, alertCounts, JobLite, Alert } from '../lib/alerts';
import type { User } from '@shared/types';

const router = Router();

// the Notification model's audience enum (employee → coerced to a safe value)
const ALERT_AUDIENCE = new Set(['operator', 'supervisor', 'prodManager', 'plantHead', 'superAdmin', 'admin']);

function mineFilter(user: User) {
  const or: Record<string, unknown>[] = [{ recipientUserId: user._id }];
  if (user.email) or.push({ email: String(user.email).toLowerCase().trim() });
  return { $or: or };
}

// current (live) alerts for a user, from the same scoped views the dashboards use
async function currentAlerts(user: User): Promise<Alert[]> {
  const views = await getScopedViews(user);
  const jobs = await JobModel.find().lean();
  const jobByMachine = new Map<string, JobLite & { status?: string }>();
  for (const j of jobs) {
    if (!j.machineId) continue;
    const ex = jobByMachine.get(j.machineId);
    if (!ex || (j.status === 'inProgress' && ex.status !== 'inProgress')) {
      jobByMachine.set(j.machineId, { jobNumber: j.jobNumber, targetProduction: j.targetProduction || 0, status: j.status });
    }
  }
  return computeAlerts(views, jobByMachine);
}

// write/refresh the READ "acknowledged alert" notification (archived in the inbox)
function ackUpdate(user: User, a: { id: string; severity?: string; machineId?: string | null; machineCode?: string; title?: string; detail?: string }) {
  return {
    filter: { recipientUserId: user._id, refType: 'alert', alertKey: a.id },
    update: {
      $set: {
        read: true,
        readAt: new Date(),
        email: (user.email || '').toLowerCase(),
        audience: ALERT_AUDIENCE.has(user.role) ? user.role : 'operator',
        type: 'alert',
        refType: 'alert',
        alertKey: a.id,
        severity: a.severity === 'critical' || a.severity === 'warning' ? a.severity : 'info',
        machineId: a.machineId ?? null,
        machineCode: a.machineCode || '',
        title: a.title || 'Machine alert',
        body: a.detail || '',
      },
    },
    upsert: true,
  };
}

// Acknowledge ALL of one machine's current alerts for a user — used when they resolve that
// machine's downtime, so the bell badge drops too. (Archived in history; re-alerts on recurrence.)
export async function ackMachineAlerts(user: User, machineId: string): Promise<void> {
  const forMachine = (await currentAlerts(user)).filter((a) => a.machineId === machineId);
  if (!forMachine.length) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await NotificationModel.bulkWrite(forMachine.map((a) => ({ updateOne: ackUpdate(user, a) })) as any);
}

router.get('/api/alerts', async (req, res) => {
  try {
    const all = await currentAlerts(req.user!);
    // suppress alerts the user acknowledged — unless a NEWER reading has occurred since the ack
    const acks = await NotificationModel.find({ ...mineFilter(req.user!), refType: 'alert' }).select('alertKey readAt').lean();
    const ackAt = new Map<string, number>();
    for (const a of acks) {
      const t = (a as { readAt?: Date }).readAt ? new Date((a as { readAt: Date }).readAt).getTime() : 0;
      ackAt.set(String((a as { alertKey?: unknown }).alertKey), t);
    }
    const alerts = all.filter((a) => {
      const t = ackAt.get(a.id);
      return !(t && new Date(a.ts).getTime() <= t); // acked at/after this reading → hide
    });
    res.json({ alerts, counts: alertCounts(alerts) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load alerts' });
  }
});

router.post('/api/alerts/acknowledge', async (req, res) => {
  try {
    const b = req.body ?? {};
    const id = String(b.id || '').trim();
    if (!id) return res.status(400).json({ error: 'alert id is required' });
    const op = ackUpdate(req.user!, b);
    await NotificationModel.updateOne(op.filter, op.update, { upsert: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to acknowledge alert', detail: String(err) });
  }
});

router.post('/api/alerts/acknowledge-all', async (req, res) => {
  try {
    const all = await currentAlerts(req.user!);
    if (all.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await NotificationModel.bulkWrite(all.map((a) => ({ updateOne: ackUpdate(req.user!, a) })) as any);
    }
    res.json({ ok: true, acknowledged: all.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to acknowledge alerts', detail: String(err) });
  }
});

export default router;
