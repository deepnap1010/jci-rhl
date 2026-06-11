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

    const cards = views.map((v) => {
      const d = v.state?.data || {};
      const idleCount = Number(d.idleCount) || 0;
      const stoppedCount = Number(d.stoppedCount) || 0;
      return {
        _id: v.machineId,
        code: v.code,
        name: v.name,
        department: v.department,
        status: v.status,
        idleSec: v.state?.idleSec || 0,
        stoppedSec: v.state?.stoppedSec || 0,
        eventCount: idleCount + stoppedCount,
        idleCount,
        stoppedCount,
        events: [], // discrete events are derived at source now (counters)
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
