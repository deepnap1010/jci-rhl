// ════════════════════════════════════════════════════════════════
//  📁 FILE PATH : smartfactory/server/src/lib/autoPrompt.ts
//  ⚙️  ACTION    : NEW FILE — create at this exact path
// ════════════════════════════════════════════════════════════════

// ============================================================
//  AUTO-PROMPT DETECTOR  —  "machine stopped > 2 min → pop the
//  reason screen on the operator's dashboard"
//
//  A sweep (every 30s, see index.ts) derives each machine's live
//  status. When a machine has been continuously stopped/idle for
//  AUTO_PROMPT_SEC (default 120s):
//
//    1. an `awaitingReason` DowntimeReport is created, with the
//       operator's FULL management chain snapshotted for escalation
//    2. every operator assigned to that machine gets a bell
//       notification AND a live 'downtime:prompt' socket push —
//       the client shows a blocking checkbox modal
//    3. if the operator doesn't answer within the supervisor grace
//       period, the normal escalation sweep alerts the supervisor
//       anyway ("no reason submitted yet") and keeps walking the
//       chain every ESCALATE_STEP_SEC until acknowledged
//
//  When the machine RUNS again while still awaitingReason, the
//  prompt is auto-resolved and cleared from the operator's screen
//  (nobody should answer for a machine that's already back up).
//
//  State tracking is in-process (badSince map). That's correct for
//  a single sweep owner — the same RUN_BACKGROUND_JOBS=false rule
//  that guards the other sweeps applies here too.
// ============================================================
import type { Server } from 'socket.io';
import { MachineModel } from '../models/Machine';
import { UserModel } from '../models/User';
import { DowntimeReportModel } from '../models/DowntimeReport';
import { NotificationModel } from '../models/Notification';
import { latestByMachine, deriveView, departmentFor, MachineDoc } from './derive';
import { buildManagerChain, supervisorDelayMs } from './escalation';
import { ROOM, notifyUserLive } from './live';

const AUTO_PROMPT_SEC = Number(process.env.AUTO_PROMPT_SEC) || 120; // 2 min

// machineId → epoch-ms when we FIRST saw it stopped/idle (cleared on run)
const badSince = new Map<string, number>();

type LeanUser = { _id: unknown; name?: string; email?: string };

function emitPrompt(io: Server | null, userId: unknown, payload: Record<string, unknown>): void {
  if (io && userId) io.to(ROOM.user(String(userId))).emit('downtime:prompt', payload);
}
function emitPromptClear(io: Server | null, userId: unknown, payload: Record<string, unknown>): void {
  if (io && userId) io.to(ROOM.user(String(userId))).emit('downtime:prompt:clear', payload);
}

export async function sweepAutoPrompts(io: Server | null): Promise<void> {
  const now = Date.now();
  const [machines, latest] = await Promise.all([
    MachineModel.find().lean() as unknown as Promise<MachineDoc[]>,
    latestByMachine(),
  ]);

  for (const m of machines) {
    const view = deriveView(m, latest.get(m.machineId) || null);

    // ── machine healthy again → clear the timer + auto-resolve pending prompts
    if (view.status === 'running') {
      badSince.delete(m.machineId);
      await autoResolvePrompts(io, m.machineId);
      continue;
    }
    // ── no data → not the operator's fault; don't nag (health alerts cover this)
    if (view.status === 'disconnected') {
      badSince.delete(m.machineId);
      continue;
    }

    // ── stopped or idle → start/continue the clock
    if (!badSince.has(m.machineId)) badSince.set(m.machineId, now);
    const downForMs = now - (badSince.get(m.machineId) || now);
    if (downForMs < AUTO_PROMPT_SEC * 1000) continue;

    // threshold crossed — but only ONE active report per machine at a time
    const existing = await DowntimeReportModel.findOne({
      machineId: m.machineId,
      status: { $in: ['awaitingReason', 'open', 'escalated', 'acknowledged'] },
    }).select('_id').lean();
    if (existing) continue;

    // find the operator(s) assigned to this machine
    const operators = (await UserModel.find({
      role: 'operator',
      isActive: { $ne: false },
      assignedMachineIds: m.machineId,
    }).select('name email').lean()) as LeanUser[];

    if (!operators.length) {
      // No operator to ask — log once per stoppage so it's visible, then skip.
      // (Assign an operator to the machine in User Management to enable prompts.)
      console.warn(`⚠️  ${m.machineId} down ${Math.round(downForMs / 60000)}m but has no assigned operator — no prompt raised`);
      badSince.set(m.machineId, now - AUTO_PROMPT_SEC * 1000); // don't spam the log every sweep
      continue;
    }

    const primary = operators[0];
    const chain = await buildManagerChain(primary._id);
    const startedAt = new Date(badSince.get(m.machineId) || now);

    const report = await DowntimeReportModel.create({
      machineId: m.machineId,
      machineCode: m.machineId,
      department: departmentFor({}, m.type),
      reason: '',
      reasons: [],
      source: 'auto',
      status: 'awaitingReason',
      operatorId: primary._id,
      operatorName: primary.name || '',
      supervisorId: chain[0]?.userId || null,
      plantHeadId: chain.find((c) => c.role === 'plantHead')?.userId || null,
      chain,
      level: 0,
      // grace period: if the operator ignores the popup, the supervisor is
      // alerted anyway (with "no reason yet") and the chain walk begins.
      nextEscalateAt: new Date(now + supervisorDelayMs()),
      startedAt,
      promptedAt: new Date(),
    });

    const mins = Math.max(1, Math.round(downForMs / 60000));
    for (const op of operators) {
      await NotificationModel.create({
        recipientUserId: op._id,
        email: (op.email || '').toLowerCase(),
        audience: 'operator',
        type: 'idleAlert',
        severity: 'warning',
        refType: 'downtimeReport',
        refId: report._id,
        actionType: null,
        machineId: m.machineId,
        machineCode: m.machineId,
        title: `Reason required: ${m.machineId} stopped`,
        body: `${m.name || m.machineId} has been ${view.status} for ${mins} min. Select the reason on your screen — your supervisor will be informed.`,
      });
      notifyUserLive(io, String(op._id));
      emitPrompt(io, op._id, {
        reportId: String(report._id),
        machineId: m.machineId,
        machineCode: m.machineId,
        machineName: m.name || m.machineId,
        status: view.status,
        startedAt: startedAt.toISOString(),
      });
    }

    console.log(`🛑 auto-prompt raised for ${m.machineId} (${view.status} ${mins}m) → ${operators.length} operator(s), chain depth ${chain.length}`);
  }
}

// Machine is running again: resolve any prompt still waiting for a reason and
// clear it from the operator's screen. Reports where a reason WAS submitted
// stay open — they're real downtime records for the supervisor to handle.
async function autoResolvePrompts(io: Server | null, machineId: string): Promise<void> {
  const pending = await DowntimeReportModel.find({ machineId, status: 'awaitingReason' }).lean();
  if (!pending.length) return;
  const ids = pending.map((r) => r._id);
  await DowntimeReportModel.updateMany(
    { _id: { $in: ids } },
    { $set: { status: 'resolved', resolvedAt: new Date() } }
  );
  await NotificationModel.updateMany(
    { refType: 'downtimeReport', refId: { $in: ids } },
    { $set: { read: true, readAt: new Date() } }
  );
  for (const r of pending) {
    emitPromptClear(io, r.operatorId, { reportId: String(r._id), machineId });
    notifyUserLive(io, r.operatorId ? String(r.operatorId) : null);
  }
  console.log(`✅ ${machineId} running again — auto-resolved ${ids.length} pending reason prompt(s)`);
}