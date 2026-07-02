// ============================================================
//  SAP RECORD  —  raw payloads PUSHED from a partner's SAP system
//  (e.g. Minda). Stored verbatim so nothing is lost; specific fields
//  are mapped into domain models once the exact SAP structure is known.
// ============================================================
import { Schema, model } from 'mongoose';

const SapRecordSchema = new Schema(
  {
    source: { type: String, default: 'minda-sap', index: true }, // who sent it
    recordType: { type: String, default: '', index: true },      // optional classifier (e.g. productionOrder)
    payload: { type: Schema.Types.Mixed, required: true },        // the SAP JSON, exactly as received
    sourceIp: { type: String, default: '' },                      // caller IP (audit)
    receivedAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

export const SapRecordModel = model('SapRecord', SapRecordSchema);
