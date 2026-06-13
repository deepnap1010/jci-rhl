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
const STALE_MS = 5 * 60 * 1000;       // feed older than this → fall back to the last recorded day
const IST_OFFSET = 5.5 * 3600 * 1000; // factory-local day boundary
const MAX_GAP_SEC = 300;              // gap between readings beyond this = data outage, not downtime

export async function downtimeByMachine(ids: string[], from: Date, to: Date, cacheTag: string): Promise<Map<string, DowntimeAgg>> {
  const key = `${cacheTag}|${ids.join(',')}`;
  const hit = dtCache.get(key);
  if (hit && Date.now() - hit.at < DT_TTL_MS) return hit.map;

  // Per-machine (not one giant cross-machine aggregation): a single machine's window is small
  // enough for the 32MB in-memory sort, so this works on shared Atlas tiers where allowDiskUse
  // isn't permitted. Each reading "holds" its status until the next reading — but a gap longer than
  // MAX_GAP_SEC is treated as a DATA OUTAGE (disconnected), not continuous downtime, so sparse
  // readings can't inflate a spell to many hours. Readings are collapsed into status "runs".
  const map = new Map<string, DowntimeAgg>();
  await Promise.all(ids.map(async (id) => {
    const runs = await TelemetryModel.aggregate([
      { $match: { machineId: id, serverTs: { $gte: from, $lte: to } } },
      { $project: { serverTs: 1, status: { $toLower: { $ifNull: ['$data.status', ''] } } } },
      { $setWindowFields: { sortBy: { serverTs: 1 }, output: {
          prev: { $shift: { output: '$status', by: -1 } },
          nextTs: { $shift: { output: '$serverTs', by: 1 } },
      } } },
      { $set: {
          isNew: { $cond: [{ $eq: ['$status', '$prev'] }, 0, 1] },
          // time this reading represents = gap to the next reading, capped (a long gap = lost signal)
          intervalSec: { $cond: [{ $eq: ['$nextTs', null] }, 0, { $min: [MAX_GAP_SEC, { $divide: [{ $subtract: ['$nextTs', '$serverTs'] }, 1000] }] }] },
      } },
      { $setWindowFields: { sortBy: { serverTs: 1 }, output: { runId: { $sum: '$isNew', window: { documents: ['unbounded', 'current'] } } } } },
      { $group: { _id: '$runId', status: { $first: '$status' }, startTs: { $min: '$serverTs' }, durSec: { $sum: '$intervalSec' } } },
      { $sort: { startTs: 1 } },
    ]) as { status: string; startTs: Date; durSec: number }[];

    let idleSec = 0, stoppedSec = 0, idleCount = 0, stoppedCount = 0;
    let lastSpell: Spell | null = null;
    for (const r of runs) {
      if (r.status !== 'idle' && r.status !== 'stopped') continue;
      const durSec = Math.round(r.durSec || 0);
      if (r.status === 'idle') { idleSec += durSec; idleCount++; } else { stoppedSec += durSec; stoppedCount++; }
      lastSpell = { type: r.status, durationSec: durSec, ts: new Date(r.startTs) }; // runs are asc → last wins = most recent
    }
    map.set(id, { idleSec, stoppedSec, idleCount, stoppedCount, lastSpell });
  }));

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

    // window: a selected range, else the last 24h — but if the live feed is stale (no data today),
    // fall back to the last day that DOES have data so the page isn't a wall of zeros.
    let since = range ? range.from : new Date(Date.now() - 24 * 3600 * 1000);
    let until = range ? range.to : new Date();
    let latest = range ? await latestByMachineInWindow(range.from, range.to) : undefined;
    let stale = false;
    let lastUpdated: string | null = null;
    let cacheTag = range ? `${since.toISOString()}|${until.toISOString()}` : 'live24h';

    if (!range) {
      const latestDoc = (await TelemetryModel.findOne({}, { serverTs: 1 }).sort({ serverTs: -1 }).lean()) as { serverTs: Date } | null;
      const asOf = latestDoc ? new Date(latestDoc.serverTs) : null;
      if (asOf) {
        lastUpdated = asOf.toISOString();
        if (Date.now() - asOf.getTime() > STALE_MS) {
          stale = true;
          const ist = new Date(asOf.getTime() + IST_OFFSET);
          since = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET);
          until = asOf;
          latest = await latestByMachineInWindow(since, asOf); // snapshot → as-recorded statuses
          cacheTag = `stale|${since.toISOString()}`;
        }
      }
    }

    let views = await getScopedViews(req.user!, latest);
    if (req.query.dept) views = views.filter((v) => v.department === req.query.dept);
    if (req.query.status) views = views.filter((v) => v.status === req.query.status);

    // idle/stopped time + counts derived from the status history over the window, so machines
    // without PLC downtime counters still show their real downtime.
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

    res.json({ cards, kpis, stale, lastUpdated, windowStart: since.toISOString(), windowEnd: until.toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load downtime' });
  }
});

