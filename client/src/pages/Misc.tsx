// ============================================================
//  AI QUERY PAGE + generic placeholder for pages not yet built
//  EKC re-skin — visual layer only, logic/behaviour unchanged.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send } from 'lucide-react';
import { api } from '../api/client';
import { cn } from '../lib/utils';

const CHIPS = [
  'How many machines are running?',
  'Which machine had the most downtime in the last 24h?',
  'How much did we produce in the last 24 hours?',
  'What jobs is nikki working on?',
  'Show me all pending jobs',
];

type ChatMsg = { role: 'user' | 'ai'; text: string; tools?: string[]; detail?: string };

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
      const err = e as { response?: { status?: number; data?: { error?: string; detail?: string } } };
      const msg = err?.response?.status === 503
        ? 'AI isn’t configured yet — add a GEMINI_API_KEY on the server to enable it.'
        : err?.response?.data?.error || 'Sorry, I couldn’t answer that right now.';
      setMsgs((m) => [...m, { role: 'ai', text: msg, detail: err?.response?.data?.detail }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-5 sm:px-7 pt-1 pb-10">
      <div className="panel flex flex-col overflow-hidden h-[calc(100vh-150px)]">
        {/* header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-line">
          <span className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0"><Sparkles size={18} className="text-accent" /></span>
          <div>
            <div className="text-base font-extrabold text-primary leading-tight">AI Query</div>
            <div className="text-xs text-steel">Ask about machines, production, jobs and downtime — answers come from your live data.</div>
          </div>
        </div>

        {/* messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-[18px] flex flex-col gap-3">
          {msgs.length === 0 && (
            <div className="m-auto text-center text-steel max-w-[440px]">
              <Sparkles size={26} className="text-accent opacity-70 mx-auto" />
              <div className="font-bold mt-2 text-primary">Ask anything about the plant</div>
              <div className="text-[13px] mt-1">Try one of the suggestions below, or type your own question.</div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={cn('max-w-[80%]', m.role === 'user' ? 'self-end' : 'self-start')}>
              <div className={cn(
                'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
                m.role === 'user' ? 'bg-accent text-white rounded-tr-[4px]' : 'bg-raised text-primary rounded-tl-[4px]',
              )}>{m.text}</div>
              {m.tools && m.tools.length > 0 && (
                <div className="text-[11px] text-steel mt-1 ml-1.5">
                  ↳ from {Array.from(new Set(m.tools)).map((t) => t.replace(/^get_/, '').replace(/_/g, ' ')).join(', ')}
                </div>
              )}
              {m.detail && (
                <details className="mt-1 ml-1.5">
                  <summary className="text-[11px] text-steel cursor-pointer hover:text-primary select-none">Show technical detail</summary>
                  <pre className="mt-1 whitespace-pre-wrap break-words bg-raised border border-line rounded-lg p-2 text-[10.5px] text-steel max-h-40 overflow-auto">{m.detail}</pre>
                </details>
              )}
            </div>
          ))}
          {loading && (
            <div className="self-start px-3.5 py-2.5 rounded-2xl rounded-tl-[4px] bg-raised text-steel text-sm">
              Thinking…
            </div>
          )}
        </div>

        {/* suggestions + input */}
        <div className="border-t border-line p-3.5">
          {msgs.length === 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {CHIPS.map((c) => (
                <button key={c} onClick={() => ask(c)} disabled={loading}
                  className="border border-line rounded-full px-3.5 py-1.5 text-accent text-sm hover:bg-accent/5 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
                  {c}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2.5">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') ask(q); }}
              placeholder="Ask about production, machines, jobs, downtime…"
              className="input"
            />
            <button onClick={() => ask(q)} disabled={loading || !q.trim()}
              className="bg-accent text-white rounded-lg px-4 flex items-center gap-1.5 font-bold shrink-0 disabled:opacity-60 disabled:cursor-not-allowed">
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
    <div className="px-5 sm:px-7 pt-1 pb-10">
      <div className="panel p-12 text-center">
        <div className="text-lg font-extrabold text-primary mb-2">{title}</div>
        <div className="text-steel text-sm max-w-[460px] mx-auto">
          This page is wired into the role-based shell and ready to build out.
          The data layer, scoping, and live updates already work — this view just
          needs its specific charts/tables added.
        </div>
      </div>
    </div>
  );
}
