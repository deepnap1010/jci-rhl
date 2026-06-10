// ============================================================
//  ORG ROUTE  —  the team hierarchy as a drill-down tree
//  GET /api/org → { nodes, viewerRole }
//
//  Admin / Super Admin see every Production Head and can drill:
//    Production Head → Production Managers (with their lines)
//                    → Supervisors → Operators → machines.
//  Any other role is rooted at themselves and sees only their
//  own subtree (their reports, recursively, down to machines).
// ============================================================
import { Router } from 'express';
import { UserModel } from '../models/User';
import { MachineModel } from '../models/Machine';
import { departmentFor } from '../lib/derive';
import { subtreeIds } from '../lib/orgTree';
import { notifyUser } from '../lib/userNotify';

const router = Router();

interface UserLite {
  _id: unknown;
  name?: string;
  email?: string;
  role?: string;
  managerId?: unknown;
  assignedLines?: string[];
  assignedMachineIds?: string[];
}

router.get('/api/org', async (req, res) => {
  try {
    const me = req.user!;
    const users = (await UserModel.find({ isActive: { $ne: false } })
      .select('name email role managerId assignedLines assignedMachineIds')
      .lean()) as unknown as UserLite[];
    const machines = (await MachineModel.find().select('machineId name type').lean()) as unknown as { machineId: string; name?: string; type?: string }[];

    const machineInfo = new Map(
      machines.map((m) => [m.machineId, { code: m.machineId, name: m.name || m.machineId, department: departmentFor({}, m.type) }])
    );

    // index children by their manager
    const byManager = new Map<string, UserLite[]>();
    for (const u of users) {
      const mid = u.managerId ? String(u.managerId) : '';
      if (!byManager.has(mid)) byManager.set(mid, []);
      byManager.get(mid)!.push(u);
    }
    const byId = new Map(users.map((u) => [String(u._id), u]));

    const sortByName = (a: UserLite, b: UserLite) => String(a.name || '').localeCompare(String(b.name || ''));

    function nodeFor(u: UserLite, depth: number, seen: Set<string>): Record<string, unknown> {
      const id = String(u._id);
      const next = new Set(seen);
      next.add(id);
      const childUsers = (byManager.get(id) || []).filter((c) => !next.has(String(c._id))).sort(sortByName);
      const children = depth < 8 ? childUsers.map((c) => nodeFor(c, depth + 1, next)) : [];
      const codes = u.assignedMachineIds || [];
      return {
        id,
        name: u.name || '',
        email: u.email || '',
        role: u.role || '',
        department: (u.assignedLines || []).join(', '),
        machines: codes.map((c) => machineInfo.get(c) || { code: c, name: c, department: '' }),
        reports: children.length,
        children,
      };
    }

    const isAdmin = me.role === 'superAdmin' || me.role === 'admin';
    let rootUsers: UserLite[];
    if (isAdmin) {
      rootUsers = users.filter((u) => u.role === 'plantHead').sort(sortByName);
    } else {
      const meDoc = byId.get(String(me._id));
      rootUsers = meDoc ? [meDoc] : [];
    }

    const nodes = rootUsers.map((u) => nodeFor(u, 0, new Set<string>()));
    res.json({ nodes, viewerRole: me.role });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load org chart', detail: String(err) });
  }
});

// GET /api/people → flat list of active login users (for assignment dropdowns)
router.get('/api/people', async (req, res) => {
  try {
    const users = await UserModel.find({ isActive: { $ne: false } })
      .select('name role email assignedMachineIds')
      .sort({ name: 1 })
      .lean();
    res.json({
      people: users.map((u) => ({
        _id: String(u._id),
        name: u.name,
        role: String(u.role),
        email: u.email || '',
        assignedMachineIds: (u as { assignedMachineIds?: string[] }).assignedMachineIds || [],
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load people' });
  }
});

// PATCH /api/org/manager  { userId, managerId|null }  — reassign who someone reports to
router.patch('/api/org/manager', async (req, res) => {
  try {
    const me = req.user!;
    const userId = String(req.body?.userId || '');
    const managerId = req.body?.managerId ? String(req.body.managerId) : null;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (managerId && managerId === userId) return res.status(400).json({ error: 'A person cannot report to themselves' });

    const target = await UserModel.findById(userId);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const isAdmin = me.role === 'superAdmin' || me.role === 'admin';
    if (!isAdmin) {
      // a manager may only reassign people inside their own team, to a manager also in their team (or to themselves)
      const myTeam = await subtreeIds(me._id);
      if (!myTeam.has(userId)) return res.status(403).json({ error: 'That person is not in your team' });
      if (managerId && managerId !== String(me._id) && !myTeam.has(managerId)) {
        return res.status(403).json({ error: 'You can only assign a manager from within your team' });
      }
    }
    // prevent loops: the new manager must not be the person or one of their descendants
    if (managerId) {
      const below = await subtreeIds(userId);
      if (below.has(managerId)) return res.status(400).json({ error: 'That would create a reporting loop' });
    }

    const oldManagerId = target.get('managerId') ? String(target.get('managerId')) : null;
    target.set('managerId', managerId);
    await target.save();

    // notify the people affected by the reporting-line change
    if (managerId !== oldManagerId) {
      const io = req.app.get('io');
      const targetName = String(target.get('name') || 'A team member');
      let managerName = '';
      if (managerId) {
        const mgr = await UserModel.findById(managerId).select('name').lean();
        managerName = (mgr as { name?: string } | null)?.name || 'your new manager';
      }
      // the person whose manager changed
      await notifyUser(io, userId, {
        type: 'orgChange',
        title: 'Your reporting line changed',
        body: managerId
          ? `You now report to ${managerName} (updated by ${me.name || 'an admin'}).`
          : `You no longer have an assigned manager (updated by ${me.name || 'an admin'}).`,
      });
      // the new manager gains a report
      if (managerId) {
        await notifyUser(io, managerId, {
          type: 'orgChange',
          title: 'New team member',
          body: `${targetName} now reports to you.`,
        });
      }
      // the previous manager loses a report
      if (oldManagerId) {
        await notifyUser(io, oldManagerId, {
          type: 'orgChange',
          title: 'Team change',
          body: `${targetName} no longer reports to you.`,
        });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reassign manager', detail: String(err) });
  }
});

export default router;
