// ============================================================
//  USER HISTORY MODEL  —  archive of deleted login accounts
//
//  When a Super Admin deletes a user (temporarily or permanently)
//  we snapshot the whole account here so the record survives even
//  after the live User document is gone. This is the audit trail
//  the "Users History" page reads.
// ============================================================
import { Schema, model } from 'mongoose';

// one entry in the per-user activity log
const ActivitySchema = new Schema(
  {
    ts: { type: Date, required: true },
    action: { type: String, required: true }, // "created" | "lastLogin" | "temporary-delete" | "permanent-delete"
    by: { type: String, default: '' }, // who performed it
    detail: { type: String, default: '' },
  },
  { _id: false }
);

const UserHistorySchema = new Schema(
  {
    // identity (snapshot of the deleted user)
    userId: { type: String, index: true }, // the original User _id
    name: { type: String, required: true },
    email: { type: String, required: true, index: true },
    role: { type: String, required: true }, // previous role
    permissions: { type: Schema.Types.Mixed, default: {} }, // permission matrix snapshot (from Role)

    // department / designation
    assignedLines: { type: [String], default: [] }, // departments (prodManager scope)
    assignedMachineIds: { type: [String], default: [] },

    // status at the time of deletion
    accountStatus: { type: String, default: 'active' }, // active | disabled | suspended

    // deletion metadata
    deletionType: { type: String, enum: ['temporary', 'permanent'], required: true },
    reason: { type: String, default: '' },
    deletedById: { type: String, default: '' },
    deletedByName: { type: String, default: '' },
    deletedByEmail: { type: String, default: '' },
    deletedAt: { type: Date, required: true, index: true },
    suspendedUntil: { type: Date, default: null }, // for temporary deletes

    // original account timestamps
    accountCreatedAt: { type: Date },
    lastLoginAt: { type: Date },

    // full activity log
    activity: { type: [ActivitySchema], default: [] },
  },
  { timestamps: true }
);

export const UserHistoryModel = model('UserHistory', UserHistorySchema);
