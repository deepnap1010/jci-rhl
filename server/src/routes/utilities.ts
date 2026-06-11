// ============================================================
//  UTILITIES ROUTE  —  Water Flow + Electricity
//  Water aggregated from derived waterFlow. Electricity derived
//  from machine activity (no dedicated power telemetry yet).
//  Optional ?from=&to= → consumption averaged over that date
//  range (from telemetry history) instead of the live snapshot.
// ============================================================
import { Router } from 'express';
import { getScopedViews, deriveView, MachineView, MachineDoc, TelemetryDoc } from '../lib/derive';
import { TelemetryModel } from '../models/Telemetry';
import { DEPARTMENTS, Department } from '@shared/types';

const router = Router();

type RangeAvg = { waterFlow: number; speed: number; production: number };

// average derived metrics per machine over a date range (history-based)
async function rangeAverages(views: MachineView[], from: Date, to: Date): Promise<Map<string, RangeAvg>> {
  const ids = views.map((v) => v.machineId);
  const typeBy = new Map(views.map((v) => [v.machineId, v.type]));
  const docs = await TelemetryModel.find({ machineId: { $in: ids }, serverTs: { $gte: from, $lte: to } })
    .sort({ serverTs: -1 }).limit(8000).lean();
  const agg = new Map<string, { w: number; s: number; p: number; n: number }>();
  for (const d of docs) {
    const view = deriveView({ machineId: d.machineId, type: typeBy.get(d.machineId) } as MachineDoc, d as unknown as TelemetryDoc);
    const st = view.state;
    if (!st) continue;
    const a = agg.get(d.machineId) || { w: 0, s: 0, p: 0, n: 0 };
    a.w += st.waterFlow; a.s += st.speed; a.p += st.production; a.n++;
    agg.set(d.machineId, a);
  }
  const out = new Map<string, RangeAvg>();
  for (const [id, a] of agg) out.set(id, { waterFlow: a.w / a.n, speed: a.s / a.n, production: a.p / a.n });
  return out;
}

function parseRange(query: Record<string, unknown>): { from: Date; to: Date } | null {
  const f = query.from ? new Date(String(query.from)) : null;
  const t = query.to ? new Date(String(query.to)) : null;
  if (f && t && !isNaN(f.getTime()) && !isNaN(t.getTime())) return { from: f, to: t };
  return null;
}

// GET /api/water  (optional ?from=&to=)
router.get('/api/water', async (req, res) => {
  try {
    const views = await getScopedViews(req.user!);
    const range = parseRange(req.query as Record<string, unknown>);
    const ranged = range ? await rangeAverages(views, range.from, range.to) : null;
    const waterOf = (v: MachineView) => (ranged ? (ranged.get(v.machineId)?.waterFlow ?? 0) : (v.state?.waterFlow ?? 0));

    const deptMap = new Map<Department, number>();
    for (const v of views) {
      const kl = (waterOf(v) * 24) / 1000;
      deptMap.set(v.department, (deptMap.get(v.department) || 0) + kl);
    }
    const deptWise = DEPARTMENTS.map((d) => ({ dept: d, kl: Math.round(deptMap.get(d) || 0) })).filter((x) => x.kl > 0);
    const totalKL = Math.round(deptWise.reduce((s, d) => s + d.kl, 0));

    // all scoped machines (searchable on the page), highest consumer first
    const topConsumers = views
      .map((v) => ({
        code: v.code,
        type: v.type,
        department: v.department,
        lhr: Math.round(waterOf(v)),
        dailyKL: +((waterOf(v) * 24) / 1000).toFixed(1),
      }))
      .sort((a, b) => b.lhr - a.lhr);

    res.json({
      kpis: {
        totalKL,
        dyeingUsage: Math.round((deptMap.get('Hot Dyeing') || 0) + (deptMap.get('Cold Dyeing') || 0)),
        cbrSteamWater: Math.round(deptMap.get('CBR (Bleaching)') || 0),
        wastageAlerts: views.filter((v) => v.status !== 'running' && waterOf(v) > 100).length,
      },
      deptWise,
      topConsumers,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load water data' });
  }
});

// GET /api/electricity  (optional ?from=&to=)
router.get('/api/electricity', async (req, res) => {
  try {
    const views = await getScopedViews(req.user!);
    const range = parseRange(req.query as Record<string, unknown>);
    const ranged = range ? await rangeAverages(views, range.from, range.to) : null;
    const loadOf = (v: MachineView) => {
      const m = ranged ? ranged.get(v.machineId) : v.state;
      return m ? Math.round(m.speed * 1.6 + m.waterFlow * 0.01 + m.production * 0.0005 + 12) : 0;
    };

    // energy (kWh) = load (kW) × operating hours. A date range covers N days, so the period total
    // scales by the number of days (power/kW stays instantaneous; energy/kWh accumulates).
    const HOURS_PER_DAY = 8;
    const days = range ? Math.floor((range.to.getTime() - range.from.getTime()) / 864e5) + 1 : 1;
    const energyHrs = HOURS_PER_DAY * days;

    const deptMap = new Map<Department, number>();
    let peakLoadKw = 0;
    let totalLoadKw = 0;
    for (const v of views) {
      const load = loadOf(v);
      peakLoadKw = Math.max(peakLoadKw, load);
      totalLoadKw += load;
      deptMap.set(v.department, (deptMap.get(v.department) || 0) + load * energyHrs);
    }
    const deptWise = DEPARTMENTS.map((d) => ({ dept: d, kwh: Math.round(deptMap.get(d) || 0) })).filter((x) => x.kwh > 0);
    const totalKwh = Math.round(deptWise.reduce((s, d) => s + d.kwh, 0));

    const SHAPE = [0.48, 0.78, 0.92, 1.0, 1.0, 0.96, 0.86, 0.93, 0.95, 0.9];
    const LABELS = ['6AM', '8AM', '9AM', '10AM', '11AM', '12PM', '1PM', '2PM', '3PM', 'NOW'];
    const hourly = SHAPE.map((f, i) => ({ label: LABELS[i], kw: Math.round(totalLoadKw * f) }));

    // all scoped machines (searchable on the page), highest consumer first
    const machines = views
      .map((v) => { const kw = loadOf(v); return { code: v.code, type: v.type, department: v.department, kw, kwhToday: kw * energyHrs }; })
      .sort((a, b) => b.kw - a.kw);

    res.json({
      kpis: { todayKwh: totalKwh, peakLoadKw, powerFactor: 0.92, costToday: Math.round(totalKwh * 8.5) },
      deptWise,
      hourly,
      machines,
      days,
      ranged: !!range,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load electricity data' });
  }
});

export default router;
