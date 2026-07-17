// ════════════════════════════════════════════════════════════════
//  📁 FILE PATH : smartfactory/server/src/index.ts
//  ⚙️  ACTION    : REPLACE existing file (full overwrite)
// ════════════════════════════════════════════════════════════════

// ============================================================
//  SERVER ENTRY POINT
//  Wires together: DB connection, middleware, routes, Socket.io
//  (escalation timers configurable via ESCALATE_*_SEC in .env;
//   auto reason-prompt threshold via AUTO_PROMPT_SEC)
// ============================================================
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connectDB } from './config/db';
import { requireAuth } from './middleware/auth';
import { bootstrapSuperAdmin } from './lib/bootstrapAdmin';
import { MachineModel } from './models/Machine';
import { UserModel } from './models/User';
import authRoute from './routes/auth';
import usersRoute from './routes/users';
import machinesRoute from './routes/machines';
import dashboardRoute from './routes/dashboard';
import ingestRoute from './routes/ingest';
import sapRoute from './routes/sap';
import jobsRoute from './routes/jobs';
import employeesRoute from './routes/employees';
import shiftsRoute from './routes/shifts';
import historyRoute from './routes/history';
import downtimeRoute from './routes/downtime';
import utilitiesRoute from './routes/utilities';
import operatorMapRoute from './routes/operatorMap';
import rolesRoute from './routes/roles';
import alertsRoute from './routes/alerts';
import notificationsRoute from './routes/notifications';
import downtimeReportsRoute from './routes/downtimeReports';
import tasksRoute from './routes/tasks';
import orgRoute from './routes/org';
import aiRoute from './routes/ai';
import { sweepEscalations } from './lib/escalation';
import { sweepAutoPrompts } from './lib/autoPrompt';
import { attachLive, setupRedisAdapter, nudge } from './lib/live';
import { departmentFor } from './lib/derive';

const app = express();

// ─── Base middleware ────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' })); // machines can send chunky payloads

// Baseline security headers (dep-free; add `helmet` for the full set in prod).
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  next();
});

// Request timing — surfaces slow endpoints in the logs (observability).
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (ms > 500) console.warn(`🐢 slow ${req.method} ${req.originalUrl} → ${res.statusCode} ${ms}ms`);
  });
  next();
});

// ─── Health check (public, no auth) ─────────────────────────
app.get('/api/health', (_req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    status: 'ok',
    db: states[mongoose.connection.readyState] ?? 'unknown',
    uptimeSec: Math.round(process.uptime()),
    ts: new Date().toISOString(),
  });
});

// ─── Ingestion (machines, NOT users) ────────────────────────
// Mounted BEFORE requireAuth: machines don't have roles/scoping.
// This is the URL you give to the company.
app.use(ingestRoute);

// ─── SAP ingest (partner systems, e.g. Minda — API-key auth) ──
// Public push endpoint for SAP data; authenticated by SAP_API_KEY, not a user login.
app.use(sapRoute);

// ─── Health check (public) ──────────────────────────────────
app.get('/', (_req, res) => res.send('SmartFactory API running'));

// ─── Auth (public: login lives here) ────────────────────────
app.use(authRoute);

// ─── Everything below requires a valid JWT ──────────────────
app.use(requireAuth);

// ─── User management (Super Admin; gated inside the route) ──
app.use(usersRoute);

// ─── User routes (role-scoped) ──────────────────────────────
app.use(machinesRoute);
app.use(dashboardRoute);
app.use(jobsRoute);
app.use(employeesRoute);
app.use(shiftsRoute);
app.use(historyRoute);
app.use(downtimeRoute);
app.use(utilitiesRoute);
app.use(operatorMapRoute);
app.use(rolesRoute);
app.use(alertsRoute);
app.use(notificationsRoute);
app.use(downtimeReportsRoute);
app.use(tasksRoute);
app.use(orgRoute);
app.use(aiRoute);

// ─── 404 + centralized error handling ───────────────────────
// Anything unmatched returns clean JSON instead of Express's HTML page.
app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.originalUrl }));
// Final safety net: thrown/forwarded errors (incl. malformed JSON bodies)
// become a logged 500 instead of crashing the process or hanging the request.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('💥 Unhandled error:', err.message);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
});

