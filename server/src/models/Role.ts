// ============================================================
//  ROLE MODEL  —  dynamic RBAC
//  A role is a name + a permission matrix (module -> actions).
//  System roles (isSystem) cannot be edited or deleted via API.
//  This is what authentication/authorization will read later.
// ============================================================
import { Schema, model } from 'mongoose';

// the actions a role can be granted on a module
export const ACTIONS = ['view', 'create', 'update', 'delete', 'execute', 'approve', 'admin'] as const;

// the modules permissions can be set on — these mirror the app's real pages
export const MODULES = [
  'dashboard', 'machines', 'jobs', 'downtime', 'history',
  'operatorMap', 'roles', 'aiQuery',
] as const;

const RoleSchema = new Schema(
  {
    name: { type: String, required: true },            // "Production Operator"
    slug: { type: String, required: true, unique: true }, // "production-operator"
    description: { type: String, default: '' },
    isSystem: { type: Boolean, default: false },       // system roles are read-only
    // data scope this role grants: all / lines / machines / own (enforced via the proven rules)
    scope: { type: String, enum: ['all', 'lines', 'machines', 'own'], default: 'machines' },
    rolesReset: { type: Boolean, default: false },     // one-time cleanup guard (on the Super Admin doc)
    // permissions: { module: [actions] }  e.g. { production: ['view','update'] }
    permissions: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const RoleModel = model('Role', RoleSchema);
