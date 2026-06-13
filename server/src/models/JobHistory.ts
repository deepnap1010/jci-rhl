// ============================================================
//  JOB HISTORY MODEL  —  archive of deleted production jobs.
//  When a job is deleted we snapshot the whole job here (plus who
//  deleted it, when and why) so it survives after the live Job is
//  gone. This is what the "Job History" modal reads.
// ============================================================
import { Schema, model } from 'mongoose';

const JobHistorySchema = new Schema(
  {
    jobId: { type: String, index: true }, // the original Job _id
    jobNumber: { type: String, required: true, index: true },
    orderNumber: { type: String, default: '' },
    fabricName: { type: String, default: '' },
    stage: { type: String, default: '' },
    status: { type: String, default: '' }, // pending | inProgress | completed at deletion
    targetProduction: { type: Number, default: 0 },
    achievedProduction: { type: Number, default: 0 },

    machineId: { type: String, default: '' }, // machine code
    operatorId: { type: String, default: '' },
    operatorName: { type: String, default: '' },
    supervisorId: { type: String, default: '' },
    supervisorName: { type: String, default: '' },

    // batch / recipe snapshot
    batchId: { type: String, default: '' },
    processType: { type: String, default: '' },
    glm: { type: Number, default: 0 },
    liquorRatio: { type: String, default: '' },
    dyeStage: { type: String, default: '' },
    shift: { type: String, default: '' },

    jobCreatedAt: { type: Date }, // when the job was originally allotted

    // deletion metadata
    reason: { type: String, default: '' },
    deletedById: { type: String, default: '' },
    deletedByName: { type: String, default: '' },
    deletedByEmail: { type: String, default: '' },
    deletedAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

export const JobHistoryModel = model('JobHistory', JobHistorySchema);
