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

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const payload = verifyToken(token);
    const doc = await UserModel.findById(payload.sub).lean();
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
