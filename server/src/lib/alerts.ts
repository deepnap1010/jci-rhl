// ============================================================
//  ALERTS / HEALTH ENGINE
//  Turns the derived machine views into actionable, role-scoped
//  alerts. Pure function over the same views the dashboards use —
//  no new data source. Job context (target/pct) is passed in.
// ============================================================
import { MachineView } from './derive';
import { Department } from '@shared/types';

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertType = 'offline' | 'stopped' | 'badData' | 'highDowntime' | 'behindTarget' | 'noJob';

export interface Alert {
  id: string; // stable per machine+type so the UI can de-dupe
  machineId: string;
  machineCode: string;
  department: Department;
  severity: AlertSeverity;
  type: AlertType;
  title: string;
  detail: string;
  ts: string; // ISO — when the underlying reading was last seen
}

export interface JobLite { jobNumber: string; targetProduction: number }

const SEV_RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
const HIGH_DOWNTIME_MIN = 120; // 2h+ of accumulated downtime
const BEHIND_TARGET_PCT = 50; // below half of target with an active job

function minsAgo(iso: string | null): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}
// physical readings are non-negative; a negative number is a bad/junk packet
function suspectFields(data: Record<string, unknown>): string[] {
  const bad: string[] = [];
  for (const [k, v] of Object.entries(data)) if (typeof v === 'number' && v < 0) bad.push(k);
  return bad;
}
function fmtMins(min: number): string {
  if (!isFinite(min)) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

export function computeAlerts(views: MachineView[], jobByMachine: Map<string, JobLite>): Alert[] {
  const alerts: Alert[] = [];
  const push = (v: MachineView, type: AlertType, severity: AlertSeverity, title: string, detail: string) =>
    alerts.push({
      id: `${v.machineId}:${type}`,
      machineId: v.machineId,
      machineCode: v.code,
      department: v.department,
      severity,
      type,
      title,
      detail,
      ts: v.state?.updatedAt ?? new Date().toISOString(),
    });

  for (const v of views) {
    const lastSeen = v.lastSeen ?? v.state?.updatedAt ?? null;
    const downtimeMin = Math.round((v.state?.downtimeSec ?? 0) / 60);
    const job = jobByMachine.get(v.machineId) || null;
    const target = job?.targetProduction ?? 0;
    const production = v.state?.production ?? 0;
    const pct = target > 0 ? Math.min(100, Math.round((production / target) * 100)) : 0;

    // 1) offline — hasn't reported recently
    if (v.status === 'disconnected') {
      push(v, 'offline', 'critical', 'Machine offline', lastSeen ? `No data for ${fmtMins(minsAgo(lastSeen))}` : 'Never reported');
    } else if (v.status === 'stopped') {
      // 2) stopped while connected
      push(v, 'stopped', 'warning', 'Machine stopped', 'Connected but not running');
    }

    // 3) suspect / bad readings (negative physical values)
    if (v.state) {
      const bad = suspectFields(v.state.data);
      if (bad.length) {
        push(v, 'badData', 'critical', 'Suspect readings', `${bad.length} negative value${bad.length > 1 ? 's' : ''}: ${bad.slice(0, 4).join(', ')}${bad.length > 4 ? '…' : ''}`);
      }
    }

    // 4) high accumulated downtime
    if (downtimeMin >= HIGH_DOWNTIME_MIN) {
      push(v, 'highDowntime', 'warning', 'High downtime', `${fmtMins(downtimeMin)} of downtime`);
    }

    // 5) behind target — only while actually running
    if (v.status === 'running' && job && target > 0 && pct < BEHIND_TARGET_PCT) {
      push(v, 'behindTarget', 'info', 'Behind target', `${pct}% of ${target.toLocaleString()} mtr (${job.jobNumber})`);
    }

    // 6) running with no job assigned
    if (v.status === 'running' && !job) {
      push(v, 'noJob', 'info', 'No job assigned', 'Running without an assigned job');
    }
  }

  alerts.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.machineCode.localeCompare(b.machineCode));
  return alerts;
}

export function alertCounts(alerts: Alert[]) {
  return {
    critical: alerts.filter((a) => a.severity === 'critical').length,
    warning: alerts.filter((a) => a.severity === 'warning').length,
    info: alerts.filter((a) => a.severity === 'info').length,
    total: alerts.length,
  };
}
