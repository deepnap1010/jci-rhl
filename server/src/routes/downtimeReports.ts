// ============================================================
//  DOWNTIME REPORTS ROUTE  —  operator-reported idle + escalation
//  POST   /api/downtime-reports             operator reports idle + reason
//  GET    /api/downtime-reports             role-scoped list
//  POST   /api/downtime-reports/:id/acknowledge   supervisor/plant head acks
//  POST   /api/downtime-reports/:id/resolve       machine back up
// ============================================================
import { Router } from 'express';
import { DowntimeReportModel } from '../models/DowntimeReport';
import { NotificationModel } from '../models/Notification';
import { UserModel } from '../models/User';
import { MachineModel } from '../models/Machine';
import { departmentFor } from '../lib/derive';
import { supervisorDelayMs } from '../lib/escalation';
import { ackMachineAlerts } from './alerts';
import { nudge, notifyUserLive } from '../lib/live';
import { can } from '@shared/permissions';

const router = Router();

interface ChainLink { userId: unknown; role: string; name: string; email: string }

// Walk the org chart upward from a user: supervisor → production manager →
// production head → super admin. Cycle-guarded and depth-capped.
async function buildManagerChain(startUserId: unknown): Promise<ChainLink[]> {
  const chain: ChainLink[] = [];
  const seen = new Set([String(startUserId)]);
  let cur = await UserModel.findById(startUserId as string).lean();
  let guard = 0;
  while (cur && (cur as { managerId?: unknown }).managerId && guard++ < 8) {
    const mid = String((cur as { managerId: unknown }).managerId);
    if (seen.has(mid)) break;
    seen.add(mid);
    const mgr = await UserModel.findById(mid).lean();
    if (!mgr) break;
    chain.push({ userId: mgr._id, role: String(mgr.role), name: mgr.name || '', email: (mgr.email || '').toLowerCase() });
    cur = mgr;
  }
  return chain;
}

function toRow(r: Record<string, any>) {
  return {
    _id: String(r._id),
    machineId: r.machineId,
    machineCode: r.machineCode || r.machineId,
    department: r.department || '',
    reason: r.reason,
    note: r.note || '',
    status: r.status,
    operatorId: r.operatorId ? String(r.operatorId) : null,
    operatorName: r.operatorName || '',
    supervisorId: r.supervisorId ? String(r.supervisorId) : null,
    plantHeadId: r.plantHeadId ? String(r.plantHeadId) : null,
    startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null,
    supervisorNotifiedAt: r.supervisorNotifiedAt ? new Date(r.supervisorNotifiedAt).toISOString() : null,
    level: r.level || 0,
    escalatedToName: r.escalatedToName || null,
    acknowledgedAt: r.acknowledgedAt ? new Date(r.acknowledgedAt).toISOString() : null,
    acknowledgedByName: r.acknowledgedByName || null,
    escalatedAt: r.escalatedAt ? new Date(r.escalatedAt).toISOString() : null,
    resolvedAt: r.resolvedAt ? new Date(r.resolvedAt).toISOString() : null,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
  };
}

