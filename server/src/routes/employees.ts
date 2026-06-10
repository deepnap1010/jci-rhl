// ============================================================
//  EMPLOYEES ROUTE  —  Employees & Roles
//  assignedMachineIds are machine string codes (e.g. "CBR-01").
// ============================================================
import { Router } from 'express';
import { EmployeeModel } from '../models/Employee';
import { getScopedViews } from '../lib/derive';

const router = Router();

// ── department → employee-code prefix (auto-generated codes) ──
const DEPT_PREFIX: Record<string, string> = {
  'Rebatching': 'REB', 'Singeing': 'SNG', 'Brushing': 'BRH', 'CBR (Bleaching)': 'CBR',
  'Washing': 'WSH', 'Mercerizing': 'MRC', 'Cold Dyeing': 'CLD', 'Hot Dyeing': 'HOT',
  'Supporting': 'SPT', 'Printing': 'PRN', 'Finishing': 'FIN', 'Quality Control': 'QC',
};
function deptPrefix(department: string): string {
  return DEPT_PREFIX[department] || (department || 'EMP').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'EMP';
}
// next sequential code for a department, continuing from the highest existing
async function nextEmployeeCode(department: string): Promise<string> {
  const prefix = deptPrefix(department);
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const emps = await EmployeeModel.find({ code: { $regex: `^${prefix}-\\d+$` } }, { code: 1 }).lean();
  let max = 0;
  for (const e of emps) {
    const m = re.exec(String(e.code));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(2, '0')}`;
}

// GET /api/employees/next-code?department=...  → { code }  (preview for the form)
router.get('/api/employees/next-code', async (req, res) => {
  try {
    const department = String(req.query.department || '');
    if (!department) return res.status(400).json({ error: 'department is required' });
    res.json({ code: await nextEmployeeCode(department) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate code' });
  }
});

router.get('/api/employees', async (req, res) => {
  try {
    const isAdmin = req.user!.role === 'superAdmin' || req.user!.role === 'admin' || req.user!.role === 'plantHead';
    const views = await getScopedViews(req.user!);
    const scopedDepts = new Set(views.map((v) => v.department));

    const emps = await EmployeeModel.find().sort({ code: 1 }).lean();
    const visible = emps.filter((e) => isAdmin || scopedDepts.has(e.department as never));

    const opsBySup = new Map<string, number>();
    for (const e of emps) {
      if (e.role === 'operator' && e.supervisorId) {
        const k = String(e.supervisorId);
        opsBySup.set(k, (opsBySup.get(k) || 0) + 1);
      }
    }
    const nameById = new Map(emps.map((e) => [String(e._id), e.name]));

    const rows = visible.map((e) => ({
      _id: String(e._id),
      code: e.code,
      name: e.name,
      email: e.email || '',
      status: e.status || 'active',
      team: e.team || '',
      roleSlug: e.roleSlug || '',
      role: e.role,
      department: e.department,
      shift: e.shift,
      machineCodes: e.assignedMachineIds || [], // already string codes
      operatorsCount: opsBySup.get(String(e._id)) || 0,
      supervisorId: e.supervisorId ? String(e.supervisorId) : '',
      supervisorName: e.supervisorId ? nameById.get(String(e.supervisorId)) || '' : '',
    }));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load employees' });
  }
});

router.post('/api/employees', async (req, res) => {
  try {
    const b = req.body ?? {};
    if (!b.name || !b.role || !b.department) {
      return res.status(400).json({ error: 'name, role and department are required' });
    }
    const base = {
      name: b.name,
      email: b.email || '',
      status: b.status || 'active',
      team: b.team || '',
      roleSlug: b.roleSlug || '',
      role: b.role,
      department: b.department,
      shift: b.shift || 'A',
      assignedMachineIds: b.assignedMachineIds || [],
      supervisorId: b.supervisorId || undefined,
    };
    // code is assigned automatically per department; retry on the unique-index guard
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = await nextEmployeeCode(b.department);
      try {
        const emp = await EmployeeModel.create({ code, ...base });
        return res.json({ ok: true, id: emp._id, code });
      } catch (e) {
        if ((e as { code?: number })?.code === 11000) continue; // collision → next number
        throw e;
      }
    }
    return res.status(500).json({ error: 'Could not allocate a unique employee code, please retry' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create employee', detail: String(err) });
  }
});

router.patch('/api/employees/:id', async (req, res) => {
  try {
    const b = req.body ?? {};
    const set: Record<string, unknown> = {};
    for (const k of ['name', 'email', 'status', 'team', 'roleSlug', 'role', 'department', 'shift', 'assignedMachineIds', 'supervisorId']) {
      if (b[k] !== undefined) set[k] = b[k];
    }
    await EmployeeModel.updateOne({ _id: req.params.id }, set);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

router.delete('/api/employees/:id', async (req, res) => {
  try {
    await EmployeeModel.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

export default router;
