// ════════════════════════════════════════════════════════════════
//  📁 FILE PATH : smartfactory/server/src/models/DowntimeReport.ts
//  ⚙️  ACTION    : REPLACE existing file (full overwrite)
// ════════════════════════════════════════════════════════════════

// ============================================================
//  DOWNTIME REPORT  —  machine idle/stoppage with reason(s) and
//  a full-chain escalation lifecycle:
//
//    (auto-detected ≥ AUTO_PROMPT_SEC stopped/idle)
//    awaitingReason ──(operator submits checkboxes)──► open
//                   ──(no reason in grace period)────► supervisor
//                                                      alerted anyway
//    open ──(immediately)──────► supervisor notified (with reasons)
//         ──(supervisor Acks)──► acknowledged ✓ (chain stops)
//         ──(ESCALATE_STEP_SEC, no ack)► next manager up the chain,
//            repeating every step until the TOP of the org chart
//         ──(machine resolved)─► resolved
//
//  Recipients are snapshotted from the operator's org chain at
//  report time (operator → supervisor → prod manager → plant head
//  → super admin) so escalation is deterministic even if managers
//  change later.
// ============================================================
import { Schema, model } from 'mongoose';

const DowntimeReportSchema = new Schema(
  {
    machineId: { type: String, required: true, index: true },
    machineCode: { type: String, default: '' },
    department: { type: String, default: '' },

    // ── reasons ──
    // Multi-select checkboxes (from shared/downtimeReasons.ts). `reason` keeps
    // the joined display string so every existing consumer keeps working.
    reason: { type: String, default: '' },
    reasons: { type: [String], default: [] },
    otherText: { type: String, default: '' }, // filled when "Other" is checked
    note: { type: String, default: '' },

    // 'manual' = operator pressed "Report idle"; 'auto' = the 2-minute
    // stop/idle detector created it and popped the reason prompt.
    source: { type: String, enum: ['manual', 'auto'], default: 'manual' },

    status: {
      type: String,
      enum: ['awaitingReason', 'open', 'acknowledged', 'escalated', 'resolved'],
      default: 'open',
      index: true,
    },

    // org chain snapshot (User ids)
    operatorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    operatorName: { type: String, default: '' },
    supervisorId: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // chain[0], kept for convenience
    plantHeadId: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // the plant head in the chain, if any

    // full management chain above the operator, ordered nearest→top:
    //   [ supervisor, production manager, production head, super admin ]
    // Escalation walks this list one level at a time until acknowledged.
    chain: {
      type: [
        {
          userId: { type: Schema.Types.ObjectId, ref: 'User' },
          role: String,
          name: String,
          email: String,
        },
      ],
      default: [],
    },
    level: { type: Number, default: 0 }, // how many chain members have been notified so far
    nextEscalateAt: { type: Date, default: null }, // when the next level should be notified
    escalatedToName: { type: String, default: null }, // last person escalated to (for display)

    // lifecycle timestamps
    startedAt: { type: Date, default: () => new Date() }, // when the machine actually went down
    promptedAt: { type: Date, default: null },            // when the operator popup was raised (auto)
    reasonSubmittedAt: { type: Date, default: null },     // when the operator submitted the checkboxes
    supervisorNotifiedAt: { type: Date, default: null },
    acknowledgedAt: { type: Date, default: null },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    acknowledgedByName: { type: String, default: null },
    escalatedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const DowntimeReportModel = model('DowntimeReport', DowntimeReportSchema);