// ============================================================
//  AI QUERY PAGE + generic placeholder for pages not yet built
// ============================================================
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useMachines } from '../hooks/useData';

const CHIPS = [
  "Today's production?", 'How many machines running?', 'Department efficiency?',
  'Active jobs count?', 'Pending jobs?', 'Total employees?',
];

export function AiQuery() {
  const { machines } = useMachines();
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);

  // a simple local "answer" engine over the live data (no external LLM here)
  function ask(question: string) {
    const running = machines.filter((m) => m.status === 'running').length;
    const prod = machines.reduce((s, m) => s + (m.state?.production || 0), 0);
    const lower = question.toLowerCase();
    if (lower.includes('running')) setAnswer(`${running} of ${machines.length} machines are currently running.`);
    else if (lower.includes('production')) setAnswer(`Total live production across your machines is ${prod} mtr.`);
    else if (lower.includes('efficiency')) {
      const states = machines.map((m) => m.state?.efficiency || 0);
      const avg = states.length ? Math.round(states.reduce((a, b) => a + b, 0) / states.length) : 0;
      setAnswer(`Average efficiency across your machines is ${avg}%.`);
    } else setAnswer(`You have ${machines.length} machines in scope, ${running} running.`);
  }

  return (
    <div style={{ padding: '0 28px 40px' }}>
      <div className="card" style={{ padding: 22, background: 'linear-gradient(180deg,#f5f7ff,#fff)' }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Sparkles size={18} color="var(--brand)" /> AI Query — Live Data
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask about production, machines, jobs…"
            style={{ flex: 1, border: '1px solid var(--border-strong)', borderRadius: 10, padding: '11px 14px', fontSize: 14, outline: 'none' }}
          />
          <button onClick={() => ask(q)} style={{ background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '0 20px', fontWeight: 700 }}>
            Ask
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {CHIPS.map((c) => (
            <button key={c} onClick={() => { setQ(c); ask(c); }}
              style={{ border: '1px solid var(--border-strong)', background: '#fff', borderRadius: 99, padding: '6px 14px', fontSize: 13, color: 'var(--brand)' }}>
              {c}
            </button>
          ))}
        </div>
        {answer && (
          <div style={{ marginTop: 18, padding: 16, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, fontSize: 14 }}>
            {answer}
          </div>
        )}
      </div>
    </div>
  );
}

// generic "coming soon" page reused for utility/management sections
export function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ padding: '0 28px 40px' }}>
      <div className="card" style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{title}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 460, margin: '0 auto' }}>
          This page is wired into the role-based shell and ready to build out.
          The data layer, scoping, and live updates already work — this view just
          needs its specific charts/tables added.
        </div>
      </div>
    </div>
  );
}
