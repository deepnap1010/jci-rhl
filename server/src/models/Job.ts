// ============================================================
//  JOB MODEL  —  human-assigned production context
//  The PLC sends telemetry; a person assigns which job a
//  machine is running. Kept separate so history survives job
//  changes. Job Tracking + the machine cards read this.
// ============================================================
import { Schema, model } from 'mongoose';
import { DEPARTMENTS } from '@shared/types';

const JobSchema = new Schema(
  {
    jobNumber: { type: String, required: true, unique: true }, // "JOB-10592"
    orderNumber: { type: String, required: true }, // "LOT1-05"
    fabricName: { type: String, required: true }, // "Cotrize"
    stage: { type: String, enum: DEPARTMENTS, required: true }, // current pipeline stage
    targetProduction: { type: Number, default: 0 }, // meters
    achievedProduction: { type: Number, default: 0 }, // meters (kept live from machine)
    status: {
      type: String,
      enum: ['pending', 'inProgress', 'completed'],
      default: 'pending',
    },
    machineId: { type: String, default: null }, // the machine's string code (e.g. "CBR-01")
    operatorId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    supervisorId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    // ── dyeing-machine batch context (optional; set from the Configure modal) ──
    batchId: { type: String, default: '' }, // "01"
    processType: { type: String, default: '' }, // "Dyeing", "Bleaching", …
    loadedAt: { type: Date, default: null }, // when fabric was loaded onto the machine
    shift: { type: String, enum: ['A', 'B', 'C'], default: 'A' }, // which shift runs this job
  },
  { timestamps: true }
);

export const JobModel = model('Job', JobSchema);
