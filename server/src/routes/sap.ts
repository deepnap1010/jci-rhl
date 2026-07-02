// ============================================================
//  SAP INGEST  —  receives data PUSHED from a partner's SAP system
//  POST /api/sap/ingest    (x-api-key auth) → store the payload verbatim
//  GET  /api/sap/records   (x-api-key auth) → recent records (verify the feed)
//
//  Mounted BEFORE requireAuth: SAP authenticates with a shared API key,
//  not a user login. Give the partner (Minda) the URL + key + this contract.
//  Set SAP_API_KEY in the server .env (and share it with them securely).
// ============================================================
import { Router } from 'express';
import { SapRecordModel } from '../models/SapRecord';

const router = Router();

// shared key(s) from .env. SAP_API_KEY (single) or SAP_API_KEYS (comma list). Empty = open (dev only).
const KEYS = [
  ...(process.env.SAP_API_KEY ? [process.env.SAP_API_KEY] : []),
  ...(process.env.SAP_API_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean),
];
const keyOk = (k?: string) => KEYS.length === 0 || (!!k && KEYS.includes(k));

router.post(['/api/sap/ingest', '/api/v1/sap/ingest'], async (req, res) => {
  try {
    if (!keyOk(req.header('x-api-key'))) {
      return res.status(401).json({ success: false, error: 'invalid or missing x-api-key' });
    }
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ success: false, error: 'a JSON body is required' });
    }
    const rec = await SapRecordModel.create({
      source: String(req.header('x-source') || 'minda-sap'),
      recordType: String((payload as Record<string, unknown>).recordType || req.header('x-record-type') || ''),
      payload,
      sourceIp: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '',
    });
    return res.status(201).json({ success: true, id: String(rec._id), message: 'SAP record received' });
  } catch (err) {
    console.error('SAP ingest error:', err);
    return res.status(500).json({ success: false, error: 'server error' });
  }
});

// read-back so you can confirm SAP's data is arriving + inspect its real shape
router.get('/api/sap/records', async (req, res) => {
  if (!keyOk(req.header('x-api-key'))) return res.status(401).json({ success: false, error: 'invalid x-api-key' });
  const limit = Math.min(Number(req.query.limit) || 20, 200);
  const records = await SapRecordModel.find().sort({ receivedAt: -1 }).limit(limit).lean();
  return res.json({ success: true, count: records.length, records });
});

export default router;
