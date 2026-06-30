// ============================================================
//  MACHINES ROUTE
//  Returns role-scoped machines, each derived from its latest
//  telemetry into the dashboard view-model (status + common
//  metrics + a dynamic field registry from metricsSeen).
// ============================================================
import { Router } from 'express';
import { MachineModel } from '../models/Machine';
import { getScopedViews, getScopedViewsStaleAware, latestByMachine, latestByMachineInWindow, deriveView, invalidateMachineCaches, MachineDoc } from '../lib/derive';

const router = Router();

// GET /api/machines  → MachineView[]  (role-scoped)
router.get('/api/machines', async (req, res) => {
  try {
    // optional ?from=&to= → historical view (each machine's latest reading in the window)
    const f = req.query.from ? new Date(String(req.query.from)) : null;
    const t = req.query.to ? new Date(String(req.query.to)) : null;
    const range = f && t && !isNaN(f.getTime()) && !isNaN(t.getTime()) ? { from: f, to: t } : null;
    if (range) {
      const latest = await latestByMachineInWindow(range.from, range.to);
      return res.json(await getScopedViews(req.user!, latest));
    }
    // live view — but stale-aware: if the feed is offline, show the last-recorded-day
    // statuses (so Running/Idle/Stopped counts match the dashboard) while keeping each
    // machine's last-known values, instead of a wall of "offline".
    res.json(await getScopedViewsStaleAware(req.user!));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load machines' });
  }
});

// GET /api/machines/:id  → single MachineView (id = machineId code)
router.get('/api/machines/:id', async (req, res) => {
  try {
    const machine = await MachineModel.findOne({ machineId: req.params.id }).lean();
    if (!machine) return res.status(404).json({ error: 'Machine not found' });
    const latest = await latestByMachine();
    const view = deriveView(machine as unknown as MachineDoc, latest.get(req.params.id) || null);
    res.json(view);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load machine' });
  }
});

// PATCH /api/machines/:id  → edit editable config (name / type / phase)
// Live telemetry values stay read-only (the PLC owns those).
router.patch('/api/machines/:id', async (req, res) => {
  try {
    const b = req.body ?? {};
    const set: Record<string, unknown> = {};
    if (b.name !== undefined) set.name = b.name;
    if (b.type !== undefined) set.type = b.type;
    if (b.phase !== undefined) set.phase = Number(b.phase) || 1;
    await MachineModel.updateOne({ machineId: req.params.id }, set);
    invalidateMachineCaches(); // reflect config changes without waiting for TTL
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update machine' });
  }
});

export default router;
