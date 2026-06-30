// ============================================================
//  ALERTS  —  role-scoped machine-health alerts (GET /api/alerts).
//  Critical / warning / info, searchable + filterable, each row
//  links straight to the machine. Read-only monitoring view.
// ============================================================
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Search, AlertTriangle, AlertCircle, Info, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { useAlerts, fmtAgo } from '../hooks/useData';
import type { AlertSeverity } from '../hooks/useData';
import { StatCard } from '../components/ekc-ui';
import { cn } from '../lib/utils';

const SEV: Record<AlertSeverity, { tone: string; dot: string; label: string }> = {
  critical: { tone: 'bg-stopped/10 text-stopped', dot: 'bg-stopped', label: 'Critical' },
  warning: { tone: 'bg-idle/10 text-idle', dot: 'bg-idle', label: 'Warning' },
  info: { tone: 'bg-accent/10 text-accent', dot: 'bg-accent', label: 'Info' },
};
const FILTERS: ('all' | AlertSeverity)[] = ['all', 'critical', 'warning', 'info'];

export default function Alerts() {
  const { data } = useAlerts();
  const { alerts, counts } = data;
  const [sev, setSev] = useState<'all' | AlertSeverity>('all');
  const [q, setQ] = useState('');

  const filtered = alerts.filter((a) =>
    (sev === 'all' || a.severity === sev) &&
    (!q || `${a.machineCode} ${a.title} ${a.detail} ${a.department} ${a.type}`.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="px-5 sm:px-7 pt-1 pb-10 space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Active Alerts" value={counts.total} sub="Across your machines" accent={counts.total ? 'stopped' : 'accent'} icon={Bell} />
        <StatCard label="Critical" value={counts.critical} sub="Immediate attention" accent="stopped" icon={AlertCircle} />
        <StatCard label="Warning" value={counts.warning} sub="Needs review" accent="idle" icon={AlertTriangle} />
        <StatCard label="Info" value={counts.info} sub="Advisory" accent="accent" icon={Info} />
      </div>

      <div className="panel p-3.5 flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel/60 pointer-events-none" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search machine, alert, department…" className="input pl-9" />
        </div>
        <div className="inline-flex items-center gap-1 bg-base border border-line rounded-xl p-1">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setSev(f)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors', sev === f ? 'bg-accent text-white' : 'text-steel hover:text-primary')}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="panel p-12 text-center">
          <CheckCircle2 size={28} className="text-running mx-auto mb-3" />
          <div className="text-sm text-steel">{alerts.length === 0 ? 'No active alerts — everything is running.' : 'No alerts match your filters.'}</div>
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>SEVERITY</th><th>MACHINE</th><th>DEPARTMENT</th><th>ALERT</th><th className="r">WHEN</th></tr></thead>
            <tbody>
              {filtered.map((a) => {
                const s = SEV[a.severity];
                return (
                  <tr key={a.id}>
                    <td><span className={cn('pill whitespace-nowrap', s.tone)}><span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />{s.label}</span></td>
                    <td><Link to={`/machines/${a.machineCode}`} className="data font-bold text-accent hover:underline inline-flex items-center gap-1">{a.machineCode} <ArrowUpRight size={12} /></Link></td>
                    <td className="text-steel">{a.department}</td>
                    <td><div className="font-semibold text-primary">{a.title}</div>{a.detail && <div className="text-xs text-steel">{a.detail}</div>}</td>
                    <td className="r text-steel whitespace-nowrap">{a.ts ? fmtAgo(a.ts) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