// ─── HTTP + Socket.io server ────────────────────────────────
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }, // tighten in production
});

// Socket auth + scope-room joins are wired in attachLive(io) during startup
// (after the optional Redis adapter is attached). See ./lib/live.

// make io available to routes via req.app.get('io')
app.set('io', io);

// Export io so other modules (ingest, simulator) can push updates:
//   io.emit('state:update', machineState)
export { io };

// ─── Start ──────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

connectDB()
  .then(async () => {
    await bootstrapSuperAdmin(); // ensure a Super Admin login exists (from .env)

    // Auto-restore temporarily-deleted users once their suspension expires.
    // (Login/auth also clear lazily; this sweep handles idle accounts.)
    const sweepSuspensions = async () => {
      try {
        const r = await UserModel.updateMany(
          { suspendedUntil: { $ne: null, $lte: new Date() } },
          { $set: { suspendedUntil: null } }
        );
        if (r.modifiedCount) console.log(`♻️  Auto-restored ${r.modifiedCount} suspended user(s)`);
      } catch (e) {
        console.warn('⚠️  suspension sweep failed:', (e as Error).message);
      }
    };
    // Idle-report escalation: walks each report up the management chain
    // (supervisor → prod manager → plant head → super admin) until acked.
    const runEscalations = () => sweepEscalations(io).catch((e) => console.warn('⚠️  escalation sweep failed:', (e as Error).message));
    // Auto reason-prompt: machine stopped/idle > AUTO_PROMPT_SEC → pop the
    // reason screen on the assigned operator's dashboard.
    const runAutoPrompts = () => sweepAutoPrompts(io).catch((e) => console.warn('⚠️  auto-prompt sweep failed:', (e as Error).message));

    // These sweeps must run on exactly ONE instance. In a multi-instance deployment set
    // RUN_BACKGROUND_JOBS=false on every instance except one, or they double-fire.
    if (process.env.RUN_BACKGROUND_JOBS !== 'false') {
      sweepSuspensions();
      setInterval(sweepSuspensions, 60 * 1000); // every minute
      runEscalations();
      setInterval(runEscalations, 30 * 1000);   // every 30s — fine for minute thresholds
      runAutoPrompts();
      setInterval(runAutoPrompts, 30 * 1000);   // every 30s — detects the 2-min stop threshold
    } else {
      console.log('⏭️  Background sweeps disabled here (RUN_BACKGROUND_JOBS=false)');
    }

    // Real-time layer: attach the optional Redis adapter (multi-instance), then
    // authenticate sockets and join them to their scope rooms.
    const usedRedis = await setupRedisAdapter(io);
    attachLive(io);
    console.log(usedRedis
      ? '🔌 Socket.IO: Redis adapter enabled (multi-instance ready)'
      : '🔌 Socket.IO: in-memory adapter (single process)');

    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });

    // ─── LIVE: watch the machines collection (touched on every
    //     ingest via lastSeen) and nudge dashboards to refresh.
    //     Time-series collections don't support change streams, so
    //     we watch the regular 'machines' collection instead. The
    //     frontend also polls every few seconds as a safety net.
    try {
      // fullDocument lets us read WHICH machine changed → nudge only its scope rooms
      // (the machine's room + its department + the fleet), not every connected client.
      const stream = MachineModel.watch([], { fullDocument: 'updateLookup' });
      stream.on('change', (change) => {
        const doc = (change as { fullDocument?: { machineId?: string; type?: string } }).fullDocument;
        nudge(io, doc?.machineId, doc ? departmentFor({}, doc.type) : undefined);
      });
      stream.on('error', (e) => console.warn('⚠️  change-stream error (frontend polling covers it):', e.message));
      console.log('👁️  Watching machines change stream for live updates');
    } catch (e) {
      console.warn('⚠️  change streams unavailable; dashboards will poll instead:', e);
    }
  })
  .catch((err) => {
    console.error('❌ Failed to start:', err);
    process.exit(1);
  });