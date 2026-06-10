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

// the built-in system roles, seeded once so the grid is never empty
const SEED_ROLES = [
  { name: 'Operator', slug: 'operator', description: 'Shop-floor operator', isSystem: false,
    permissions: { dashboard: ['view'], machines: ['view'] } },
  { name: 'Production Operator', slug: 'production-operator', description: 'Production operator', isSystem: false,
    permissions: { dashboard: ['view'], machines: ['view', 'update'], jobs: ['view'] } },
  { name: 'Production Supervisor', slug: 'supervisor', description: 'Supervises a line', isSystem: false,
    permissions: { dashboard: ['view'], machines: ['view', 'update'], jobs: ['view', 'update', 'approve'], downtime: ['view'] } },
  { name: 'QC Inspection', slug: 'qc-inspection', description: 'Quality control', isSystem: false,
    permissions: { dashboard: ['view'], machines: ['view'], history: ['view'] } },
  { name: 'System Admin', slug: 'system-admin', description: 'Full access', isSystem: true,
    permissions: Object.fromEntries(MODULES.map((m) => [m, [...ACTIONS]])) },
];

async function ensureSeeded() {
  const count = await RoleModel.estimatedDocumentCount();
  if (count === 0) {
    await RoleModel.insertMany(SEED_ROLES);
    return;
  }
  // Correct the isSystem flag on built-in roles for existing DBs (e.g. Operator and
  // Production Supervisor are no longer system roles). We only fix the flag — we do
  // NOT overwrite permissions, so any edits the admin already made are preserved.
  // Custom roles created by the admin are never touched.
  for (const sr of SEED_ROLES) {
    await RoleModel.updateOne({ slug: sr.slug }, { $set: { isSystem: sr.isSystem } });
  }
  // The System Admin role always keeps full access.
  const admin = SEED_ROLES.find((r) => r.slug === 'system-admin')!;
  await RoleModel.updateOne(
    { slug: 'system-admin' },
    { $set: { isSystem: true, permissions: admin.permissions } },
    { upsert: true }
  );
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
    const { name, description, permissions } = req.body ?? {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const slug = String(name).toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const exists = await RoleModel.findOne({ slug });
    if (exists) return res.status(409).json({ error: 'A role with that name already exists' });
    const role = await RoleModel.create({ name, slug, description: description || '', isSystem: false, permissions: permissions || {} });
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
    const { name, description, permissions } = req.body ?? {};
    if (name !== undefined) role.set('name', name);
    if (description !== undefined) role.set('description', description);
    if (permissions !== undefined) role.set('permissions', permissions);
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
