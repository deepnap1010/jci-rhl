// ============================================================
//  ROLES ROUTE  —  dynamic RBAC management
//  GET    /api/roles            list roles (+ seeds system roles once)
//  POST   /api/roles            create a custom role
//  PATCH  /api/roles/:id        update permissions / name (not system)
//  DELETE /api/roles/:id        delete a custom role (not system)
// ============================================================
import { Router } from 'express';
import { RoleModel, MODULES, ACTIONS } from '../models/Role';

const router = Router();

// ── ROLES ARE ADMIN-MANAGED ─────────────────────────────────
// The ONLY built-in role is "Super Admin" (the owner): it's locked, always has full
// access, and can never be deleted — so a misconfigured custom role can't lock anyone
// out. EVERY other role is CREATED by the Super Admin on this page, and those are what
// appear in the User Management dropdown. Each role declares a data SCOPE (all / lines /
// machines / own) which the backend enforces through the proven scoping rules.
const fullPerms = () => Object.fromEntries(MODULES.map((m) => [m, [...ACTIONS]]));
const SCOPES = ['all', 'lines', 'machines', 'own'];

// Clear the old auto-seeded placeholder roles so the list starts clean (just Super Admin +
// whatever the admin creates). Obsolete slugs that an admin's name-based slug can NEVER
// produce (camelCase enum keys + old placeholders) are ALWAYS removed; the lowercase ones an
// admin could re-create by name are cleared only ONCE (guarded), so admin-created roles are
// never auto-deleted afterwards.
const ALWAYS_RETIRE = ['admin', 'plantHead', 'prodManager', 'production-operator', 'qc-inspection', 'system-admin'];
const ONCE_RETIRE = ['supervisor', 'operator', 'employee'];

async function ensureSeeded() {
  await RoleModel.updateOne(
    { slug: 'superAdmin' },
    { $set: { name: 'Super Admin', description: 'Full access to everything', isSystem: true, scope: 'all', permissions: fullPerms() } },
    { upsert: true }
  );
  await RoleModel.deleteMany({ slug: { $in: ALWAYS_RETIRE } });
  const sa = await RoleModel.findOne({ slug: 'superAdmin' });
  if (sa && !sa.get('rolesReset')) {
    await RoleModel.deleteMany({ slug: { $in: ONCE_RETIRE } });
    sa.set('rolesReset', true);
    await sa.save();
  }
}

router.get('/api/roles', async (_req, res) => {
  try {
    await ensureSeeded();
    const roles = await RoleModel.find().sort({ isSystem: -1, name: 1 }).lean();
    res.json({ roles, modules: MODULES, actions: ACTIONS });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load roles', detail: String(err) });
  }
});

router.post('/api/roles', async (req, res) => {
  try {
    const { name, description, permissions, scope } = req.body ?? {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const slug = String(name).toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (['superadmin', 'super-admin', 'admin', 'system-admin'].includes(slug)) return res.status(409).json({ error: 'That name is reserved' });
    const exists = await RoleModel.findOne({ slug });
    if (exists) return res.status(409).json({ error: 'A role with that name already exists' });
    const validScope = SCOPES.includes(scope) ? scope : 'machines';
    const role = await RoleModel.create({ name, slug, description: description || '', isSystem: false, scope: validScope, permissions: permissions || {} });
    res.json({ ok: true, id: role._id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create role', detail: String(err) });
  }
});

router.patch('/api/roles/:id', async (req, res) => {
  try {
    const role = await RoleModel.findById(req.params.id);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (role.get('isSystem')) return res.status(403).json({ error: 'System roles cannot be edited' });
    const { name, description, permissions, scope } = req.body ?? {};
    if (name !== undefined) role.set('name', name);
    if (description !== undefined) role.set('description', description);
    if (permissions !== undefined) role.set('permissions', permissions);
    if (scope !== undefined && SCOPES.includes(scope)) role.set('scope', scope);
    await role.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update role', detail: String(err) });
  }
});

router.delete('/api/roles/:id', async (req, res) => {
  try {
    const role = await RoleModel.findById(req.params.id);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (role.get('isSystem')) return res.status(403).json({ error: 'System roles cannot be deleted' });
    await role.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete role', detail: String(err) });
  }
});

export default router;