// Operator reports a machine idle/stopped with a reason. We snapshot the
// operator's org chain (supervisor → plant head) so escalation is deterministic.
router.post('/api/downtime-reports', async (req, res) => {
  try {
    if (!can(req.user!.role, 'reportDowntime')) return res.status(403).json({ error: 'Your role cannot report downtime' });
    const b = req.body ?? {};
    const machineId = String(b.machineId || '').trim();
    const reason = String(b.reason || '').trim();
    if (!machineId || !reason) return res.status(400).json({ error: 'machineId and reason are required' });

    // resolve the FULL management chain above this operator
    const me = await UserModel.findById(req.user!._id).lean();
    const chain = await buildManagerChain(req.user!._id);
    const supervisorId = chain[0]?.userId || null; // immediate manager (usually the supervisor)
    const plantHeadId = chain.find((c) => c.role === 'plantHead')?.userId || null;

    const machine = await MachineModel.findOne({ machineId }).lean();
    const machineCode = (machine as { machineId?: string } | null)?.machineId || machineId;
    const department = departmentFor({}, (machine as { type?: string } | null)?.type);

    // avoid duplicate open reports for the same machine
    const open = await DowntimeReportModel.findOne({ machineId, status: { $in: ['open', 'escalated'] } });
    if (open) return res.status(409).json({ error: 'There is already an open downtime report for this machine', id: String(open._id) });

    const report = await DowntimeReportModel.create({
      machineId,
      machineCode,
      department,
      reason,
      note: String(b.note || '').trim(),
      status: 'open',
      operatorId: req.user!._id,
      operatorName: req.user!.name || me?.name || '',
      supervisorId,
      plantHeadId,
      chain,
      level: 0,
      // first level (the immediate manager) is notified after the supervisor delay
      nextEscalateAt: new Date(Date.now() + supervisorDelayMs()),
      startedAt: new Date(),
    });

    res.json({ ok: true, id: report._id, report: toRow(report.toObject()) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to report downtime', detail: String(err) });
  }
});

router.get('/api/downtime-reports', async (req, res) => {
  try {
    const role = req.user!.role;
    const me = req.user!._id;
    let filter: Record<string, unknown> = {};
    if (role === 'superAdmin' || role === 'admin') {
      filter = {}; // full visibility
    } else if (role === 'operator' || role === 'employee') {
      filter = { operatorId: me }; // their own reports
    } else {
      // any manager (supervisor / production manager / production head) sees reports
      // where they appear anywhere in the escalation chain, plus their own
      filter = { $or: [{ 'chain.userId': me }, { operatorId: me }] };
    }
    const rows = await DowntimeReportModel.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ reports: rows.map(toRow) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load downtime reports' });
  }
});

router.post('/api/downtime-reports/:id/acknowledge', async (req, res) => {
  try {
    if (!can(req.user!.role, 'acknowledgeDowntime')) return res.status(403).json({ error: 'Not allowed to acknowledge' });
    const report = await DowntimeReportModel.findById(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (report.get('status') === 'resolved') return res.status(400).json({ error: 'Report already resolved' });
    // only a manager in this report's chain (or an admin) may acknowledge it
    const me = String(req.user!._id);
    const inChain = (report.get('chain') as { userId?: unknown }[] | undefined)?.some((c) => String(c.userId) === me);
    const isAdmin = req.user!.role === 'superAdmin' || req.user!.role === 'admin';
    if (!isAdmin && !inChain) return res.status(403).json({ error: 'This report is not in your chain' });

    report.set('status', 'acknowledged');
    report.set('acknowledgedAt', new Date());
    report.set('acknowledgedBy', req.user!._id);
    report.set('acknowledgedByName', req.user!.name || '');
    await report.save();

    // clear the related action notifications
    await NotificationModel.updateMany(
      { refType: 'downtimeReport', refId: report._id },
      { $set: { read: true, readAt: new Date() } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to acknowledge', detail: String(err) });
  }
});

router.post('/api/downtime-reports/:id/resolve', async (req, res) => {
  try {
    const report = await DowntimeReportModel.findById(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    const machineId = report.get('machineId');
    // Resolve THIS report AND any other still-open reports for the same machine, so stale
    // duplicates can't make the idle banner reappear after a refresh.
    const open = await DowntimeReportModel.find(
      { machineId, status: { $in: ['open', 'escalated', 'acknowledged'] } },
      { _id: 1 }
    ).lean();
    const ids = open.map((r) => r._id);
    if (!ids.some((x) => String(x) === String(report._id))) ids.push(report._id);
    await DowntimeReportModel.updateMany(
      { _id: { $in: ids } },
      { $set: { status: 'resolved', resolvedAt: new Date() } }
    );
    await NotificationModel.updateMany(
      { refType: 'downtimeReport', refId: { $in: ids } },
      { $set: { read: true, readAt: new Date() } }
    );
    // also acknowledge this machine's health alerts for the resolver, so the bell badge drops,
    // and nudge their live views to refresh instantly.
    try { await ackMachineAlerts(req.user!, String(machineId)); } catch { /* best-effort */ }
    const io = req.app.get('io');
    notifyUserLive(io, String(req.user!._id)); // refresh the bell's notifications
    nudge(io, String(machineId));              // refresh the bell's alerts
    res.json({ ok: true, resolved: ids.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve', detail: String(err) });
  }
});

export default router;
