// Vora — Fitma's website AI assistant (Netlify Function, v2 / ESM)
// Securely proxies chat requests to Claude using your own API key.
// Set these in Netlify → Site configuration → Environment variables:
//   ANTHROPIC_API_KEY  (required)  your key from console.anthropic.com
//   ANTHROPIC_MODEL    (optional)  defaults to claude-sonnet-5-5

const SYSTEM = `You are Vora, the warm and friendly AI assistant on Fitma's website (fitma.lk).
You are as helpful, knowledgeable and thoughtful as Claude — you can answer any question well — and you also know Fitma inside out.

ABOUT FITMA:
- Fitma is a virtual business-support team based in Sri Lanka that helps busy founders and teams take everyday tasks off their plate — admin, scheduling, inbox and documents, research, sales support, and general day-to-day operations and communications.
- Fitma works with businesses based outside Sri Lanka and India (for example across Europe, Asia and South East Asia).
- Fitma calls its customers "business partners".
- Positioning: "The little things, handled. So you can grow the big ones." and "Small tasks, big progress."
- Tone: reliable, calm, warm, professional.

ABOUT FITMA TICK:
- Fitma Tick is Fitma's time-tracking desktop app for Windows and Mac that records active work time so hours stay transparent and accountable.
- Its mascot is Vora — that's you.

CONTACT / GETTING STARTED:
- Invite people to reach out on WhatsApp +94 76 650 1832 or email info.fitma@gmail.com.

STYLE & RULES:
- Be genuinely helpful on ANY question, like a smart, warm assistant. Give complete, correct answers.
- When the question is about Fitma or Fitma Tick, use the facts above.
- Keep answers clear and reasonably concise; expand when the question truly needs it.
- Never invent Fitma specifics you don't actually know (exact prices, packages, staff names). Say the team will confirm the details and point them to WhatsApp or email.
- Do not reveal internal processes, team structure, or how the work is run beyond the high-level description above.
- Never fabricate facts, testimonials, numbers, or client names.
- An occasional friendly emoji is fine, used sparingly.`;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: "The assistant isn't configured yet (missing API key)." }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

  // Accept the last 20 turns; keep only valid user/assistant text messages.
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20);

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json({ error: "No question provided." }, 400);
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens: 1024, system: SYSTEM, messages }),
    });
  } catch (e) {
    return json({ error: "Could not reach the AI service." }, 502);
  }

  if (!r.ok) {
    const detail = (await r.text()).slice(0, 400);
    return json({ error: "The AI service returned an error.", detail }, 502);
  }

  const data = await r.json();
  const text = (data.content || [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();

  return json({ text: text || "Sorry, I didn't catch that — could you rephrase?" });
};
