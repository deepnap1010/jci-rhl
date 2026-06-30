// ============================================================
//  USERS ROUTE  —  login-account management (Super Admin only)
//  GET    /api/users            list login accounts
//  POST   /api/users            create a user + email credentials
//  PATCH  /api/users/:id        update role/scope/active/name
//  POST   /api/users/:id/reset-password   set a new temp password + email it
//  DELETE /api/users/:id        delete a login account
//
//  Every route here is gated to superAdmin via requireRole.
// ============================================================
import { Router } from 'express';
import { UserModel } from '../models/User';
import { UserHistoryModel } from '../models/UserHistory';
import { requireAuth, requireRole, invalidateUserCache } from '../middleware/auth';
import { sendCredentialsEmail } from '../lib/mailer';
import { archiveUser } from '../lib/archiveUser';
import { notifyUser } from '../lib/userNotify';
import { RoleModel } from '../models/Role';
import { scopeOf, type ScopeKind } from '@shared/permissions';
import type { Role } from '@shared/types';

const router = Router();

// human-friendly role names for change messages
const ROLE_LABEL: Record<string, string> = {
  superAdmin: 'Super Admin', admin: 'Admin', plantHead: 'Production Head',
  prodManager: 'Production Manager', supervisor: 'Supervisor', operator: 'Operator', employee: 'Employee',
};

// Custom roles created in Roles & Permissions map to an EFFECTIVE built-in role by their
// data scope, so all the existing scope/capability enforcement keeps working unchanged.
const EFFECTIVE_BY_SCOPE: Record<ScopeKind, Role> = { all: 'plantHead', lines: 'prodManager', machines: 'supervisor', own: 'operator' };
const BUILTIN_ASSIGNABLE: string[] = ['plantHead', 'prodManager', 'supervisor', 'operator', 'employee'];

// Resolve an assigned role (an admin-created Role-document slug, or a legacy built-in enum)
// into { effective built-in role, scope, display name } used for storage + enforcement.
async function resolveAssignedRole(slug: string): Promise<{ effectiveRole: Role; roleSlug: string; roleName: string; scope: ScopeKind } | null> {
  if (!slug) return null;
  if (BUILTIN_ASSIGNABLE.includes(slug)) {
    const r = slug as Role;
    return { effectiveRole: r, roleSlug: slug, roleName: ROLE_LABEL[slug] || slug, scope: scopeOf(r) };
  }
  const doc = (await RoleModel.findOne({ slug }).lean()) as { name?: string; isSystem?: boolean; scope?: ScopeKind } | null;
  if (!doc || doc.isSystem) return null; // unknown role, or the locked Super Admin (never assignable here)
  const scope = (doc.scope as ScopeKind) || 'machines';
  return { effectiveRole: EFFECTIVE_BY_SCOPE[scope], roleSlug: slug, roleName: doc.name || slug, scope };
}

function toRow(doc: any) {
  return {
    _id: String(doc._id),
    name: doc.name,
    email: doc.email,
    role: doc.role,
    roleSlug: doc.roleSlug || null,
    roleName: doc.roleName || null,
    assignedMachineIds: doc.assignedMachineIds || [],
    assignedLines: doc.assignedLines || [],
    managerId: doc.managerId ? String(doc.managerId) : null,
    mustChangePassword: !!doc.mustChangePassword,
    isActive: doc.isActive !== false,
    // only report an active (future) suspension; expired ones read as not-suspended
    suspendedUntil:
      doc.suspendedUntil && new Date(doc.suspendedUntil) > new Date()
        ? new Date(doc.suspendedUntil).toISOString()
        : null,
    lastLoginAt: doc.lastLoginAt || null,
    createdAt: doc.createdAt || null,
  };
}

// all /api/users routes require an authenticated Super Admin
router.use('/api/users', requireAuth, requireRole('superAdmin'));

router.get('/api/users', async (_req, res) => {
  try {
    const users = await UserModel.find().sort({ createdAt: -1 }).lean();
    res.json(users.map(toRow));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load users', detail: String(err) });
  }
});

router.post('/api/users', async (req, res) => {
  try {
    const b = req.body ?? {};
    const name = String(b.name || '').trim();
    const email = String(b.email || '').toLowerCase().trim();
    const password = String(b.password || '');
    const roleInput = String(b.role || '');

    if (!name || !email || !password || !roleInput) {
      return res.status(400).json({ error: 'name, email, password and role are required' });
    }
    const resolved = await resolveAssignedRole(roleInput);
    if (!resolved) {
      return res.status(400).json({ error: 'Pick a valid role — create one in Roles & Permissions first.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Temporary password must be at least 8 characters' });
    }
    const exists = await UserModel.findOne({ email });
    if (exists) return res.status(409).json({ error: 'A user with that email already exists' });

    const user = new UserModel({
      name,
      email,
      role: resolved.effectiveRole,
      roleSlug: resolved.roleSlug,
      roleName: resolved.roleName,
      assignedMachineIds: Array.isArray(b.assignedMachineIds) ? b.assignedMachineIds : [],
      assignedLines: Array.isArray(b.assignedLines) ? b.assignedLines : [],
      managerId: b.managerId || null,
      mustChangePassword: true,
      isActive: true,
      createdBy: req.user!._id,
    });
    await (user as any).setPassword(password);
    await user.save();

    // email the credentials (falls back to console if SMTP is off)
    const { sent } = await sendCredentialsEmail({
      to: email,
      name,
      role: resolved.effectiveRole,
      tempPassword: password,
    });

    res.json({ ok: true, id: user._id, emailSent: sent });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user', detail: String(err) });
  }
});

