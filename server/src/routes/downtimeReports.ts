// ════════════════════════════════════════════════════════════════
//  📁 FILE PATH : smartfactory/server/src/routes/downtimeReports.ts
//  ⚙️  ACTION    : REPLACE existing file (full overwrite)
// ════════════════════════════════════════════════════════════════

// ============================================================
//  DOWNTIME REPORTS ROUTE  —  operator-reported idle + escalation
//  POST   /api/downtime-reports                   operator reports idle + reason(s)
//  GET    /api/downtime-reports                   role-scoped list
//  GET    /api/downtime-reports/pending           my machines' prompts awaiting a reason
//  POST   /api/downtime-reports/:id/reason        operator answers the auto-prompt (checkboxes)
//  POST   /api/downtime-reports/:id/acknowledge   any manager in the chain acks
//  POST   /api/downtime-reports/:id/resolve       machine back up
//
//  Escalation model: the supervisor is notified IMMEDIATELY once a
//  reason exists (nextEscalateAt = now → the 30s sweep delivers it),
//  then every ESCALATE_STEP_SEC the next manager up the chain is
//  notified until someone acknowledges — all the way to the top.
// ============================================================
import { Router } from 'express';
import { DowntimeReportModel } from '../models/DowntimeReport';
import { NotificationModel } from '../models/Notification';
import { UserModel } from '../models/User';
import { MachineModel } from '../models/Machine';
import { departmentFor } from '../lib/derive';
import { buildManagerChain } from '../lib/escalation';
import { ackMachineAlerts } from './alerts';
import { nudge, notifyUserLive, ROOM } from '../lib/live';
import { can } from '@shared/permissions';
import { validReasons, reasonsToText, OTHER_REASON } from '@shared/downtimeReasons';

const router = Router();

