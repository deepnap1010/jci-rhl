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

// Retention (opt-in): raw telemetry grows ~hundreds of MB/day at 100s of machines, so an
// unbounded collection fills any tier eventually. Set TELEMETRY_TTL_DAYS in .env to auto-expire
// old readings (e.g. 30). Default 0 = keep forever (no data loss unless you opt in).
// NOTE: this option only applies when the collection is first CREATED. For an EXISTING
// collection, apply it once via:  db.runCommand({ collMod: 'telemetries', expireAfterSeconds: <secs> })
const TTL_DAYS = Number(process.env.TELEMETRY_TTL_DAYS) || 0;

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
    ...(TTL_DAYS > 0 ? { expireAfterSeconds: TTL_DAYS * 86400 } : {}),
    versionKey: false,
  }
);

export const TelemetryModel = model('Telemetry', TelemetrySchema);
