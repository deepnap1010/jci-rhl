// ============================================================
//  INGESTION + READ-BACK  —  canonical v1 (matches JCI API)
//
//  POST /api/v1/ingest  (also legacy /api/ingest)
//    Body: { machineId, machineName?, machineType?, timestamp?, data }
//    → stores telemetry verbatim (time-series) + upserts the machine.
//
//  In production the deployed JCI API ingests; this server is the
//  dashboard (read side). These write endpoints are kept for dev
//  parity and are safe to leave unused.
// ============================================================
import { Router } from 'express';
import { MachineModel } from '../models/Machine';
import { TelemetryModel } from '../models/Telemetry';

const router = Router();

// Auth: shared key(s) from .env. INGEST_KEY (single) or INGEST_API_KEYS (list).
// Empty = open (dev).
const KEYS = [
  ...(process.env.INGEST_KEY ? [process.env.INGEST_KEY] : []),
  ...(process.env.INGEST_API_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean),
];
const keyAllowed = (k?: string) => KEYS.length === 0 || (!!k && KEYS.includes(k));

// ─── INGEST ─────────────────────────────────────────────────
router.post(['/api/v1/ingest', '/api/ingest'], async (req, res) => {
  try {
    if (!keyAllowed(req.header('x-api-key'))) {
      return res.status(401).json({ success: false, error: 'invalid or missing x-api-key' });
    }
    const { machineId, machineName, machineType, timestamp, data } = req.body || {};
    if (!machineId) return res.status(400).json({ success: false, error: 'machineId is required' });
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ success: false, error: '`data` must be a JSON object of readings' });
    }

    await TelemetryModel.create({
      machineId,
      deviceTs: timestamp ? new Date(timestamp) : null,
      serverTs: new Date(),
      data,
    });

    await MachineModel.updateOne(
      { machineId },
      {
        $setOnInsert: { machineId },
        $set: {
          ...(machineName ? { name: machineName } : {}),
          ...(machineType ? { type: machineType } : {}),
          status: 'active',
          lastSeen: new Date(),
        },
        $addToSet: { metricsSeen: { $each: Object.keys(data) } },
      },
      { upsert: true }
    );

    res.status(202).json({ success: true, ok: true, message: 'reading stored' });

    const io = req.app.get('io');
    if (io) io.emit('state:update', { machineId });
  } catch (err) {
    console.error('ingest error:', err);
    res.status(500).json({ success: false, error: 'server error' });
  }
});

// ─── READ-BACK (verify + schema discovery) ──────────────────
router.get('/api/v1/machines/:id/latest', async (req, res) => {
  if (!keyAllowed(req.header('x-api-key'))) return res.status(401).json({ success: false, error: 'invalid x-api-key' });
  const doc = await TelemetryModel.findOne({ machineId: req.params.id }).sort({ serverTs: -1 }).lean();
  if (!doc) return res.status(404).json({ success: false, error: 'no data yet' });
  return res.json({ success: true, data: doc });
});

router.get('/api/v1/machines/:id/history', async (req, res) => {
  if (!keyAllowed(req.header('x-api-key'))) return res.status(401).json({ success: false, error: 'invalid x-api-key' });
  const limit = Math.min(parseInt(String(req.query.limit)) || 50, 500);
  const docs = await TelemetryModel.find({ machineId: req.params.id }).sort({ serverTs: -1 }).limit(limit).lean();
  return res.json({ success: true, count: docs.length, data: docs });
});

// what fields has this machine actually sent? (Phase 6 schema discovery)
router.get('/api/v1/machines/:id/schema', async (req, res) => {
  const rows = await TelemetryModel.aggregate([
    { $match: { machineId: req.params.id } },
    { $sort: { serverTs: -1 } },
    { $limit: 200 },
    { $project: { fields: { $objectToArray: '$data' } } },
    { $unwind: '$fields' },
    {
      $group: {
        _id: '$fields.k',
        sampleValue: { $first: '$fields.v' },
        type: { $first: { $type: '$fields.v' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return res.json({ success: true, machineId: req.params.id, fields: rows });
});

// fleet-wide discovery summary
router.get('/api/inspect/summary', async (_req, res) => {
  const machines = await MachineModel.find().select('machineId name type metricsSeen lastSeen').sort({ machineId: 1 }).lean();
  const total = await TelemetryModel.estimatedDocumentCount().catch(() => 0);
  res.json({ total, machineCount: machines.length, machines });
});

export default router;
