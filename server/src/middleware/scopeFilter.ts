// ============================================================
//  SCOPE FILTER  —  the security wall
//  Turns a user's role into a MongoDB filter object.
//  Every list route runs through this, so data scoping is
//  enforced ONCE, centrally — not re-written in each route.
//
//  admin/plantHead  → {}                              (everything)
//  prodManager      → { department: { $in: lines } }  (their depts)
//  supervisor/oper. → { _id: { $in: machineIds } }    (their machines)
// ============================================================
import { ROLE_CONFIG } from '../config/roleConfig';
import { User } from '@shared/types';

export function buildScopeFilter(user: User): Record<string, unknown> {
  const { scope } = ROLE_CONFIG[user.role];

  switch (scope) {
    case 'all':
      return {};

    case 'assignedLines':
      return { department: { $in: user.assignedLines } };

    case 'assignedMachines':
      return { _id: { $in: user.assignedMachineIds } };

    default:
      // Safety: if scope is somehow unknown, return NOTHING
      // (deny by default is safer than leak by default).
      return { _id: { $in: [] } };
  }
}