router.patch('/api/users/:id', async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.get('role') === 'superAdmin') {
      return res.status(403).json({ error: 'The Super Admin account cannot be modified here' });
    }
    const b = req.body ?? {};
    // snapshot the fields that matter to the person, so we can tell them what changed
    const before = {
      role: String(user.get('role') || ''),
      managerId: user.get('managerId') ? String(user.get('managerId')) : null,
      machines: ((user.get('assignedMachineIds') as string[]) || []).slice(),
      isActive: user.get('isActive') !== false,
    };

    if (b.name !== undefined) user.set('name', String(b.name).trim());
    if (b.role !== undefined) {
      const resolved = await resolveAssignedRole(String(b.role));
      if (!resolved) return res.status(400).json({ error: 'Invalid role' });
      user.set('role', resolved.effectiveRole);
      user.set('roleSlug', resolved.roleSlug);
      user.set('roleName', resolved.roleName);
    }
    if (b.assignedMachineIds !== undefined) user.set('assignedMachineIds', b.assignedMachineIds);
    if (b.assignedLines !== undefined) user.set('assignedLines', b.assignedLines);
    if (b.managerId !== undefined) user.set('managerId', b.managerId || null);
    if (b.isActive !== undefined) user.set('isActive', !!b.isActive);
    await user.save();
    invalidateUserCache(req.params.id); // role/scope/active changed → drop the auth cache now

    // build a human-readable list of what changed, then notify the person
    const changes: string[] = [];
    const newRole = String(user.get('role') || '');
    if (newRole !== before.role) changes.push(`role is now ${ROLE_LABEL[newRole] || newRole}`);

    const newManagerId = user.get('managerId') ? String(user.get('managerId')) : null;
    if (newManagerId !== before.managerId) {
      if (newManagerId) {
        const mgr = await UserModel.findById(newManagerId).select('name').lean();
        changes.push(`you now report to ${(mgr as { name?: string } | null)?.name || 'a new manager'}`);
      } else {
        changes.push('you no longer have an assigned manager');
      }
    }

    const newMachines = ((user.get('assignedMachineIds') as string[]) || []).slice();
    const machinesChanged = newMachines.length !== before.machines.length || newMachines.some((m) => !before.machines.includes(m));
    if (b.assignedMachineIds !== undefined && machinesChanged) {
      changes.push(newMachines.length ? `assigned to ${newMachines.join(', ')}` : 'removed from all machines');
    }

    const newActive = user.get('isActive') !== false;
    if (newActive !== before.isActive) changes.push(newActive ? 'your account was reactivated' : 'your account was deactivated');

    if (changes.length) {
      const io = req.app.get('io');
      await notifyUser(io, user._id, {
        type: 'accountChange',
        title: 'Your account was updated',
        body: changes.join(' · '),
        severity: !newActive ? 'warning' : 'info',
      });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user', detail: String(err) });
  }
});

router.post('/api/users/:id/reset-password', async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const password = String(req.body?.password || '');
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    await (user as any).setPassword(password);
    user.set('mustChangePassword', true);
    await user.save();
    invalidateUserCache(req.params.id);

    const { sent } = await sendCredentialsEmail({
      to: user.get('email') as string,
      name: user.get('name') as string,
      role: user.get('role') as Role,
      tempPassword: password,
    });
    res.json({ ok: true, emailSent: sent });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password', detail: String(err) });
  }
});

// Temporary delete: suspend the account until a given date (auto-restores after).
router.post('/api/users/:id/suspend', async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.get('role') === 'superAdmin') {
      return res.status(403).json({ error: 'The Super Admin account cannot be suspended' });
    }
    const until = new Date(req.body?.until);
    if (isNaN(until.getTime())) return res.status(400).json({ error: 'A valid "until" date is required' });
    if (until <= new Date()) return res.status(400).json({ error: 'The end date must be in the future' });

    user.set('suspendedUntil', until);
    await user.save();
    invalidateUserCache(req.params.id); // suspension must take effect immediately

    // record the temporary deletion in history
    await archiveUser(user.toObject(), {
      deletionType: 'temporary',
      reason: req.body?.reason || '',
      by: req.user,
      suspendedUntil: until,
    });

    res.json({ ok: true, suspendedUntil: until.toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to suspend user', detail: String(err) });
  }
});

// Restore a temporarily-deleted (suspended) account immediately.
router.post('/api/users/:id/restore', async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.set('suspendedUntil', null);
    user.set('isActive', true);
    await user.save();
    invalidateUserCache(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore user', detail: String(err) });
  }
});

router.delete('/api/users/:id', async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.get('role') === 'superAdmin') {
      return res.status(403).json({ error: 'The Super Admin account cannot be deleted' });
    }

    // archive a full snapshot BEFORE removing the live document
    await archiveUser(user.toObject(), {
      deletionType: 'permanent',
      reason: req.body?.reason || '',
      by: req.user,
    });

    await user.deleteOne();
    invalidateUserCache(req.params.id); // deleted user must be rejected immediately
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user', detail: String(err) });
  }
});

// ── User History (archive of deleted accounts) ─────────────
// GET /api/users/history?page=1&limit=10&q=&type=temporary|permanent
// Gated to superAdmin (same router.use guard above covers /api/users*).
router.get('/api/users/history', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '10'), 10) || 10));
    const q = String(req.query.q || '').trim();
    const type = String(req.query.type || '').trim(); // '', 'temporary', 'permanent'

    const filter: Record<string, unknown> = {};
    if (type === 'temporary' || type === 'permanent') filter.deletionType = type;
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { role: rx }, { reason: rx }, { deletedByName: rx }];
    }

    const total = await UserHistoryModel.countDocuments(filter);
    const rows = await UserHistoryModel.find(filter)
      .sort({ deletedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      rows,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load user history', detail: String(err) });
  }
});

export default router;
