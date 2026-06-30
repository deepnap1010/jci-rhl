// ============================================================
//  AUTH ROUTE  —  login / me / change-password
//  POST /api/auth/login            { email, password } → { token, user }
//  GET  /api/auth/me               (auth) → { user }
//  POST /api/auth/change-password  (auth) { currentPassword, newPassword }
// ============================================================
import { Router } from 'express';
import { UserModel } from '../models/User';
import { signToken } from '../lib/token';
import { requireAuth, invalidateUserCache } from '../middleware/auth';
import type { Role } from '@shared/types';

const router = Router();

// shape the user object we hand back to the client (never the hash)
function toClientUser(doc: any) {
  return {
    _id: String(doc._id),
    name: doc.name,
    email: doc.email,
    role: doc.role as Role,
    roleSlug: doc.roleSlug || null,
    roleName: doc.roleName || null,
    assignedMachineIds: doc.assignedMachineIds || [],
    assignedLines: doc.assignedLines || [],
    mustChangePassword: !!doc.mustChangePassword,
    isActive: doc.isActive !== false,
  };
}

router.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const user = await UserModel.findOne({ email: String(email).toLowerCase().trim() });
    // Same generic message whether the email or the password is wrong (no user enumeration).
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    // "temporary delete": block while suspended, auto-restore once it expires.
    const suspended = user.get('suspendedUntil') as Date | null;
    if (suspended && new Date(suspended) > new Date()) {
      return res.status(403).json({
        error: `Account is temporarily disabled until ${new Date(suspended).toLocaleString()}`,
      });
    }
    if (suspended) {
      user.set('suspendedUntil', null); // expired → restore on this login
    }

    if (user.get('isActive') === false) return res.status(403).json({ error: 'Account is disabled' });

    const ok = await (user as any).verifyPassword(password);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    user.set('lastLoginAt', new Date());
    await user.save();
    invalidateUserCache(String(user._id));

    const token = signToken({ sub: String(user._id), role: user.get('role') as Role });
    res.json({ token, user: toClientUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Login failed', detail: String(err) });
  }
});

router.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

router.post('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const user = await UserModel.findById(req.user!._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const ok = await (user as any).verifyPassword(currentPassword);
    if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });

    await (user as any).setPassword(newPassword);
    user.set('mustChangePassword', false);
    await user.save();
    invalidateUserCache(String(user._id));

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password', detail: String(err) });
  }
});

export default router;
