// ════════════════════════════════════════════════════════════════
//  📁 FILE PATH : smartfactory/server/src/lib/escalation.ts
//  ⚙️  ACTION    : REPLACE existing file (full overwrite)
// ════════════════════════════════════════════════════════════════

// ============================================================
//  ESCALATION ENGINE  —  drives the idle-report lifecycle
//
//    awaitingReason ─(operator submits reasons)► open → supervisor
//                     notified IMMEDIATELY (nextEscalateAt = now)
//                   ─(no reason within SUPERVISOR grace)► supervisor
//                     alerted anyway with "no reason submitted yet"
//    then every ESCALATE_STEP_SEC without an Ack the NEXT manager
//    up the chain is notified — supervisor → production manager →
//    production head → super admin — until someone acknowledges
//    or the chain runs out ("This is the top of the chain").
//
//  Delays are configurable via .env:
//    ESCALATE_SUPERVISOR_SEC  grace before the supervisor is alerted
//                             when the operator hasn't answered the
//                             popup yet          (default 300 = 5 min)
//    ESCALATE_STEP_SEC        gap between each escalation step up
//                             the chain          (default 600 = 10 min)
//    ESCALATE_PLANTHEAD_SEC   legacy fallback for the step gap, used
//                             only when ESCALATE_STEP_SEC is unset
//
//  A sweep runs on an interval (see index.ts) and is also safe to
//  call ad-hoc. Recipients come from the report's snapshot of the
//  operator's full management chain.
// ============================================================
import type { Server } from 'socket.io';
import { DowntimeReportModel } from '../models/DowntimeReport';
import { NotificationModel } from '../models/Notification';
import { UserModel } from '../models/User';
import { notifyUserLive } from './live';

export function supervisorDelayMs(): number {
  return (Number(process.env.ESCALATE_SUPERVISOR_SEC) || 300) * 1000;
}
export function plantHeadDelayMs(): number {
  return (Number(process.env.ESCALATE_PLANTHEAD_SEC) || 1800) * 1000;
}
// Gap between each step up the chain. New knob; falls back to the legacy
// plant-head delay so existing .env files keep working unchanged.
export function stepDelayMs(): number {
  const step = Number(process.env.ESCALATE_STEP_SEC);
  if (step > 0) return step * 1000;
  return plantHeadDelayMs();
}

export interface ChainLink { userId?: unknown; role?: string; name?: string; email?: string }

// Walk the org chart upward from a user: supervisor → production manager →
// production head → super admin. Cycle-guarded and depth-capped. Shared by
// the manual report route AND the auto-prompt detector.
export async function buildManagerChain(startUserId: unknown): Promise<ChainLink[]> {
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

async function pushNotification(
  io: Server | null,
  doc: Record<string, unknown> & { recipientUserId?: unknown; email?: string }
) {
  await NotificationModel.create(doc);
  notifyUserLive(io, doc.recipientUserId ? String(doc.recipientUserId) : null);
}

function fmtMins(ms: number): string {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

const ROLE_LABEL: Record<string, string> = {
  supervisor: 'supervisor', prodManager: 'production manager',
  plantHead: 'production head', superAdmin: 'super admin', admin: 'admin',
};

// The reason line for a notification body. Before the operator answers the
// popup we say so explicitly, so the manager knows to chase the floor.
function reasonText(r: Record<string, unknown>): string {
  const reasons = r.reasons as string[] | undefined;
  if (reasons && reasons.length) {
    const other = String(r.otherText || '').trim();
    return reasons.map((x) => (x === 'Other' && other ? `Other: ${other}` : x)).join(', ');
  }
  const single = String(r.reason || '').trim();
  if (single) return single;
  return 'no reason submitted by the operator yet';
}

// One pass over active reports. Walks each report UP its management chain:
// each pending level fires once its nextEscalateAt is crossed, then the next
// level is scheduled ESCALATE_STEP_SEC later — repeating until someone
// acknowledges or the chain runs out. Idempotent: only fires when
// nextEscalateAt is crossed and the level is unsent.
export async function sweepEscalations(io: Server | null): Promise<void> {
  const now = Date.now();
  const stepDelay = stepDelayMs();

  const active = await DowntimeReportModel.find({
    status: { $in: ['awaitingReason', 'open', 'escalated'] },
    nextEscalateAt: { $ne: null, $lte: new Date() },
  }).lean();

  for (const r of active) {
    const chain = (r.chain as ChainLink[]) || [];
    const level = (r.level as number) || 0;
    if (level >= chain.length) {
      // whole chain already notified — stop scheduling
      await DowntimeReportModel.updateOne({ _id: r._id }, { $set: { nextEscalateAt: null } });
      continue;
    }
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
      ? `Acknowledge or it escalates to the ${ROLE_LABEL[next.role || ''] || 'next manager'} in ${fmtMins(stepDelay)}.`
      : `This is the top of the chain.`;
    const why = reasonText(r as Record<string, unknown>);
    const awaiting = r.status === 'awaitingReason';

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
        ? `Machine ${awaiting ? 'stopped' : 'idle'}: ${r.machineCode || r.machineId}`
        : `Escalation: ${r.machineCode || r.machineId} still down`,
      body: awaiting
        ? `${r.machineCode || r.machineId} has been down ${idleFor} — ${why} (reason prompt is on the operator's screen). ${escalateNote}`
        : `${r.operatorName || 'Operator'} reported "${why}" — down ${idleFor}. ${escalateNote}`,
    });

    // advance the report: mark this level sent, schedule the next, update display.
    // NOTE: while the report is still awaitingReason we do NOT overwrite the
    // status (the operator popup keys off it) — escalation progress is tracked
    // by level/escalatedAt instead.
    const set: Record<string, unknown> = {
      level: level + 1,
      nextEscalateAt: level + 1 < chain.length ? new Date(now + stepDelay) : null,
      escalatedToName: target.name || '',
    };
    if (isFirst) set.supervisorNotifiedAt = new Date();
    else if (!awaiting) set.status = 'escalated'; // past the first manager → escalated
    if (!isFirst && !r.escalatedAt) set.escalatedAt = new Date();
    await DowntimeReportModel.updateOne({ _id: r._id }, { $set: set });

    console.log(`${isFirst ? '⏰' : '🚨'} idle ${isFirst ? 'alert' : 'escalation'} → ${roleWord} (${target.name}) for ${r.machineCode || r.machineId} (${why})`);
  }
}