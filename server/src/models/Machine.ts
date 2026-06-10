// ============================================================
//  MACHINE MODEL  —  canonical (matches the JCI ingest API)
//  One document per physical machine. The COMPANY sends
//  machineId/name/type; we auto-create on first telemetry.
//  `metricsSeen` accumulates every field key we've ever received.
// ============================================================
import { Schema, model } from 'mongoose';

const MachineSchema = new Schema(
  {
    machineId: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: '' },
    type: { type: String, default: 'unknown' },
    phase: { type: Number, default: 1 },
    status: { type: String, default: 'active' }, // lifecycle: active/retired (NOT live run-state)
    metricsSeen: { type: [String], default: [] },
    lastSeen: { type: Date, default: null },
  },
  { timestamps: true }
);

export const MachineModel = model('Machine', MachineSchema);
