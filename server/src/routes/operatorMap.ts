// ============================================================
//  OPERATOR MAP ROUTE
//  Groups derived machine views by the operator / supervisor who
//  runs them (Employee.assignedMachineIds = machine string codes).
// ============================================================
import { Router } from 'express';
import { UserModel } from '../models/User';
import { getScopedViews } from '../lib/derive';

const router = Router();

router.get('/api/operator-map', async (req, res) => {
  try {
    const by = req.query.by === 'supervisor' ? 'supervisor' : 'operator';
    const views = await getScopedViews(req.user!);
    const viewBy = new Map(views.map((v) => [v.machineId, v]));

    // login users (operators / supervisors) grouped by their assigned machines
    const people = await UserModel.find({ role: by, isActive: { $ne: false } }).sort({ name: 1 }).lean();
    const personByMachine = new Map<string, (typeof people)[number]>();
    for (const p of people) {
      for (const mid of p.assignedMachineIds || []) {
        if (!personByMachine.has(String(mid))) personByMachine.set(String(mid), p);
      }
    }

    type Group = { key: string; name: string; code: string | null; machines: typeof views };
    const groups = new Map<string, Group>();
    const groupFor = (key: string, name: string, code: string | null) => {
      if (!groups.has(key)) groups.set(key, { key, name, code, machines: [] });
      return groups.get(key)!;
    };

    for (const v of views) {
      const p = personByMachine.get(v.machineId);
      const g = p ? groupFor(String(p._id), p.name, p.email || null) : groupFor('unassigned', '—', null);
      g.machines.push(v);
    }

    const out = Array.from(groups.values())
      .map((g) => {
        const ms = g.machines;
        return {
          key: g.key,
          name: g.name,
          code: g.code,
          stats: {
            machines: ms.length,
            running: ms.filter((x) => x.status === 'running').length,
            production: ms.reduce((s, x) => s + (x.state?.production || 0), 0),
            avgEff: ms.length ? Math.round(ms.reduce((s, x) => s + (x.state?.efficiency || 0), 0) / ms.length) : 0,
          },
          machines: ms.map((x) => ({
            _id: x.machineId,
            code: x.code,
            name: x.name,
            department: x.department,
            type: x.type,
            status: x.status,
            production: x.state?.production || 0,
            efficiency: x.state?.efficiency || 0,
          })),
        };
      })
      .sort((a, b) => (a.key === 'unassigned' ? -1 : b.key === 'unassigned' ? 1 : a.name.localeCompare(b.name)));

    res.json({ by, groups: out });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load operator map' });
  }
});

export default router;
