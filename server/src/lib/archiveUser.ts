// ============================================================
//  ARCHIVE USER  —  snapshot a login account into UserHistory
//  Called on temporary delete (suspend) and permanent delete.
// ============================================================
import { UserHistoryModel } from '../models/UserHistory';
import { RoleModel } from '../models/Role';
import type { User } from '@shared/types';

interface Actor {
  _id?: string;
  name?: string;
  email?: string;
}

function statusOf(doc: any): 'active' | 'disabled' | 'suspended' {
  if (doc.suspendedUntil && new Date(doc.suspendedUntil) > new Date()) return 'suspended';
  if (doc.isActive === false) return 'disabled';
  return 'active';
}

// Build a small activity timeline from what we know about the account.
function buildActivity(doc: any, deletionType: 'temporary' | 'permanent', by: string, reason: string) {
  const activity: { ts: Date; action: string; by: string; detail: string }[] = [];
  if (doc.createdAt) activity.push({ ts: new Date(doc.createdAt), action: 'created', by: '', detail: `Account created as ${doc.role}` });
  if (doc.lastLoginAt) activity.push({ ts: new Date(doc.lastLoginAt), action: 'lastLogin', by: '', detail: 'Last successful login' });
  activity.push({
    ts: new Date(),
    action: deletionType === 'temporary' ? 'temporary-delete' : 'permanent-delete',
    by,
    detail: reason || (deletionType === 'temporary' ? 'Temporarily deleted' : 'Permanently deleted'),
  });
  return activity;
}

export async function archiveUser(
  doc: any, // a mongoose User document (or lean object)
  opts: { deletionType: 'temporary' | 'permanent'; reason?: string; by?: Actor; suspendedUntil?: Date | null }
): Promise<void> {
  const role = doc.role as User['role'];

  // resolve the permission matrix snapshot (User.role enum mirrors a Role.slug)
  let permissions: Record<string, unknown> = {};
  try {
    const roleDoc = await RoleModel.findOne({ slug: role }).lean();
    if (roleDoc?.permissions) permissions = roleDoc.permissions as Record<string, unknown>;
  } catch {
    /* permissions snapshot is best-effort */
  }

  const byName = opts.by?.name || '';
  const byLabel = byName || opts.by?.email || 'system';

  await UserHistoryModel.create({
    userId: String(doc._id),
    name: doc.name,
    email: doc.email,
    role,
    permissions,
    assignedLines: doc.assignedLines || [],
    assignedMachineIds: doc.assignedMachineIds || [],
    accountStatus: statusOf(doc),
    deletionType: opts.deletionType,
    reason: opts.reason || '',
    deletedById: opts.by?._id || '',
    deletedByName: byName,
    deletedByEmail: opts.by?.email || '',
    deletedAt: new Date(),
    suspendedUntil: opts.suspendedUntil ?? null,
    accountCreatedAt: doc.createdAt || null,
    lastLoginAt: doc.lastLoginAt || null,
    activity: buildActivity(doc, opts.deletionType, byLabel, opts.reason || ''),
  });
}
