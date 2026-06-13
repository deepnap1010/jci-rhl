// ============================================================
//  AI QUERY PAGE + generic placeholder for pages not yet built
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send } from 'lucide-react';
import { api } from '../api/client';

const CHIPS = [
  'How many machines are running?',
  'Which machine had the most downtime in the last 24h?',
  'How much did we produce in the last 24 hours?',
  'What jobs is nikki working on?',
  'Show me all pending jobs',
];

type ChatMsg = { role: 'user' | 'ai'; text: string; tools?: string[] };

export function AiQuery() {
  const [q, setQ] = useState('');
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, loading]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || loading) return;
    setMsgs((m) => [...m, { role: 'user', text }]);
    setQ('');
    setLoading(true);
    try {
      const { data } = await api.post<{ answer: string; toolsUsed: string[] }>('/api/ai/query', { question: text });
      setMsgs((m) => [...m, { role: 'ai', text: data.answer, tools: data.toolsUsed }]);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string } } };
      const msg = err?.response?.status === 503
        ? 'AI isn’t configured yet — add a GEMINI_API_KEY on the server to enable it.'
        : err?.response?.data?.error || 'Sorry, I couldn’t answer that right now.';
      setMsgs((m) => [...m, { role: 'ai', text: msg }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '0 28px 40px' }}>
      <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 150px)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', background: 'linear-gradient(180deg,#f5f7ff,#fff)' }}>
          <Sparkles size={18} color="var(--brand)" />
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>AI Query</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ask about machines, production, jobs and downtime — answers come from your live data.</div>
          </div>
        </div>

        {/* messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {msgs.length === 0 && (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)', maxWidth: 440 }}>
              <Sparkles size={26} color="var(--brand)" style={{ opacity: 0.7 }} />
              <div style={{ fontWeight: 700, marginTop: 8, color: 'var(--text)' }}>Ask anything about the plant</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Try one of the suggestions below, or type your own question.</div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
              <div style={{
                padding: '10px 14px', borderRadius: 14, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                background: m.role === 'user' ? 'var(--brand)' : 'var(--surface-2)',
                color: m.role === 'user' ? '#fff' : 'var(--text)',
                borderTopRightRadius: m.role === 'user' ? 4 : 14, borderTopLeftRadius: m.role === 'user' ? 14 : 4,
              }}>{m.text}</div>
              {m.tools && m.tools.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4, marginLeft: 6 }}>
                  ↳ from {Array.from(new Set(m.tools)).map((t) => t.replace(/^get_/, '').replace(/_/g, ' ')).join(', ')}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: 14, background: 'var(--surface-2)', color: 'var(--text-muted)', fontSize: 14 }}>
              Thinking…
            </div>
          )}
        </div>

        {/* suggestions + input */}
        <div style={{ borderTop: '1px solid var(--border)', padding: 14 }}>
          {msgs.length === 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {CHIPS.map((c) => (
                <button key={c} onClick={() => ask(c)} disabled={loading}
                  style={{ border: '1px solid var(--border-strong)', background: 'var(--surface)', borderRadius: 99, padding: '6px 14px', fontSize: 13, color: 'var(--brand)', cursor: 'pointer' }}>
                  {c}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') ask(q); }}
              placeholder="Ask about production, machines, jobs, downtime…"
              style={{ flex: 1, border: '1px solid var(--border-strong)', borderRadius: 10, padding: '11px 14px', fontSize: 14, outline: 'none' }}
            />
            <button onClick={() => ask(q)} disabled={loading || !q.trim()} style={{ background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '0 18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, opacity: loading || !q.trim() ? 0.6 : 1, cursor: loading || !q.trim() ? 'not-allowed' : 'pointer' }}>
              <Send size={16} /> Ask
            </button>
          </div>
        </div>
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
