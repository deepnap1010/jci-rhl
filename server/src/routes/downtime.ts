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
    // only serverTs + data.status are needed to rebuild spells — projecting them (instead of the
    // full data blob on every reading) cuts the payload from MBs of fat docs to a thin stream.
    const docs = await TelemetryModel.find(
      { machineId: req.params.machineId, serverTs: { $gte: since } },
      { serverTs: 1, 'data.status': 1, _id: 0 },
    )
      .sort({ serverTs: 1 })
      .lean();

    type Ev = { type: 'idle' | 'stopped'; startTs: Date; endTs: Date | null; durationSec: number; ongoing: boolean };
    const events: Ev[] = [];
    let cur: { type: 'idle' | 'stopped'; startTs: Date } | null = null;
    const close = (end: Date) => {
      if (!cur) return;
      events.push({
        type: cur.type,
        startTs: cur.startTs,
        endTs: end,
        durationSec: Math.max(0, Math.round((end.getTime() - cur.startTs.getTime()) / 1000)),
        ongoing: false,
      });
      cur = null;
    };

    for (const d of docs) {
      const st = typeof d.data?.status === 'string' ? d.data.status.toLowerCase() : '';
      const ts = new Date(d.serverTs);
      if (st === 'idle' || st === 'stopped') {
        if (!cur) cur = { type: st, startTs: ts };
        else if (cur.type !== st) { close(ts); cur = { type: st, startTs: ts }; }
      } else {
        close(ts);
      }
    }
    if (cur) {
      const now = new Date();
      events.push({
        type: cur.type,
        startTs: cur.startTs,
        endTs: null,
        durationSec: Math.max(0, Math.round((now.getTime() - cur.startTs.getTime()) / 1000)),
        ongoing: true,
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
