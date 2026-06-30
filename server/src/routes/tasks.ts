// ============================================================
//  TASKS ROUTE  —  delegated work down the org chart
//  GET  /api/tasks            → { toMe, byMe }
//  GET  /api/tasks/reports    → the people I may assign to (direct reports)
//  POST /api/tasks            → assign a task to a direct report (notifies them)
//  PATCH /api/tasks/:id       → update status (assignee or assigner)
//
//  Rule: you can only assign work to your OWN direct reports
//  (managerId === you). Admins may assign to anyone.
// ============================================================
import { Router } from 'express';
import { TaskModel } from '../models/Task';
import { UserModel } from '../models/User';
import { NotificationModel } from '../models/Notification';
import { subtreeIds } from '../lib/orgTree';
import { notifyUserLive } from '../lib/live';

const router = Router();

// next sequential task number (TASK-####). Manual entry risks collisions; the
// unique index is the final guard and callers retry on conflict.
async function nextTaskNumber(): Promise<string> {
  const tasks = await TaskModel.find({}, { taskNumber: 1 }).lean();
  let max = 3000;
  for (const t of tasks) {
    const m = /^TASK-(\d+)$/.exec((t as { taskNumber?: string }).taskNumber || '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `TASK-${max + 1}`;
}

function toRow(t: Record<string, any>) {
  return {
    _id: String(t._id),
    taskNumber: t.taskNumber || '',
    title: t.title,
    details: t.details || '',
    targetProduction: t.targetProduction || 0,
    department: t.department || '',
    machineId: t.machineId || null,
    jobId: t.jobId ? String(t.jobId) : null,
    jobNumber: t.jobNumber || '',
    assignedToId: t.assignedToId ? String(t.assignedToId) : null,
    assignedToName: t.assignedToName || '',
    assignedToRole: t.assignedToRole || '',
    assignedById: t.assignedById ? String(t.assignedById) : null,
    assignedByName: t.assignedByName || '',
    assignedByRole: t.assignedByRole || '',
    status: t.status,
    createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : null,
  };
}

const isAdmin = (role: string) => role === 'superAdmin' || role === 'admin';

// the users I may hand work to: my direct reports
router.get('/api/tasks/reports', async (req, res) => {
  try {
    const me = req.user!;
    const reports = await UserModel.find({ managerId: me._id, isActive: { $ne: false } })
      .select('name email role')
      .sort({ name: 1 })
      .lean();
    res.json({
      reports: reports.map((u) => ({ _id: String(u._id), name: u.name, email: u.email, role: u.role })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load reports' });
  }
});

router.get('/api/tasks', async (req, res) => {
  try {
    const me = req.user!._id;
    const [toMe, byMe] = await Promise.all([
      TaskModel.find({ assignedToId: me }).sort({ createdAt: -1 }).limit(100).lean(),
      TaskModel.find({ assignedById: me }).sort({ createdAt: -1 }).limit(100).lean(),
    ]);
    res.json({ toMe: toMe.map(toRow), byMe: byMe.map(toRow) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

router.post('/api/tasks', async (req, res) => {
  try {
    const me = req.user!;
    const b = req.body ?? {};
    const title = String(b.title || '').trim();
    const assignedToId = String(b.assignedToId || '');
    if (!title || !assignedToId) return res.status(400).json({ error: 'title and assignedToId are required' });

    const assignee = await UserModel.findById(assignedToId).lean();
    if (!assignee) return res.status(404).json({ error: 'That person no longer exists' });

    // you may assign to anyone in your downline (your whole subtree); admins → anyone
    if (!isAdmin(me.role)) {
      const myTeam = await subtreeIds(me._id);
      if (!myTeam.has(String(assignee._id))) {
        return res.status(403).json({ error: 'You can only assign tasks to people in your team (your downline)' });
      }
    }

    const target = Number(b.targetProduction) || 0;
    const baseDoc = {
      title,
      details: String(b.details || '').trim(),
      targetProduction: target,
      department: String(b.department || '').trim(),
      machineId: b.machineId || null,
      jobId: b.jobId || null,
      jobNumber: String(b.jobNumber || '').trim(),
      assignedToId: assignee._id,
      assignedToName: assignee.name || '',
      assignedToRole: assignee.role || '',
      assignedById: me._id,
      assignedByName: me.name || '',
      assignedByRole: me.role || '',
      parentTaskId: b.parentTaskId || null,
      status: 'assigned',
    };
    // auto-assign a unique task number, retry if a concurrent create took it
    let task;
    for (let attempt = 0; attempt < 6; attempt++) {
      const taskNumber = await nextTaskNumber();
      try {
        task = await TaskModel.create({ taskNumber, ...baseDoc });
        break;
      } catch (e) {
        if ((e as { code?: number })?.code === 11000) continue;
        throw e;
      }
    }
    if (!task) return res.status(500).json({ error: 'Could not allocate a task number, please retry' });

    // notify the assignee
    const email = (assignee.email || '').toLowerCase();
    await NotificationModel.create({
      recipientUserId: assignee._id,
      email,
      audience: assignee.role,
      type: 'taskAssigned',
      severity: 'info',
      refType: 'task',
      refId: task._id,
      machineId: b.machineId || null,
      machineCode: b.machineId || '',
      title: `New task from ${me.name || 'your manager'}`,
      body: `${task.get('taskNumber')} · ${title}${target ? ` · target ${target.toLocaleString()} mtr` : ''}${b.details ? ` — ${b.details}` : ''}`,
    });
    notifyUserLive(req.app.get('io'), String(assignee._id));

    res.json({ ok: true, id: task._id, taskNumber: task.get('taskNumber') });
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign task', detail: String(err) });
  }
});

router.patch('/api/tasks/:id', async (req, res) => {
  try {
    const me = String(req.user!._id);
    const task = await TaskModel.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const mine = String(task.get('assignedToId')) === me || String(task.get('assignedById')) === me || isAdmin(req.user!.role);
    if (!mine) return res.status(403).json({ error: 'Not your task' });

    const status = String(req.body?.status || '');
    if (!['assigned', 'inProgress', 'done'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    task.set('status', status);
    await task.save();

    // tell the assigner when their assignee completes it
    if (status === 'done' && String(task.get('assignedById')) !== me) {
      const assigner = await UserModel.findById(task.get('assignedById')).lean();
      if (assigner) {
        await NotificationModel.create({
          recipientUserId: assigner._id,
          email: (assigner.email || '').toLowerCase(),
          audience: assigner.role,
          type: 'taskDone',
          severity: 'info',
          refType: 'task',
          refId: task._id,
          title: `Task completed`,
          body: `${task.get('assignedToName')} completed "${task.get('title')}"`,
        });
        notifyUserLive(req.app.get('io'), String(assigner._id));
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

export default router;
