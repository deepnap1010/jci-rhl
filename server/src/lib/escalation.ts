// ============================================================
//  ESCALATION ENGINE  —  drives the idle-report lifecycle
//
//    open ──(SUPERVISOR_DELAY)──► notify supervisor (with reason)
//         ──(supervisor Acks)───► acknowledged ✓ (timer stops)
//         ──(PLANTHEAD_DELAY,    ► escalate to plant head
//            no ack)
//
//  Delays are configurable via .env so you can demo it quickly:
//    ESCALATE_SUPERVISOR_SEC  (default 300  = 5 min)
//    ESCALATE_PLANTHEAD_SEC   (default 1800 = 30 min)
//  A sweep runs on an interval (see index.ts) and is also safe to
//  call ad-hoc. Recipients are read from the report's snapshot of
//  the operator's org chain (supervisorId / plantHeadId).
// ============================================================
import type { Server } from 'socket.io';
import { DowntimeReportModel } from '../models/DowntimeReport';
import { NotificationModel } from '../models/Notification';

export function supervisorDelayMs(): number {
  return (Number(process.env.ESCALATE_SUPERVISOR_SEC) || 300) * 1000;
}
export function plantHeadDelayMs(): number {
  return (Number(process.env.ESCALATE_PLANTHEAD_SEC) || 1800) * 1000;
}

async function pushNotification(
  io: Server | null,
  doc: Record<string, unknown> & { recipientUserId?: unknown; email?: string }
) {
  await NotificationModel.create(doc);
  if (io) io.emit('notify:new', { userId: doc.recipientUserId ? String(doc.recipientUserId) : null, email: doc.email || null });
}

function fmtMins(ms: number): string {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

const ROLE_LABEL: Record<string, string> = {
  supervisor: 'supervisor', prodManager: 'production manager',
  plantHead: 'production head', superAdmin: 'super admin', admin: 'admin',
};

interface ChainLink { userId?: unknown; role?: string; name?: string; email?: string }

// One pass over active reports. Walks each report UP its management chain:
// the immediate manager is notified after SUPERVISOR_DELAY, then each higher
// manager every PLANTHEAD_DELAY until someone acknowledges or the chain runs out.
// Idempotent: only fires when nextEscalateAt is crossed and the level is unsent.
export async function sweepEscalations(io: Server | null): Promise<void> {
  const now = Date.now();
  const stepDelay = plantHeadDelayMs();

  const active = await DowntimeReportModel.find({
    status: { $in: ['open', 'escalated'] },
    nextEscalateAt: { $ne: null, $lte: new Date() },
  }).lean();

  for (const r of active) {
    const chain = (r.chain as ChainLink[]) || [];
    const level = (r.level as number) || 0;
    if (level >= chain.length) continue; // whole chain already notified
    const target = chain[level];
    if (!target?.userId) {
      // gap in the chain → skip this level, schedule the next
      await DowntimeReportModel.updateOne({ _id: r._id }, { $set: { level: level + 1, nextEscalateAt: new Date(now + stepDelay) } });
      continue;
    }

    const isFirst = level === 0;
    const started = new Date(r.startedAt as Date).getTime();
    const idleFor = fmtMins(now - started);
    const roleWord = ROLE_LABEL[target.role || ''] || 'manager';
    const next = chain[level + 1];
    const escalateNote = next
      ? `Acknowledge or it escalates to the ${ROLE_LABEL[next.role || ''] || 'next manager'}.`
      : `This is the top of the chain.`;

    await pushNotification(io, {
      recipientUserId: target.userId,
      email: (target.email || '').toLowerCase(),
      audience: target.role || 'supervisor',
      type: isFirst ? 'idleAlert' : 'idleEscalation',
      severity: isFirst ? 'warning' : 'critical',
      refType: 'downtimeReport',
      refId: r._id,
      actionType: 'acknowledge',
      machineId: r.machineId,
      machineCode: r.machineCode || (r.machineId as string),
      title: isFirst
        ? `Machine idle: ${r.machineCode || r.machineId}`
        : `Escalation: ${r.machineCode || r.machineId} still idle`,
      body: `${r.operatorName || 'Operator'} reported "${r.reason}" — idle ${idleFor}. ${escalateNote}`,
    });

    // advance the report: mark this level sent, schedule the next, update status/display
    const set: Record<string, unknown> = {
      level: level + 1,
      nextEscalateAt: level + 1 < chain.length ? new Date(now + stepDelay) : null,
      escalatedToName: target.name || '',
    };
    if (isFirst) set.supervisorNotifiedAt = new Date();
    else set.status = 'escalated'; // past the first manager → escalated
    if (!isFirst && !r.escalatedAt) set.escalatedAt = new Date();
    await DowntimeReportModel.updateOne({ _id: r._id }, { $set: set });

    console.log(`${isFirst ? '⏰' : '🚨'} idle ${isFirst ? 'alert' : 'escalation'} → ${roleWord} (${target.name}) for ${r.machineCode || r.machineId} (${r.reason})`);
  }
}
