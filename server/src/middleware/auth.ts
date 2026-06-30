// ============================================================
//  AUTH MIDDLEWARE  —  real JWT authentication
//
//  Every protected request must send:
//      Authorization: Bearer <token>
//  We verify the token, load the live user from the DB (so a
//  disabled/deleted user is rejected immediately), and attach
//  it to req.user. Routes + scopeFilter read req.user.
// ============================================================
import { Request, Response, NextFunction } from 'express';
import { User, Role } from '@shared/types';
import { verifyToken } from '../lib/token';
import { UserModel } from '../models/User';

// Attach `user` to the Express request object.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

// Per-request auth hits the DB (findById) to reject disabled/deleted users immediately.
// At thousands of users polling, that's thousands of findById/sec — the first DB resource
// to exhaust. Cache the loaded user briefly in-process to collapse the repeat lookups.
// Trade-off: a disable/role/scope change takes up to AUTH_CACHE_MS to take effect; call
// invalidateUserCache(id) from user-mutation routes to make it instant. Time-based checks
// (isActive / suspendedUntil) are still re-evaluated on EVERY request from the cached doc.
const AUTH_CACHE_MS = Number(process.env.AUTH_CACHE_MS) || 15000;
type CachedDoc = {
  _id: unknown; name: string; email: string; role: string; roleSlug?: string | null; roleName?: string | null;
  assignedMachineIds?: string[]; assignedLines?: string[];
  mustChangePassword?: boolean; isActive?: boolean; suspendedUntil?: Date | null;
};
const userCache = new Map<string, { at: number; doc: CachedDoc | null }>();

/** Drop a user (or all users) from the auth cache so the next request reloads from the DB. */
export function invalidateUserCache(id?: string) {
  if (id) userCache.delete(String(id));
  else userCache.clear();
}

async function loadUser(id: string): Promise<CachedDoc | null> {
  const hit = userCache.get(id);
  if (hit && Date.now() - hit.at < AUTH_CACHE_MS) return hit.doc;
  const doc = (await UserModel.findById(id).lean()) as CachedDoc | null;
  if (userCache.size > 5000) userCache.clear(); // bound the cache
  userCache.set(id, { at: Date.now(), doc });
  return doc;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const payload = verifyToken(token);
    const doc = await loadUser(String(payload.sub));
    if (!doc) return res.status(401).json({ error: 'User no longer exists' });
    if (doc.isActive === false) return res.status(403).json({ error: 'Account is disabled' });
    if (doc.suspendedUntil && new Date(doc.suspendedUntil) > new Date()) {
      return res.status(403).json({ error: 'Account is temporarily disabled' });
    }

    req.user = {
      _id: String(doc._id),
      name: doc.name,
      email: doc.email,
      role: doc.role as Role,
      roleSlug: doc.roleSlug ?? null,
      roleName: doc.roleName ?? null,
      assignedMachineIds: doc.assignedMachineIds || [],
      assignedLines: (doc.assignedLines || []) as User['assignedLines'],
      mustChangePassword: doc.mustChangePassword,
      isActive: doc.isActive,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Gate a route to one or more roles. Use after requireAuth.
//   router.post('/api/users', requireRole('superAdmin'), handler)
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
