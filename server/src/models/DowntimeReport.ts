// ============================================================
//  DOWNTIME REPORT  —  operator-reported machine idle/stoppage
//  with a reason, plus a two-step escalation lifecycle:
//
//    open ──(5 min, unhandled)──► supervisor notified
//         ──(supervisor Acks)───► acknowledged ✓
//         ──(30 min, no ack)────► escalated to plant head
//         ──(machine resolved)──► resolved
//
//  Recipients are snapshotted from the operator's org chain at
//  report time (operator → supervisorId → plantHeadId) so the
//  escalation is deterministic even if managers change later.
// ============================================================
import { Schema, model } from 'mongoose';

const DowntimeReportSchema = new Schema(
  {
    machineId: { type: String, required: true, index: true },
    machineCode: { type: String, default: '' },
    department: { type: String, default: '' },
    reason: { type: String, required: true },
    note: { type: String, default: '' },

    status: {
      type: String,
      enum: ['open', 'acknowledged', 'escalated', 'resolved'],
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
    startedAt: { type: Date, default: () => new Date() },
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