// GET /api/downtime/:machineId/events  → discrete idle/stopped spells,
// reconstructed from the telemetry status field over the last 24h.
router.get('/api/downtime/:machineId/events', async (req, res) => {
  try {
    // window matches the card (the page passes its from/to). Defaults to the last 24h.
    const f = req.query.from ? new Date(String(req.query.from)) : null;
    const t = req.query.to ? new Date(String(req.query.to)) : null;
    const since = f && !isNaN(f.getTime()) ? f : new Date(Date.now() - 24 * 3600 * 1000);
    const until = t && !isNaN(t.getTime()) ? t : new Date();
    // Collapse the window's readings into status "runs" (one row per status CHANGE) on the database:
    // tag each reading with a runId (cumulative count of status changes), then group. We transfer
    // a few dozen boundaries instead of thousands of readings — the heavy scan stays in Mongo.
    const runs = await TelemetryModel.aggregate([
      { $match: { machineId: req.params.machineId, serverTs: { $gte: since, $lte: until } } },
      { $project: { serverTs: 1, status: { $toLower: { $ifNull: ['$data.status', ''] } } } },
      { $setWindowFields: { sortBy: { serverTs: 1 }, output: {
          prev: { $shift: { output: '$status', by: -1 } },
          nextTs: { $shift: { output: '$serverTs', by: 1 } },
      } } },
      { $set: {
          isNew: { $cond: [{ $eq: ['$status', '$prev'] }, 0, 1] },
          intervalSec: { $cond: [{ $eq: ['$nextTs', null] }, 0, { $min: [MAX_GAP_SEC, { $divide: [{ $subtract: ['$nextTs', '$serverTs'] }, 1000] }] }] },
      } },
      { $setWindowFields: { sortBy: { serverTs: 1 }, output: { runId: { $sum: '$isNew', window: { documents: ['unbounded', 'current'] } } } } },
      { $group: { _id: '$runId', status: { $first: '$status' }, startTs: { $min: '$serverTs' }, lastTs: { $max: '$serverTs' }, durSec: { $sum: '$intervalSec' } } },
      { $sort: { startTs: 1 } },
    ]) as { _id: number; status: string; startTs: Date; lastTs: Date; durSec: number }[];

    type Ev = { type: 'idle' | 'stopped'; startTs: Date; endTs: Date | null; durationSec: number; ongoing: boolean };
    const events: Ev[] = [];
    // spell duration = sum of capped reading intervals (gaps over MAX_GAP_SEC are data outages, not downtime)
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      if (r.status !== 'idle' && r.status !== 'stopped') continue;
      const next = runs[i + 1];
      events.push({
        type: r.status,
        startTs: new Date(r.startTs),
        endTs: next ? new Date(next.startTs) : new Date(r.lastTs),
        durationSec: Math.round(r.durSec || 0),
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
