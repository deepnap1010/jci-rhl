// ============================================================
//  HISTORY ROUTE  —  reads the time-series telemetry directly
//  Filters: machine, time range, status. Each row is derived
//  through the same layer the live view uses.
//
//  Perf: scope is resolved from the (tiny) machines collection
//  only — we deliberately AVOID getScopedViews()/latestByMachine(),
//  which aggregates 2h of telemetry across all machines on every
//  call. History derives each row from its own telemetry doc, so
//  that live-state aggregation was pure waste here.
// ============================================================
import { Router } from 'express';
import { TelemetryModel } from '../models/Telemetry';
import { MachineModel } from '../models/Machine';
import { deriveView, departmentFor, MachineDoc, TelemetryDoc } from '../lib/derive';
import { User } from '@shared/types';

const router = Router();

// Only these data.* fields are read by deriveView. Projecting them (instead of
// transferring each reading's full free-form `data` blob) slashes the payload
// from Atlas — the dominant cost when listing hundreds of rows. The full `data`
// is still fetched when the drill-down modal asks for it (withData=1).
const HISTORY_PROJECTION = {
  serverTs: 1, machineId: 1,
  'data.status': 1, 'data.machineRunning': 1, 'data.dept': 1,
  'data.speed': 1, 'data.machineSpeed': 1, 'data.fabricSpeed': 1, 'data.fabricSpeedRef': 1,
  'data.production': 1, 'data.fabricLength': 1, 'data.counter': 1,
  'data.temperature': 1, 'data.temp': 1, 'data.bathTemp': 1,
  'data.waterLPH': 1, 'data.waterFlow': 1, 'data.water': 1, 'data.mainWaterTotal': 1,
  'data.runningSeconds': 1, 'data.idleSeconds': 1, 'data.stoppedSeconds': 1, 'data.downtimeSeconds': 1,
} as const;

// The machines collection is tiny and changes rarely (config/ingest only),
// but history is called frequently. Cache it briefly to avoid a DB round-trip
// on every request. (Live telemetry/state is NOT cached — that's separate.)
let machineCache: { at: number; docs: Record<string, unknown>[] } | null = null;
const MACHINE_TTL_MS = 15_000;
async function allMachinesCached(): Promise<Record<string, unknown>[]> {
  const now = Date.now();
  if (machineCache && now - machineCache.at < MACHINE_TTL_MS) return machineCache.docs;
  const docs = (await MachineModel.find().lean()) as unknown as Record<string, unknown>[];
  machineCache = { at: now, docs };
  return docs;
}

// lightweight, telemetry-free scope: which machine docs may this user see?
async function scopedMachines(user: User) {
  const machines = await allMachinesCached();
  if (user.role === 'superAdmin' || user.role === 'admin' || user.role === 'plantHead') return machines;
  if (user.role === 'prodManager') {
    const lines = new Set(user.assignedLines);
    return machines.filter((m) => lines.has(departmentFor({}, (m as { type?: string }).type)));
  }
  // supervisor / operator → only their assigned machines
  const ids = new Set(user.assignedMachineIds);
  return machines.filter((m) => ids.has((m as { machineId: string }).machineId));
}

router.get('/api/history', async (req, res) => {
  try {
    const machines = await scopedMachines(req.user!);
    const scopedIds = machines.map((m) => (m as { machineId: string }).machineId);
    const typeBy = new Map(machines.map((m) => [(m as { machineId: string }).machineId, (m as { type?: string }).type]));
    const nameBy = new Map(machines.map((m) => [(m as { machineId: string }).machineId, (m as { name?: string }).name]));

    const filter: Record<string, unknown> = { machineId: { $in: scopedIds } };
    if (req.query.machineId) {
      // honor the requested machine only if it's within scope
      if (!scopedIds.includes(String(req.query.machineId))) {
        return res.json({ rows: [], kpis: { total: 0, runningEntries: 0, downtimeEntries: 0 } });
      }
      filter.machineId = req.query.machineId;
    }
    if (req.query.status) filter['data.status'] = req.query.status;

    const ts: Record<string, Date> = {};
    if (req.query.from) ts.$gte = new Date(String(req.query.from));
    if (req.query.to) ts.$lte = new Date(String(req.query.to));
    if (Object.keys(ts).length) filter.serverTs = ts;

    const limit = Math.min(Number(req.query.limit) || 300, 1000);
    // opt-in: include each reading's raw PLC payload (used by the drill-down modal)
    const withData = req.query.withData === '1' || req.query.withData === 'true';
    // opt-in: one reading per minute → a brief, wider-span overview instead of every few seconds
    const byMinute = req.query.bucket === 'minute' || req.query.bucket === '60';

    type RawDoc = { _id: unknown; machineId: string; serverTs: Date; data: Record<string, unknown> };
    let docs: RawDoc[];
    if (byMinute) {
      const agg = await TelemetryModel.aggregate([
        { $match: filter },
        { $sort: { serverTs: -1 } },
        { $group: { _id: { m: '$machineId', t: { $dateTrunc: { date: '$serverTs', unit: 'minute' } } }, doc: { $first: '$$ROOT' } } },
        { $sort: { 'doc.serverTs': -1 } },
        { $limit: limit },
      ]);
      docs = agg.map((r) => r.doc as RawDoc);
    } else {
      // project only the fields deriveView needs (unless the caller wants the raw payload)
      const projection = withData ? undefined : HISTORY_PROJECTION;
      docs = (await TelemetryModel.find(filter, projection).sort({ serverTs: -1 }).limit(limit).lean()) as unknown as RawDoc[];
    }

    const rows = docs.map((d) => {
      const view = deriveView(
        { machineId: d.machineId, type: typeBy.get(d.machineId), name: nameBy.get(d.machineId) } as MachineDoc,
        d as unknown as TelemetryDoc,
        true // each row is the reading's own moment → status as recorded
      );
      const s = view.state!;
      return {
        _id: String(d._id),
        ts: s.updatedAt,
        machineCode: d.machineId,
        department: view.department,
        status: view.status,
        speed: s.speed,
        production: s.production,
        temperature: s.temperature,
        waterFlow: s.waterFlow,
        efficiency: s.efficiency,
        ...(withData ? { data: d.data } : {}),
      };
    });

    const kpis = {
      total: rows.length,
      runningEntries: rows.filter((r) => r.status === 'running').length,
      downtimeEntries: rows.filter((r) => r.status === 'idle' || r.status === 'stopped').length,
    };

    res.json({ rows, kpis });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load history' });
  }
});

export default router;