function toRow(r: Record<string, any>) {
  return {
    _id: String(r._id),
    machineId: r.machineId,
    machineCode: r.machineCode || r.machineId,
    department: r.department || '',
    reason: r.reason,
    reasons: r.reasons || [],
    otherText: r.otherText || '',
    note: r.note || '',
    source: r.source || 'manual',
    status: r.status,
    operatorId: r.operatorId ? String(r.operatorId) : null,
    operatorName: r.operatorName || '',
    supervisorId: r.supervisorId ? String(r.supervisorId) : null,
    plantHeadId: r.plantHeadId ? String(r.plantHeadId) : null,
    startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null,
    promptedAt: r.promptedAt ? new Date(r.promptedAt).toISOString() : null,
    reasonSubmittedAt: r.reasonSubmittedAt ? new Date(r.reasonSubmittedAt).toISOString() : null,
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

// ─── PENDING PROMPTS (the auto-popup's data source) ─────────
// Reports on MY machines still awaiting a reason. Keyed to the user's
// assigned machines (not just operatorId) so any operator covering that
// machine — e.g. a shift change — can answer the prompt. Survives refresh:
// the client re-fetches this on load and re-opens the modal.
router.get('/api/downtime-reports/pending', async (req, res) => {
  try {
    if (!can(req.user!.role, 'reportDowntime')) return res.json({ reports: [] });
    const mine = req.user!.assignedMachineIds || [];
    const rows = await DowntimeReportModel.find({
      status: 'awaitingReason',
      $or: [{ operatorId: req.user!._id }, { machineId: { $in: mine } }],
    }).sort({ createdAt: 1 }).limit(10).lean();
    res.json({ reports: rows.map(toRow) });
  } catch {
    res.status(500).json({ error: 'Failed to load pending prompts' });
  }
});

// ─── ANSWER THE PROMPT (checkbox reasons + Other) ───────────
router.post('/api/downtime-reports/:id/reason', async (req, res) => {
  try {
    if (!can(req.user!.role, 'reportDowntime')) return res.status(403).json({ error: 'Your role cannot report downtime' });
    const report = await DowntimeReportModel.findById(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (report.get('status') !== 'awaitingReason') {
      return res.status(400).json({ error: 'This report is not awaiting a reason' });
    }

    // only an operator of this machine (or the prompted operator, or an admin) may answer
    const me = String(req.user!._id);
    const isAdmin = req.user!.role === 'superAdmin' || req.user!.role === 'admin';
    const myMachine = (req.user!.assignedMachineIds || []).includes(String(report.get('machineId')));
    const isPrompted = String(report.get('operatorId') || '') === me;
    if (!isAdmin && !myMachine && !isPrompted) {
      return res.status(403).json({ error: 'This machine is not assigned to you' });
    }

    const b = req.body ?? {};
    const reasons: string[] = Array.isArray(b.reasons) ? b.reasons.map((x: unknown) => String(x)) : [];
    const otherText = String(b.otherText || '').trim();
    if (!validReasons(reasons)) return res.status(400).json({ error: 'Select at least one valid reason' });
    if (reasons.includes(OTHER_REASON) && !otherText) {
      return res.status(400).json({ error: 'Please describe the reason for "Other"' });
    }

    // if a DIFFERENT operator answered (shift change), rebuild the chain from them
    let chain = report.get('chain') as unknown[];
    if (!isPrompted) {
      const fresh = await buildManagerChain(req.user!._id);
      if (fresh.length) {
        chain = fresh as unknown[];
        report.set('chain', fresh);
        report.set('supervisorId', fresh[0]?.userId || null);
        report.set('plantHeadId', fresh.find((c) => c.role === 'plantHead')?.userId || null);
      }
      report.set('operatorId', req.user!._id);
      report.set('operatorName', req.user!.name || '');
    }

    const level = (report.get('level') as number) || 0;
    report.set('reasons', reasons);
    report.set('otherText', otherText);
    report.set('reason', reasonsToText(reasons, otherText));
    if (b.note) report.set('note', String(b.note).trim());
    report.set('reasonSubmittedAt', new Date());
    report.set('status', level >= 2 ? 'escalated' : 'open');
    // supervisor not yet alerted → alert them NOW (the 30s sweep delivers it).
    // already alerted (grace expired) → keep the current schedule; the next
    // escalation carries the submitted reason automatically.
    if (level === 0) report.set('nextEscalateAt', new Date());
    await report.save();

    // clear the operator-side prompt notifications + close the modal on all their tabs
    await NotificationModel.updateMany(
      { refType: 'downtimeReport', refId: report._id, audience: 'operator' },
      { $set: { read: true, readAt: new Date() } }
    );
    const io = req.app.get('io');
    io?.to(ROOM.user(me)).emit('downtime:prompt:clear', { reportId: String(report._id), machineId: report.get('machineId') });
    notifyUserLive(io, me);

    res.json({ ok: true, report: toRow(report.toObject()) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit reason' });
  }
});

// ─── MANUAL REPORT ("Report idle" button) ───────────────────
// Accepts BOTH shapes: legacy { reason } and new { reasons: [], otherText }.
// We snapshot the operator's full org chain so escalation is deterministic.
router.post('/api/downtime-reports', async (req, res) => {
  try {
    if (!can(req.user!.role, 'reportDowntime')) return res.status(403).json({ error: 'Your role cannot report downtime' });
    const b = req.body ?? {};
    const machineId = String(b.machineId || '').trim();
    const reasons: string[] = Array.isArray(b.reasons) ? b.reasons.map((x: unknown) => String(x)) : [];
    const otherText = String(b.otherText || '').trim();
    const singleReason = String(b.reason || '').trim();
    const reasonDisplay = reasons.length ? reasonsToText(reasons, otherText) : singleReason;
    if (!machineId || !reasonDisplay) return res.status(400).json({ error: 'machineId and reason are required' });
    if (reasons.includes(OTHER_REASON) && !otherText) {
      return res.status(400).json({ error: 'Please describe the reason for "Other"' });
    }

    // resolve the FULL management chain above this operator
    const me = await UserModel.findById(req.user!._id).lean();
    const chain = await buildManagerChain(req.user!._id);
    const supervisorId = chain[0]?.userId || null; // immediate manager (usually the supervisor)
    const plantHeadId = chain.find((c) => c.role === 'plantHead')?.userId || null;

    const machine = await MachineModel.findOne({ machineId }).lean();
    const machineCode = (machine as { machineId?: string } | null)?.machineId || machineId;
    const department = departmentFor({}, (machine as { type?: string } | null)?.type);

    // avoid duplicate open reports for the same machine
    const open = await DowntimeReportModel.findOne({ machineId, status: { $in: ['awaitingReason', 'open', 'escalated'] } });
    if (open) return res.status(409).json({ error: 'There is already an open downtime report for this machine', id: String(open._id) });

    const report = await DowntimeReportModel.create({
      machineId,
      machineCode,
      department,
      reason: reasonDisplay,
      reasons,
      otherText,
      note: String(b.note || '').trim(),
      source: 'manual',
      status: 'open',
      operatorId: req.user!._id,
      operatorName: req.user!.name || me?.name || '',
      supervisorId,
      plantHeadId,
      chain,
      level: 0,
      // the reason is already known → notify the supervisor immediately
      // (the 30s escalation sweep delivers it), then walk the chain.
      nextEscalateAt: new Date(),
      startedAt: new Date(),
      reasonSubmittedAt: new Date(),
    });

    res.json({ ok: true, id: report._id, report: toRow(report.toObject()) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to report downtime' });
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
    report.set('nextEscalateAt', null); // acknowledged → the chain walk stops here
    await report.save();

    // clear the related action notifications
    await NotificationModel.updateMany(
      { refType: 'downtimeReport', refId: report._id },
      { $set: { read: true, readAt: new Date() } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to acknowledge' });
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
      { machineId, status: { $in: ['awaitingReason', 'open', 'escalated', 'acknowledged'] } },
      { _id: 1, operatorId: 1 }
    ).lean();
    const ids = open.map((r) => r._id);
    if (!ids.some((x) => String(x) === String(report._id))) ids.push(report._id);
    await DowntimeReportModel.updateMany(
      { _id: { $in: ids } },
      { $set: { status: 'resolved', resolvedAt: new Date(), nextEscalateAt: null } }
    );
    await NotificationModel.updateMany(
      { refType: 'downtimeReport', refId: { $in: ids } },
      { $set: { read: true, readAt: new Date() } }
    );
    const io = req.app.get('io');
    // close any reason popup still on an operator's screen for these reports
    for (const r of open) {
      if (r.operatorId) io?.to(ROOM.user(String(r.operatorId))).emit('downtime:prompt:clear', { reportId: String(r._id), machineId });
    }
    // also acknowledge this machine's health alerts for the resolver, so the bell badge drops,
    // and nudge their live views to refresh instantly.
    try { await ackMachineAlerts(req.user!, String(machineId)); } catch { /* best-effort */ }
    notifyUserLive(io, String(req.user!._id)); // refresh the bell's notifications
    nudge(io, String(machineId));              // refresh the bell's alerts
    res.json({ ok: true, resolved: ids.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve' });
  }
});

export default router;