// ============================================================
//  AI QUERY ROUTE  —  natural-language Q&A over live factory data
//  POST /api/ai/query { question } → { answer, toolsUsed }
//
//  Uses Google Gemini (free tier) with FUNCTION CALLING: the model
//  decides which read-only tool to call, we run it against the
//  user-scoped data, feed the result back, and it answers in words.
//  No data is "trained in" — every answer is grounded in a live
//  tool result. Requires GEMINI_API_KEY in the server env.
// ============================================================
import { Router } from 'express';
import { AI_TOOLS, runTool } from '../lib/aiTools';

const router = Router();
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

const SYSTEM = `You are the JCI SmartFactory assistant for a textile production plant.
Answer questions about the factory using ONLY the provided tools, which return LIVE data already scoped to the current user's permissions.
Rules:
- For any question about machines, production, jobs, people or downtime, CALL A TOOL first. Never invent or guess numbers.
- If the tools don't contain the answer, say you don't have that data — do not make it up.
- Be concise and specific: cite machine codes, names and exact numbers. Round sensibly.
- Production is in meters, time in minutes/hours, temperature in °C.
- When the user gives a relative date ("today", "this week", "between 6 and 8 June"), convert it to an ISO range for the tool using the current date/time provided.`;

type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Gemini free tier intermittently returns 503 (high demand) / 429 (rate limit) — retry with backoff.
async function geminiFetch(url: string, body: unknown): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok || (r.status !== 503 && r.status !== 429)) return r;
    last = r;
    await sleep(1200 * (i + 1));
  }
  return last as Response;
}

router.post('/api/ai/query', async (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'AI is not configured yet. Add GEMINI_API_KEY to the server environment.' });
  const question = String(req.body?.question || '').trim();
  if (!question) return res.status(400).json({ error: 'question is required' });

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;
    const contents: unknown[] = [{ role: 'user', parts: [{ text: question }] }];
    const toolsUsed: string[] = [];
    let answer = '';

    for (let step = 0; step < 6; step++) {
      const body = {
        system_instruction: { parts: [{ text: `${SYSTEM}\nCurrent date/time (server): ${new Date().toISOString()}` }] },
        contents,
        tools: [{ function_declarations: AI_TOOLS }],
      };
      const r = await geminiFetch(url, body);
      if (!r.ok) {
        const detail = (await r.text()).slice(0, 400);
        const msg = r.status === 503 ? 'The AI is busy right now — please try again in a moment.'
          : r.status === 429 ? 'AI rate limit reached — please wait a few seconds and retry.'
          : 'The AI service returned an error.';
        return res.status(502).json({ error: msg, detail });
      }
      const data = await r.json() as { candidates?: { content?: { role?: string; parts?: Part[] } }[] };
      const content = data.candidates?.[0]?.content;
      const parts = content?.parts ?? [];
      const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall!);

      if (calls.length) {
        // echo the model's turn back VERBATIM (keeps each functionCall's thought_signature, which
        // Gemini requires), then answer each call with the live tool result.
        contents.push(content);
        const responseParts: unknown[] = [];
        for (const c of calls) {
          toolsUsed.push(c.name);
          const result = await runTool(c.name, c.args ?? {}, req.user!);
          responseParts.push({ functionResponse: { name: c.name, response: { result } } });
        }
        contents.push({ role: 'user', parts: responseParts });
        continue; // let the model read the results and either call again or answer
      }

      answer = parts.filter((p) => p.text).map((p) => p.text).join('\n').trim();
      break;
    }

    res.json({ answer: answer || "I couldn't find an answer for that.", toolsUsed });
  } catch (err) {
    res.status(500).json({ error: 'AI query failed', detail: String(err) });
  }
});

export default router;
