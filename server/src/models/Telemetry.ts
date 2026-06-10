// ============================================================
//  TELEMETRY MODEL  —  canonical native time-series collection
//  Matches the JCI ingest API exactly (so this server reads the
//  SAME 'telemetries' collection the production API writes).
//
//  Everything the PLC sends lives in `data` (Mixed = any shape).
//  Time-series gives compression + fast time-range queries — the
//  production-grade store for high-volume readings.
// ============================================================
import { Schema, model } from 'mongoose';

const TelemetrySchema = new Schema(
  {
    machineId: { type: String, required: true }, // metaField
    deviceTs: { type: Date }, // PLC's own clock
    serverTs: { type: Date, default: Date.now }, // our clock — trust for ordering
    data: { type: Schema.Types.Mixed, required: true }, // free-form readings
  },
  {
    timeseries: {
      timeField: 'serverTs',
      metaField: 'machineId',
      granularity: 'seconds',
    },
    versionKey: false,
  }
);

export const TelemetryModel = model('Telemetry', TelemetrySchema);
