// ============================================================
//  DOWNTIME ROUTE
//  Per-machine idle/stopped time + occurrence counts, taken from
//  the PLC's own counters in the latest telemetry (runningSeconds,
//  idleSeconds, stoppedSeconds, idleCount, stoppedCount).
// ============================================================
import { Router } from 'express';
import { getScopedViews, latestByMachineInWindow } from '../lib/derive';
import { TelemetryModel } from '../models/Telemetry';

const router = Router();

// Per-machine idle/stopped time + counts + the most recent spell, reconstructed from the telemetry
// `status` field (same source as the event list). This is correct even for machines that don't
// report idle/stopped second-counters (e.g. reactive steamers) — those used to read a false 0.
type Spell = { type: 'idle' | 'stopped'; durationSec: number; ts: Date };
type DowntimeAgg = { idleSec: number; stoppedSec: number; idleCount: number; stoppedCount: number; lastSpell: Spell | null };
const dtCache = new Map<string, { at: number; map: Map<string, DowntimeAgg> }>();
const DT_TTL_MS = 15_000;

export async function downtimeByMachine(ids: string[], from: Date, to: Date, cacheTag: string): Promise<Map<string, DowntimeAgg>> {
  const key = `${cacheTag}|${ids.join(',')}`;
  const hit = dtCache.get(key);
  if (hit && Date.now() - hit.at < DT_TTL_MS) return hit.map;
  const rows = await TelemetryModel.aggregate([
    { $match: { machineId: { $in: ids }, serverTs: { $gte: from, $lte: to } } },
    { $project: { machineId: 1, serverTs: 1, status: { $toLower: { $ifNull: ['$data.status', ''] } } } },
    // tag each reading with a per-machine runId (cumulative count of status changes)
    { $setWindowFields: { partitionBy: '$machineId', sortBy: { serverTs: 1 }, output: { prev: { $shift: { output: '$status', by: -1 } } } } },
    { $set: { isNew: { $cond: [{ $eq: ['$status', '$prev'] }, 0, 1] } } },
    { $setWindowFields: { partitionBy: '$machineId', sortBy: { serverTs: 1 }, output: { runId: { $sum: '$isNew', window: { documents: ['unbounded', 'current'] } } } } },
    // collapse to runs; a run lasts until the NEXT run starts (or its own last reading if it's the latest)
    { $group: { _id: { m: '$machineId', r: '$runId' }, status: { $first: '$status' }, startTs: { $min: '$serverTs' }, lastTs: { $max: '$serverTs' } } },
    { $setWindowFields: { partitionBy: '$_id.m', sortBy: { startTs: 1 }, output: { nextStart: { $shift: { output: '$startTs', by: 1 } } } } },
    { $set: { durSec: { $max: [0, { $round: [{ $divide: [{ $subtract: [{ $ifNull: ['$nextStart', '$lastTs'] }, '$startTs'] }, 1000] }, 0] }] } } },
    { $match: { status: { $in: ['idle', 'stopped'] } } },
    { $group: {
        _id: '$_id.m',
        idleSec: { $sum: { $cond: [{ $eq: ['$status', 'idle'] }, '$durSec', 0] } },
        stoppedSec: { $sum: { $cond: [{ $eq: ['$status', 'stopped'] }, '$durSec', 0] } },
        idleCount: { $sum: { $cond: [{ $eq: ['$status', 'idle'] }, 1, 0] } },
        stoppedCount: { $sum: { $cond: [{ $eq: ['$status', 'stopped'] }, 1, 0] } },
        lastSpell: { $top: { sortBy: { startTs: -1 }, output: { type: '$status', durationSec: '$durSec', ts: '$startTs' } } },
    } },
  ]) as (DowntimeAgg & { _id: string })[];
  const map = new Map<string, DowntimeAgg>();
  for (const r of rows) map.set(String(r._id), { idleSec: r.idleSec || 0, stoppedSec: r.stoppedSec || 0, idleCount: r.idleCount || 0, stoppedCount: r.stoppedCount || 0, lastSpell: r.lastSpell || null });
  if (dtCache.size > 50) dtCache.clear();
  dtCache.set(key, { at: Date.now(), map });
  return map;
}

