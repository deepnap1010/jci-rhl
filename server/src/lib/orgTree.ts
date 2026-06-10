// ============================================================
//  ORG TREE HELPERS  —  shared subtree math
// ============================================================
import { UserModel } from '../models/User';

// All descendant user ids below a root (not including the root). Cycle-safe.
export async function subtreeIds(rootId: unknown): Promise<Set<string>> {
  const users = await UserModel.find().select('managerId').lean();
  const byMgr = new Map<string, string[]>();
  for (const u of users) {
    const m = String((u as { managerId?: unknown }).managerId || '');
    if (!byMgr.has(m)) byMgr.set(m, []);
    byMgr.get(m)!.push(String(u._id));
  }
  const out = new Set<string>();
  const stack = [String(rootId)];
  while (stack.length) {
    const id = stack.pop()!;
    for (const c of byMgr.get(id) || []) if (!out.has(c)) { out.add(c); stack.push(c); }
  }
  return out;
}
