// ============================================================
//  NOTIFICATIONS ROUTE  —  the current user's personal inbox
//  GET  /api/notifications            → { items, unread }
//  POST /api/notifications/:id/read   → mark one read
//  POST /api/notifications/read-all   → mark all read
//
//  "Mine" = addressed to my login id, OR to my email (covers
//  notifications created before a login existed for that email).
// ============================================================
import { Router } from 'express';
import { NotificationModel } from '../models/Notification';
import type { User } from '@shared/types';

const router = Router();

function mineFilter(user: User) {
  const or: Record<string, unknown>[] = [{ recipientUserId: user._id }];
  if (user.email) or.push({ email: String(user.email).toLowerCase().trim() });
  return { $or: or };
}

router.get('/api/notifications', async (req, res) => {
  try {
    const filter = mineFilter(req.user!);
    const docs = await NotificationModel.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    const unread = await NotificationModel.countDocuments({ ...filter, read: false });
    const items = docs.map((n) => ({
      id: String(n._id),
      audience: n.audience,
      type: n.type,
      severity: (n as { severity?: string }).severity || 'info',
      refType: (n as { refType?: string }).refType || null,
      refId: (n as { refId?: unknown }).refId ? String((n as { refId: unknown }).refId) : null,
      actionType: (n as { actionType?: string }).actionType || null,
      machineCode: (n as { machineCode?: string }).machineCode || '',
      jobNumber: n.jobNumber || '',
      orderNumber: n.orderNumber || '',
      fabricName: n.fabricName || '',
      stage: n.stage || '',
      machineId: n.machineId ?? null,
      targetProduction: n.targetProduction || 0,
      shift: n.shift || 'A',
      title: n.title || '',
      body: n.body || '',
      read: !!n.read,
      ts: (n as { createdAt?: Date }).createdAt
        ? new Date((n as { createdAt: Date }).createdAt).toISOString()
        : new Date().toISOString(),
    }));
    res.json({ items, unread });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

router.post('/api/notifications/:id/read', async (req, res) => {
  try {
    await NotificationModel.updateOne(
      { _id: req.params.id, ...mineFilter(req.user!) },
      { $set: { read: true, readAt: new Date() } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

router.post('/api/notifications/read-all', async (req, res) => {
  try {
    await NotificationModel.updateMany(
      { ...mineFilter(req.user!), read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

export default router;
