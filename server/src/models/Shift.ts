// ============================================================
//  SHIFT MODEL  —  editable shift definitions (A / B / C)
//  Timings live in the DB so admins can adjust them; counts and
//  assignments are still computed live from the Employee data.
// ============================================================
import { Schema, model } from 'mongoose';

const ShiftSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, enum: ['A', 'B', 'C'] },
    name: { type: String, required: true }, // "Morning Shift"
    start: { type: String, required: true }, // "06:00"
    end: { type: String, required: true }, // "14:00"
  },
  { timestamps: true }
);

export const ShiftModel = model('Shift', ShiftSchema);
