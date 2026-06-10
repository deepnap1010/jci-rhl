// ============================================================
//  USER NOTIFY  —  generic in-app notification to one person
//
//  Used for org / account changes (manager reassigned, role
//  changed, machines reassigned, (de)activated…). Persists a
//  Notification and pushes the same `notify:new` socket event the
//  bell already listens for, so the recipient sees it instantly.
// ============================================================
import type { Server } from 'socket.io';
import { NotificationModel } from '../models/Notification';
import { UserModel } from '../models/User';

// the Notification model's audience enum — coerce anything else (e.g. 'employee') to a safe value
const AUDIENCE = new Set(['operator', 'supervisor', 'prodManager', 'plantHead', 'superAdmin', 'admin']);

export async function notifyUser(
  io: Server | null,
  userId: unknown,
  opts: { type: string; title: string; body: string; severity?: 'info' | 'warning' | 'critical' }
): Promise<void> {
  if (!userId) return;
  try {
    const user = await UserModel.findById(userId as string).lean();
    if (!user) return;
    const email = (user.email || '').toLowerCase().trim();
    const role = String((user as { role?: string }).role || '');
    await NotificationModel.create({
      recipientUserId: user._id,
      email,
      audience: AUDIENCE.has(role) ? role : 'operator',
      type: opts.type,
      severity: opts.severity || 'info',
      title: opts.title,
      body: opts.body,
    });
    if (io) io.emit('notify:new', { userId: String(user._id), email });
  } catch (e) {
    console.warn('⚠️  user notification failed:', (e as Error).message);
  }
}
