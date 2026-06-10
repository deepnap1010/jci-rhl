// ============================================================
//  SHIFTS ROUTE  —  Shift Management page
//  Shift definitions are stored in the DB (editable); counts and
//  assignments are computed live from the Employee collection.
// ============================================================
import { Router } from 'express';
import { EmployeeModel } from '../models/Employee';
import { ShiftModel } from '../models/Shift';
import { ShiftDef } from '@shared/types';

const router = Router();

const DEFAULT_SHIFTS: ShiftDef[] = [
  { code: 'A', name: 'Morning Shift', start: '06:00', end: '14:00' },
  { code: 'B', name: 'Afternoon Shift', start: '14:00', end: '22:00' },
  { code: 'C', name: 'Night Shift', start: '22:00', end: '06:00' },
];

// seed the 3 definitions once, then always read from the DB
async function getShiftDefs(): Promise<ShiftDef[]> {
  const count = await ShiftModel.estimatedDocumentCount();
  if (count === 0) await ShiftModel.insertMany(DEFAULT_SHIFTS);
  const docs = await ShiftModel.find().sort({ code: 1 }).lean();
  return docs.map((d) => ({ code: d.code, name: d.name, start: d.start, end: d.end })) as ShiftDef[];
}

const isHHMM = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// GET /api/shifts → shift cards + per-employee assignment table
router.get('/api/shifts', async (_req, res) => {
  try {
    const [defs, emps] = await Promise.all([getShiftDefs(), EmployeeModel.find().sort({ code: 1 }).lean()]);

    const shifts = defs.map((s) => {
      const inShift = emps.filter((e) => e.shift === s.code);
      return {
        ...s,
        supervisors: inShift.filter((e) => e.role === 'supervisor').length,
        operators: inShift.filter((e) => e.role === 'operator').length,
        names: inShift.map((e) => e.name),
      };
    });

    const assignments = emps.map((e) => ({
      _id: String(e._id),
      name: e.name,
      role: e.role,
      department: e.department,
      shift: e.shift,
      machineCodes: e.assignedMachineIds || [], // already string codes
    }));

    res.json({ shifts, assignments });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load shifts' });
  }
});

// PATCH /api/shifts/:code → edit a shift's name / start / end
router.patch('/api/shifts/:code', async (req, res) => {
  try {
    const code = String(req.params.code).toUpperCase();
    if (!['A', 'B', 'C'].includes(code)) return res.status(400).json({ error: 'Invalid shift code' });
    const b = req.body ?? {};
    const set: Record<string, string> = {};
    if (b.name !== undefined) {
      if (!String(b.name).trim()) return res.status(400).json({ error: 'Name cannot be empty' });
      set.name = String(b.name).trim();
    }
    if (b.start !== undefined) {
      if (!isHHMM(b.start)) return res.status(400).json({ error: 'Start time must be HH:MM (24h)' });
      set.start = b.start;
    }
    if (b.end !== undefined) {
      if (!isHHMM(b.end)) return res.status(400).json({ error: 'End time must be HH:MM (24h)' });
      set.end = b.end;
    }
    await getShiftDefs(); // ensure the doc exists before updating
    await ShiftModel.updateOne({ code }, { $set: set });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update shift', detail: String(err) });
  }
});

export default router;
