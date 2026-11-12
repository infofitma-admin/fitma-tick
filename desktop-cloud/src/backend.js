'use strict';
/*
 * Fitma Tick (Cloud) — backend adapter.
 *
 * The desktop app speaks one small action protocol:
 *   login | projects | ingest | screenshot | events | activity
 * The team build sends those to the Google Apps Script workspace. This build
 * sends the SAME actions to the commercial Supabase backend instead, so the
 * rest of the app (timer, idle, capture, screenshots) is unchanged.
 *
 * It keeps the signed-in session (access + refresh token, company, user) in the
 * app config and refreshes the token automatically, so tracking can run for
 * hours without the person logging in again.
 */

const SUPABASE_URL = 'https://adyqhpqugdlksqzpscwm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_l3HBtg1KUO6nBZkwxXqQvw_9uPyXSRz';

function createApi({ getSession, setSession }) {
  // name -> id, filled by the projects action, used to resolve entries.
  let projectMap = {};

  function headers(extra) {
    return Object.assign({ apikey: SUPABASE_KEY }, extra || {});
  }
  function authHeaders(s, extra) {
    return headers(Object.assign({ authorization: 'Bearer ' + s.access_token }, extra || {}));
  }

  async function asJson(res) {
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
    return { ok: res.ok, status: res.status, body };
  }

  // Refresh the access token when it is close to expiring (or on demand).
  async function ensureFresh(force) {
    const s = getSession();
    if (!s || !s.refresh_token) throw new Error('Not signed in.');
    const soon = (s.expires_at || 0) - 60 * 1000;
    if (!force && Date.now() < soon) return s;
    const r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    const { ok, body } = await asJson(r);
    if (!ok || !body || !body.access_token) throw new Error('Your session expired. Please sign in again.');
    const next = Object.assign({}, s, {
      access_token: body.access_token,
      refresh_token: body.refresh_token || s.refresh_token,
      expires_at: Date.now() + (body.expires_in || 3600) * 1000
    });
    setSession(next);
    return next;
  }

  // Run an authenticated request, refreshing + retrying once on a 401.
  async function authed(fn) {
    let s = await ensureFresh(false);
    let r = await fn(s);
    if (r.status === 401) { s = await ensureFresh(true); r = await fn(s); }
    return r;
  }

  // ---- actions -----------------------------------------------------------
  async function login(email, password) {
    const r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ email: email, password: password })
    });
    const { ok, body } = await asJson(r);
    if (!ok || !body || !body.access_token) {
      throw new Error((body && (body.error_description || body.msg || body.error)) || 'Wrong email or password.');
    }
    const session = {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_at: Date.now() + (body.expires_in || 3600) * 1000,
      user_id: body.user && body.user.id,
      name: (body.user && body.user.user_metadata && body.user.user_metadata.full_name) || email,
      company_id: null
    };
    // find which company this person belongs to (first active membership)
    const m = await fetch(SUPABASE_URL + '/rest/v1/memberships?select=company_id,role&user_id=eq.' + session.user_id + '&status=eq.active&limit=1',
      { headers: authHeaders(session) });
    const mm = await asJson(m);
    if (!mm.ok || !mm.body || !mm.body.length) {
      throw new Error('This account is not part of a workspace yet. Ask your admin for an invite, or create one on the website.');
    }
    session.company_id = mm.body[0].company_id;
    setSession(session);
    // company settings (screenshot on/off + interval, idle limit) — applied by the tracker
    let settings = {};
    try {
      const cs = await fetch(SUPABASE_URL + '/rest/v1/companies?select=settings&id=eq.' + session.company_id + '&limit=1', { headers: authHeaders(session) });
      const csj = await asJson(cs);
      if (csj.ok && csj.body && csj.body[0] && csj.body[0].settings) settings = csj.body[0].settings;
    } catch (e) {}
    return { deviceToken: 'cloud', empId: session.user_id, name: session.name, mustChange: false, settings: settings };
  }

  // Fetch the latest company settings on demand (tracker refreshes these periodically).
  async function companySettings() {
    try {
      const r = await authed((s) => fetch(
        SUPABASE_URL + '/rest/v1/companies?select=settings&id=eq.' + s.company_id + '&limit=1',
        { headers: authHeaders(s) }).then(asJson));
      if (r.ok && r.body && r.body[0] && r.body[0].settings) return { settings: r.body[0].settings };
    } catch (e) {}
    return { settings: {} };
  }

  async function projects() {
    const r = await authed((s) => fetch(
      SUPABASE_URL + '/rest/v1/projects?select=id,name&company_id=eq.' + s.company_id + '&archived=eq.false&order=name',
      { headers: authHeaders(s) }).then(asJson));
    const list = (r.ok && Array.isArray(r.body)) ? r.body : [];
    projectMap = {};
    list.forEach((p) => { projectMap[p.name] = p.id; });
    return { projects: list };
  }

  async function ingest(entries) {
    const s = await ensureFresh(false);
    const rows = (entries || []).map((e) => ({
      company_id: s.company_id,
      user_id: s.user_id,
      project_id: projectMap[e.project] || null,
      started_at: e.start,
      ended_at: e.end,
      duration_sec: Math.max(0, Math.round((new Date(e.end) - new Date(e.start)) / 1000)),
      source: 'desktop'
    }));
    if (!rows.length) return {};
    const r = await authed((ss) => fetch(SUPABASE_URL + '/rest/v1/time_entries', {
      method: 'POST', headers: authHeaders(ss, { 'content-type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(rows)
    }).then(asJson));
    if (!r.ok) throw new Error((r.body && r.body.message) || ('Could not save time (' + r.status + ')'));
    return {};
  }

  async function screenshot(image, ts, activity) {
    const s = await ensureFresh(false);
    const buf = Buffer.from(image, 'base64');
    const safeTs = String(ts).replace(/[:.]/g, '-');
    const path = s.company_id + '/' + s.user_id + '/' + safeTs + '-' + Math.random().toString(36).slice(2, 7) + '.jpg';
    const up = await authed((ss) => fetch(SUPABASE_URL + '/storage/v1/object/screenshots/' + path, {
      method: 'POST', headers: authHeaders(ss, { 'content-type': 'image/jpeg', 'x-upsert': 'true' }), body: buf
    }).then(asJson));
    if (!up.ok) throw new Error((up.body && up.body.message) || ('Screenshot upload failed (' + up.status + ')'));
    const row = await authed((ss) => fetch(SUPABASE_URL + '/rest/v1/screenshots', {
      method: 'POST', headers: authHeaders(ss, { 'content-type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ company_id: ss.company_id, user_id: ss.user_id, captured_at: ts, storage_path: path, activity_pct: activity })
    }).then(asJson));
    if (!row.ok) throw new Error((row.body && row.body.message) || ('Screenshot record failed (' + row.status + ')'));
    return {};
  }

  async function activity(items) {
    const s = await ensureFresh(false);
    const rows = (items || []).map((it) => ({
      company_id: s.company_id,
      user_id: s.user_id,
      started_at: it.ts,
      app_name: it.app || null,
      title: it.title || null,
      url: it.url || null,
      host: it.host || null
    }));
    if (!rows.length) return {};
    const r = await authed((ss) => fetch(SUPABASE_URL + '/rest/v1/app_usage', {
      method: 'POST', headers: authHeaders(ss, { 'content-type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(rows)
    }).then(asJson));
    if (!r.ok) throw new Error((r.body && r.body.message) || ('Could not save activity (' + r.status + ')'));
    return {};
  }

  // The dispatcher the app calls in place of its old apiPost().
  async function call(payload) {
    switch (payload.action) {
      case 'login':      return login(payload.email, payload.password);
      case 'projects':   return projects();
      case 'ingest':     return ingest(payload.entries);
      case 'screenshot': return screenshot(payload.image, payload.ts, payload.activity);
      case 'activity':   return activity(payload.items);
      case 'settings':   return companySettings();
      case 'events':     return {}; // session events are a workspace-only feature for now
      default:           return {};
    }
  }

  return { call };
}

module.exports = { createApi, SUPABASE_URL };
