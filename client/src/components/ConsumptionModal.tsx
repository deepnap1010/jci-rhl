// ============================================================
//  CONSUMPTION MODAL  —  per-machine water / electricity history
//  Pulls the machine's telemetry history and shows the relevant
//  consumption metric over time (water L/hr, or computed power kW).
// ============================================================
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../api/client';
import type { HistoryRow } from '../hooks/useData';
import { StatusPill } from './ui';
import { useModalDismiss } from '../hooks/useModalDismiss';

// power load per reading — mirrors the server's electricity derivation
const powerOf = (r: HistoryRow) => Math.round(r.speed * 1.6 + r.waterFlow * 0.01 + r.production * 0.0005 + 12);

export default function ConsumptionModal({
  code, name, metric, from, to, onClose,
}: { code: string; name?: string; metric: 'water' | 'electricity'; from?: string; to?: string; onClose: () => void }) {
  useModalDismiss(onClose);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    setLoading(true);
    const params: Record<string, string | number> = { machineId: code, limit: 200 };
    if (from && to) { params.from = from; params.to = to; }
    api.get<{ rows: HistoryRow[] }>('/api/history', { params, signal: ctrl.signal })
      .then((r) => { if (alive) setRows(r.data.rows || []); })
      .catch((e) => { if (alive && e?.code !== 'ERR_CANCELED') setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; ctrl.abort(); };
  }, [code, from, to]);

  const valOf = (r: HistoryRow) => (metric === 'water' ? r.waterFlow : powerOf(r));
  const unit = metric === 'water' ? 'L/hr' : 'kW';
  const label = metric === 'water' ? 'Water Flow' : 'Power Load';
  const accent = metric === 'water' ? 'var(--accent-blue)' : 'var(--accent-amber)';
  const vals = rows.map(valOf);
  const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  const peak = vals.length ? Math.max(...vals) : 0;
  const peakScale = Math.max(1, peak);

  return (
    <div style={overlay} onClick={onClose}>
      <div className="card" style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>{code} — {label} History</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          {name || code} · last {rows.length} readings · avg <b style={{ color: accent }}>{avg.toLocaleString()} {unit}</b> · peak <b style={{ color: accent }}>{peak.toLocaleString()} {unit}</b>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No history for this machine yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-faint)', fontSize: 11 }}>
                <th style={hc}>TIME</th><th style={hc}>STATUS</th><th style={hc}>{label.toUpperCase()}</th><th style={{ ...hc, width: '38%' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const v = valOf(r);
                return (
                  <tr key={r._id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={hc} className="mono">{fmt(r.ts)}</td>
                    <td style={hc}><StatusPill status={r.status} /></td>
                    <td style={hc} className="mono"><b>{v.toLocaleString()}</b> <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{unit}</span></td>
                    <td style={hc}>
                      <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 99 }}>
                        <div style={{ width: `${Math.max(2, (v / peakScale) * 100)}%`, height: '100%', background: accent, borderRadius: 99 }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(20,28,46,.45)', display: 'grid', placeItems: 'start center', paddingTop: '6vh', zIndex: 50, backdropFilter: 'blur(2px)' };
const modal: React.CSSProperties = { width: 'min(680px,92vw)', maxHeight: '84vh', overflowY: 'auto', padding: 24, animation: 'fadeUp .25s ease' };
const hc: React.CSSProperties = { padding: '8px 8px' };