router.get('/api/downtime', async (req, res) => {
  try {
    // optional ?from=&to= → downtime as of a date window (each machine's latest reading in it)
    const f = req.query.from ? new Date(String(req.query.from)) : null;
    const t = req.query.to ? new Date(String(req.query.to)) : null;
    const range = f && t && !isNaN(f.getTime()) && !isNaN(t.getTime()) ? { from: f, to: t } : null;
    const latest = range ? await latestByMachineInWindow(range.from, range.to) : undefined;

    let views = await getScopedViews(req.user!, latest);
    if (req.query.dept) views = views.filter((v) => v.department === req.query.dept);
    if (req.query.status) views = views.filter((v) => v.status === req.query.status);

    // idle/stopped time + counts derived from the status history (24h or the selected range),
    // so machines without PLC downtime counters still show their real downtime.
    const since = range ? range.from : new Date(Date.now() - 24 * 3600 * 1000);
    const until = range ? range.to : new Date();
    const cacheTag = range ? `${since.toISOString()}|${until.toISOString()}` : 'live24h';
    const dt = await downtimeByMachine(views.map((v) => v.machineId), since, until, cacheTag);

    const cards = views.map((v) => {
      const a = dt.get(v.machineId);
      const idleCount = a?.idleCount || 0;
      const stoppedCount = a?.stoppedCount || 0;
      return {
        _id: v.machineId,
        code: v.code,
        name: v.name,
        department: v.department,
        status: v.status,
        idleSec: a?.idleSec || 0,
        stoppedSec: a?.stoppedSec || 0,
        eventCount: idleCount + stoppedCount,
        idleCount,
        stoppedCount,
        lastSpell: a?.lastSpell || null, // most recent idle/stopped spell (type, duration, time)
        events: [], // discrete events lazy-loaded per card via /events
      };
    });

    const kpis = {
      totalDowntimeSec: cards.reduce((s, c) => s + c.idleSec + c.stoppedSec, 0),
      stopped: cards.filter((c) => c.status === 'stopped').length,
      idle: cards.filter((c) => c.status === 'idle').length,
      running: cards.filter((c) => c.status === 'running').length,
    };

    res.json({ cards, kpis });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load downtime' });
  }
});

// GET /api/downtime/:machineId/events  → discrete idle/stopped spells,
// reconstructed from the telemetry status field over the last 24h.
router.get('/api/downtime/:machineId/events', async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    // Collapse 24h of readings into status "runs" (one row per status CHANGE) on the database:
    // tag each reading with a runId (cumulative count of status changes), then group. We transfer
    // a few dozen boundaries instead of thousands of readings — the heavy scan stays in Mongo.
    const runs = await TelemetryModel.aggregate([
      { $match: { machineId: req.params.machineId, serverTs: { $gte: since } } },
      { $project: { serverTs: 1, status: { $toLower: { $ifNull: ['$data.status', ''] } } } },
      { $setWindowFields: { sortBy: { serverTs: 1 }, output: { prev: { $shift: { output: '$status', by: -1 } } } } },
      { $set: { isNew: { $cond: [{ $eq: ['$status', '$prev'] }, 0, 1] } } },
      { $setWindowFields: { sortBy: { serverTs: 1 }, output: { runId: { $sum: '$isNew', window: { documents: ['unbounded', 'current'] } } } } },
      { $group: { _id: '$runId', status: { $first: '$status' }, startTs: { $min: '$serverTs' } } },
      { $sort: { startTs: 1 } },
    ]) as { _id: number; status: string; startTs: Date }[];

    type Ev = { type: 'idle' | 'stopped'; startTs: Date; endTs: Date | null; durationSec: number; ongoing: boolean };
    const events: Ev[] = [];
    const now = new Date();
    // a spell runs from its run's start to the NEXT run's start (or "now" if it's the latest run)
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      if (r.status !== 'idle' && r.status !== 'stopped') continue;
      const next = runs[i + 1];
      const start = new Date(r.startTs);
      const end = next ? new Date(next.startTs) : null;
      events.push({
        type: r.status,
        startTs: start,
        endTs: end,
        durationSec: Math.max(0, Math.round(((end ?? now).getTime() - start.getTime()) / 1000)),
        ongoing: !next,
      });
    }

    // most recent first, capped
    const out = events.reverse().slice(0, 50).map((e, i) => ({ _id: `${req.params.machineId}-${i}`, ...e }));
    res.json({ events: out });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load downtime events' });
  }
});

export default router;
