// Fitma Tick — manager digest email (Supabase Edge Function).
//
// Runs on a schedule (weekday mornings). For every company it builds a short
// summary of yesterday / this week and emails it to that company's managers
// (owner + admin) via Resend. Uses the service-role key, so it reads data
// server-side without any user session.
//
// Secrets expected (set in the Supabase dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY   — your Resend API key
//   DIGEST_FROM      — optional, defaults to "Fitma Tick <onboarding@resend.dev>"
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM = Deno.env.get("DIGEST_FROM") || "Fitma Tick <onboarding@resend.dev>";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const fmtDur = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};
const esc = (s: string) =>
  (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

function dayBoundsUTC() {
  const now = new Date();
  const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startYest = new Date(startToday.getTime() - 864e5);
  // week starts Monday
  const dow = (startToday.getUTCDay() + 6) % 7;
  const startWeek = new Date(startToday.getTime() - dow * 864e5);
  return { startToday, startYest, startWeek };
}

async function emailsFor(userIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const id of userIds) {
    try {
      const { data } = await sb.auth.admin.getUserById(id);
      if (data?.user?.email) out[id] = data.user.email;
    } catch (_e) { /* skip */ }
  }
  return out;
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text());
  return res.ok;
}

async function run() {
  const { startYest, startWeek } = dayBoundsUTC();
  const yISO = startYest.toISOString();
  const wkISO = startWeek.toISOString();

  const { data: companies } = await sb.from("companies").select("id,name");
  let sent = 0;

  for (const co of companies || []) {
    // active members + managers
    const { data: mems } = await sb.from("memberships")
      .select("user_id,role").eq("company_id", co.id).eq("status", "active");
    if (!mems || !mems.length) continue;
    const managers = mems.filter((m) => m.role === "owner" || m.role === "admin").map((m) => m.user_id);
    if (!managers.length) continue;

    // time this week (covers yesterday too)
    const { data: ents } = await sb.from("time_entries")
      .select("user_id,duration_sec,started_at").eq("company_id", co.id).gte("started_at", wkISO);
    let secWeek = 0, secYesterday = 0;
    const perWeek: Record<string, number> = {};
    const yEndISO = new Date(startYest.getTime() + 864e5).toISOString(); // start of today
    (ents || []).forEach((e: any) => {
      const s = e.duration_sec || 0;
      secWeek += s;
      perWeek[e.user_id] = (perWeek[e.user_id] || 0) + s;
      if (e.started_at >= yISO && e.started_at < yEndISO) secYesterday += s;
    });

    // pending approvals
    const { count: pMT } = await sb.from("manual_time_requests")
      .select("id", { count: "exact", head: true }).eq("company_id", co.id).eq("status", "pending");
    const { count: pTO } = await sb.from("time_off_requests")
      .select("id", { count: "exact", head: true }).eq("company_id", co.id).eq("status", "pending");

    // names
    const uids = [...new Set((mems).map((m) => m.user_id))];
    const { data: profs } = await sb.from("profiles").select("id,full_name").in("id", uids);
    const nameOf = (u: string) => (profs || []).find((p: any) => p.id === u)?.full_name || "Member";

    const top = Object.entries(perWeek).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const rows = top.map(([u, s]) =>
      `<tr><td style="padding:6px 10px;border-bottom:1px solid #eef0f2">${esc(nameOf(u))}</td>
       <td style="padding:6px 10px;border-bottom:1px solid #eef0f2;text-align:right;font-weight:600">${fmtDur(s)}</td></tr>`).join("");

    const attention = (pMT || pTO)
      ? `<p style="margin:14px 0 4px"><b>Needs your attention:</b> ${pMT ? `${pMT} manual-time to approve` : ""}${(pMT && pTO) ? " · " : ""}${pTO ? `${pTO} time-off request(s)` : ""}</p>`
      : "";

    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#273545;max-width:560px">
      <h2 style="font-size:18px;margin:0 0 2px">${esc(co.name)} — daily summary</h2>
      <p style="color:#5d7488;font-size:13px;margin:0 0 16px">${new Date().toUTCString().slice(0, 16)}</p>
      <table style="border-collapse:collapse;width:100%;margin-bottom:8px">
        <tr>
          <td style="padding:10px 12px;background:#f5f6f7;border-radius:8px"><div style="font-size:12px;color:#5d7488">Tracked yesterday</div><div style="font-size:20px;font-weight:700">${fmtDur(secYesterday)}</div></td>
          <td style="width:10px"></td>
          <td style="padding:10px 12px;background:#f5f6f7;border-radius:8px"><div style="font-size:12px;color:#5d7488">This week</div><div style="font-size:20px;font-weight:700">${fmtDur(secWeek)}</div></td>
        </tr>
      </table>
      ${attention}
      <h3 style="font-size:14px;margin:16px 0 6px">Hours this week by member</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px">${rows || `<tr><td style="padding:6px 10px;color:#92aabe">No time tracked yet.</td></tr>`}</table>
      <p style="color:#92aabe;font-size:11px;margin-top:18px">Fitma Tick · open the app for full reports.</p>
    </div>`;

    const mails = await emailsFor(managers);
    for (const u of managers) {
      const to = mails[u];
      if (!to) continue;
      if (await sendEmail(to, `${co.name} — daily summary`, html)) sent++;
    }
  }
  return sent;
}

Deno.serve(async (_req) => {
  try {
    const sent = await run();
    return new Response(JSON.stringify({ ok: true, sent }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
