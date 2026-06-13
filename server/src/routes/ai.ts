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

router.post('/api/ai/query', async (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'AI is not configured yet. Add GEMINI_API_KEY to the server environment.' });
  const question = String(req.body?.question || '').trim();
  if (!question) return res.status(400).json({ error: 'question is required' });

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;
    const contents: { role: string; parts: unknown[] }[] = [{ role: 'user', parts: [{ text: question }] }];
    const toolsUsed: string[] = [];
    let answer = '';

    for (let step = 0; step < 6; step++) {
      const body = {
        system_instruction: { parts: [{ text: `${SYSTEM}\nCurrent date/time (server): ${new Date().toISOString()}` }] },
        contents,
        tools: [{ function_declarations: AI_TOOLS }],
      };
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) {
        const detail = (await r.text()).slice(0, 400);
        return res.status(502).json({ error: 'The AI service rejected the request.', detail });
      }
      const data = await r.json() as { candidates?: { content?: { parts?: Part[] } }[] };
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const call = parts.find((p) => p.functionCall)?.functionCall;

      if (call) {
        toolsUsed.push(call.name);
        const result = await runTool(call.name, call.args ?? {}, req.user!);
        contents.push({ role: 'model', parts: [{ functionCall: call }] });
        contents.push({ role: 'function', parts: [{ functionResponse: { name: call.name, response: { result } } }] });
        continue; // let the model read the result and either call again or answer
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
