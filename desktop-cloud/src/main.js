'use strict';
/*
 * Fitma Tick — main process.
 * Tracks active work time + activity, takes periodic screenshots, and uploads
 * everything to the Fitma Workspace (the same Apps Script backend the portal uses).
 * Backend actions used:  login | ingest | screenshot | projects | events | activity
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, powerMonitor, desktopCapturer, screen, nativeImage, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { captureActive } = require('./capture');
const { createApi, SUPABASE_URL } = require('./backend');

// ---- config --------------------------------------------------------------
const IDLE_LIMIT_S = 300;        // auto-pause after 5 min of no input
const ACTIVE_IF_IDLE_UNDER = 10; // a 1-second sample counts as "active" if last input was within 10s
const FLUSH_MS = 60 * 1000;      // push the running segment every minute (so nothing is lost)
const SHOT_MIN_MS = 9 * 60 * 1000;   // screenshot cadence ~10 min (jittered 9–12)
const SHOT_MAX_MS = 12 * 60 * 1000;
const SHOT_MAX_WIDTH = 1600;     // downscale screenshots to keep uploads small
const SITE_SAMPLE_MS = 30 * 1000;    // check the active app/website every 30s while working
const MAX_BUFFER = 600;              // cap offline buffers so memory can't grow forever

// ---- runtime settings (overridden by the company's Settings in the web app) --
const RT = {
  idleLimitS: IDLE_LIMIT_S,
  shotMinMs: SHOT_MIN_MS,
  shotMaxMs: SHOT_MAX_MS,
  shotsEnabled: true
};
// Map the company's saved settings (companies.settings jsonb) onto RT.
function applySettings(st) {
  try {
    st = st || {};
    const sc = st.screenshots || {};
    RT.shotsEnabled = sc.enabled !== false;               // default on
    const mins = Number(sc.intervalMin);
    if (mins && mins > 0) {                               // jitter ±10% around the chosen interval
      const base = mins * 60 * 1000;
      RT.shotMinMs = Math.max(60 * 1000, Math.round(base * 0.9));
      RT.shotMaxMs = Math.max(RT.shotMinMs + 30 * 1000, Math.round(base * 1.1));
    }
    const lim = Number((st.idle || {}).limitMin);
    if (lim && lim > 0) RT.idleLimitS = Math.max(60, Math.round(lim * 60));
  } catch (e) {}
}
// Re-fetch settings from the backend (fire-and-forget) so changes apply without a re-login.
async function refreshSettings() {
  try { const r = await apiPost({ action: 'settings' }); if (r && r.settings) applySettings(r.settings); } catch (e) {}
}

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'fitma-tick.json');
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf8')); } catch (e) { return {}; }
}
function saveConfig(cfg) {
  try { fs.writeFileSync(CONFIG_PATH(), JSON.stringify(cfg, null, 2)); } catch (e) {}
}
let cfg = {};
function baseUrl() { return SUPABASE_URL; }

// ---- backend client (Supabase cloud) -------------------------------------
// Same action protocol the app always used; the adapter keeps the signed-in
// session in cfg.cloud and refreshes the token on its own.
const backend = createApi({
  getSession: () => cfg.cloud || null,
  setSession: (s) => { cfg.cloud = s; saveConfig(cfg); }
});
async function apiPost(payload) { return backend.call(payload); }

// ---- tracking state ------------------------------------------------------
const T = {
  tracking: false,
  paused: false,          // auto-paused due to idle
  manualPaused: false,    // user pressed Pause
  project: '',
  segStart: 0,            // ms, start of the current un-flushed active segment (0 = none open)
  todaySec: 0,            // active seconds logged today (local calendar day)
  todayKey: '',
  activeSamples: 0,       // for activity% over the current screenshot window
  totalSamples: 0,
  lastShot: 0,
  nextShotAt: 0,
  shotsToday: 0,          // count only (timing is intentionally never exposed)
  flushTimer: null,
  tickTimer: null,
  siteTimer: null,
  events: [],             // session events (start/break/resume/stop/idle) pending upload
  acts: [],               // app/site samples pending upload
  idles: [],              // completed idle/away periods pending upload
  idleStartMs: 0,         // ms, when the current idle (away) period began (0 = not idle)
  lastSiteKey: '',        // de-dupe consecutive identical samples
  sitesToday: 0,
  aiToday: 0,
  lastErr: ''
};

function localDayKey(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function rollDayIfNeeded() {
  const k = localDayKey();
  if (T.todayKey !== k) { T.todayKey = k; T.todaySec = 0; T.shotsToday = 0; T.sitesToday = 0; T.aiToday = 0; }
}

// ---- session events + app/site activity ----------------------------------
// A "session event" marks exactly when someone started, took a break, came
// back, went idle, or stopped — so the admin can see if they left early.
function logEvent(type) {
  T.events.push({ type: type, ts: new Date().toISOString(), project: T.project || '' });
  if (T.events.length > MAX_BUFFER) T.events.splice(0, T.events.length - MAX_BUFFER);
  flushEvents();
}
async function flushEvents() {
  if (!T.events.length || !cfg.deviceToken) return;
  const batch = T.events.slice();
  try {
    await apiPost({ action: 'events', deviceToken: cfg.deviceToken, events: batch });
    T.events.splice(0, batch.length); // drop only what we sent
  } catch (e) { /* keep buffered; retried on next event or flush */ }
}

// Take one reading of the foreground app/website and queue it for upload.
async function sampleSite() {
  if (!T.tracking || T.paused || T.manualPaused) return;
  let r = null;
  try { r = await captureActive(); } catch (e) { r = null; }
  if (!r || (!r.app && !r.title)) return;
  const key = (r.app || '') + '|' + (r.url || r.title || '');
  if (key === T.lastSiteKey) return;  // same window as last sample — skip the duplicate
  T.lastSiteKey = key;
  T.acts.push({ ts: new Date().toISOString(), app: r.app, title: r.title, url: r.url, host: r.host || '', ai: !!r.ai, project: T.project || '' });
  if (T.acts.length > MAX_BUFFER) T.acts.splice(0, T.acts.length - MAX_BUFFER);
  T.sitesToday += 1; if (r.ai) T.aiToday += 1;
  pushState();
}
async function flushActs() {
  if (!T.acts.length || !cfg.deviceToken) return;
  const batch = T.acts.slice();
  try {
    await apiPost({ action: 'activity', deviceToken: cfg.deviceToken, items: batch });
    T.acts.splice(0, batch.length);
  } catch (e) { /* keep buffered */ }
}

// Record a completed idle/away period (the stretch with no keyboard or mouse).
function recordIdle(startMs, endMs) {
  T.idleStartMs = 0;
  if (!startMs || endMs - startMs < 60 * 1000) return; // ignore tiny gaps
  T.idles.push({ start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), project: T.project || '' });
  if (T.idles.length > MAX_BUFFER) T.idles.splice(0, T.idles.length - MAX_BUFFER);
  flushIdles();
}
async function flushIdles() {
  if (!T.idles.length || !cfg.deviceToken) return;
  const batch = T.idles.slice();
  try {
    await apiPost({ action: 'idle', deviceToken: cfg.deviceToken, items: batch });
    T.idles.splice(0, batch.length);
  } catch (e) { /* keep buffered */ }
}

// Push one active segment [startMs, endMs] to the backend as a work entry.
async function flushSegment(endMs) {
  if (!T.segStart) return;
  const startMs = T.segStart;
  T.segStart = (T.tracking && !T.paused) ? endMs : 0; // reopen immediately if still running
  if (endMs - startMs < 1000) return; // nothing meaningful
  const activity = T.totalSamples ? Math.round((T.activeSamples / T.totalSamples) * 100) : 0;
  const entry = {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    type: 'Fitma Tick',
    project: T.project || '',
    task: '',
    note: ''
  };
  try {
    await apiPost({ action: 'ingest', deviceToken: cfg.deviceToken, entries: [entry] });
    T.lastErr = '';
  } catch (e) {
    // keep the time: re-open the segment back to its original start so we retry next flush
    if (T.tracking) T.segStart = startMs;
    T.lastErr = e.message || String(e);
  }
  void activity;
}

// ---- screenshots ---------------------------------------------------------
async function captureAndUpload() {
  try {
    const displays = screen.getAllDisplays();
    const maxW = Math.max.apply(null, displays.map(d => Math.round(d.size.width * d.scaleFactor)));
    const maxH = Math.max.apply(null, displays.map(d => Math.round(d.size.height * d.scaleFactor)));
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: maxW, height: maxH } });
    const activity = T.totalSamples ? Math.round((T.activeSamples / T.totalSamples) * 100) : 0;
    for (const src of sources) {
      let img = src.thumbnail;
      if (img.isEmpty()) continue;
      const size = img.getSize();
      if (size.width > SHOT_MAX_WIDTH) {
        img = img.resize({ width: SHOT_MAX_WIDTH });
      }
      const jpeg = img.toJPEG(60);
      const b64 = jpeg.toString('base64');
      await apiPost({ action: 'screenshot', deviceToken: cfg.deviceToken, image: b64, ts: new Date().toISOString(), activity: activity });
    }
    T.lastShot = Date.now();
    T.shotsToday += 1;
  } catch (e) {
    T.lastErr = 'Screenshot: ' + (e.message || e);
  } finally {
    // reset the activity window after each screenshot, like WebWork intervals
    T.activeSamples = 0; T.totalSamples = 0;
    scheduleNextShot();
  }
}
function scheduleNextShot() {
  if (!RT.shotsEnabled) { T.nextShotAt = 0; return; }   // screenshots turned off for this company
  const jitter = RT.shotMinMs + Math.random() * (RT.shotMaxMs - RT.shotMinMs);
  T.nextShotAt = Date.now() + jitter;
}

// ---- the per-second tick -------------------------------------------------
function tick() {
  if (!T.tracking) return;
  if (T.manualPaused) { pushState(); return; }  // user paused: no time, no screenshots
  rollDayIfNeeded();
  const idle = powerMonitor.getSystemIdleTime(); // seconds since last input

  if (idle >= RT.idleLimitS) {
    // user went idle: close the segment at the moment idle began, then pause
    if (!T.paused && T.segStart) {
      const idleStartMs = Date.now() - idle * 1000;
      flushSegment(Math.max(T.segStart, idleStartMs));
      T.idleStartMs = idleStartMs;   // remember when the away period began
      logEvent('idle');   // record that they went away (no input)
    }
    T.paused = true;
  } else {
    if (T.paused) {
      // user is back: record how long they were away, then resume a fresh segment
      recordIdle(T.idleStartMs, Date.now());
      T.paused = false;
      T.segStart = Date.now();
      T.lastSiteKey = '';
      logEvent('active');
    }
    // count this active second
    T.todaySec += 1;
    T.totalSamples += 1;
    if (idle < ACTIVE_IF_IDLE_UNDER) T.activeSamples += 1;
    // time for a screenshot? (only when enabled for this company)
    if (RT.shotsEnabled && T.nextShotAt && Date.now() >= T.nextShotAt) {
      T.nextShotAt = 0; // guard against double-fire while capturing
      captureAndUpload();
    }
  }
  pushState();
}

// ---- start / stop --------------------------------------------------------
function startTracking(project) {
  if (T.tracking) return;
  refreshSettings();   // pick up any Settings changes the admin made since login
  rollDayIfNeeded();
  T.tracking = true; T.paused = false; T.manualPaused = false;
  T.project = project || T.project || '';
  T.segStart = Date.now();
  T.activeSamples = 0; T.totalSamples = 0;
  scheduleNextShot();
  T.lastSiteKey = '';
  T.flushTimer = setInterval(() => {
    if (T.tracking && !T.paused && !T.manualPaused && T.segStart) flushSegment(Date.now());
    flushEvents(); flushActs(); flushIdles();
  }, FLUSH_MS);
  T.tickTimer = setInterval(tick, 1000);
  T.siteTimer = setInterval(sampleSite, SITE_SAMPLE_MS);
  cfg.lastProject = T.project; saveConfig(cfg);
  logEvent('start');
  sampleSite();                 // grab the first reading right away
  updateTray(); pushState();
}
async function stopTracking() {
  if (!T.tracking) return;
  clearInterval(T.flushTimer); clearInterval(T.tickTimer); clearInterval(T.siteTimer);
  T.flushTimer = T.tickTimer = T.siteTimer = null;
  const wasOpen = T.segStart;
  if (T.paused && T.idleStartMs) recordIdle(T.idleStartMs, Date.now()); // close an open away period
  T.tracking = false; T.paused = false; T.manualPaused = false;
  if (wasOpen) await flushSegment(Date.now());
  T.segStart = 0;
  logEvent('stop');             // record exactly when they stopped (and left)
  await flushIdles();
  await flushActs();            // send any remaining site samples
  updateTray(); pushState();
}

// Manual break: user-controlled, distinct from the automatic idle pause.
function pauseTracking() {
  if (!T.tracking || T.manualPaused) return;
  if (T.segStart) flushSegment(Date.now());  // bank the time worked so far
  T.manualPaused = true;
  T.segStart = 0;
  logEvent('break');
  updateTray(); pushState();
}
function resumeTracking() {
  if (!T.tracking || !T.manualPaused) return;
  T.manualPaused = false;
  T.segStart = Date.now();
  T.lastSiteKey = '';
  scheduleNextShot();  // fresh window so resuming never triggers an instant shot
  logEvent('resume');
  sampleSite();
  updateTray(); pushState();
}

// ---- window + tray -------------------------------------------------------
let win = null, tray = null;
function createWindow() {
  win = new BrowserWindow({
    width: 380, height: 600, minWidth: 360, minHeight: 540,
    backgroundColor: '#f3f5f7',
    title: 'Fitma Tick',
    icon: iconPath(),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('close', (e) => {
    if (!app.isQuitting) { e.preventDefault(); win.hide(); } // keep running in tray
  });
  win.webContents.on('did-finish-load', pushState);
}
function iconPath() {
  const p = path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : (process.platform === 'darwin' ? 'icon.png' : 'icon.png'));
  return fs.existsSync(p) ? p : undefined;
}
function updateTray() {
  if (!tray) return;
  const statusLabel = T.tracking
    ? (T.manualPaused ? 'On break' : (T.paused ? 'Away (idle)' : 'Tracking…'))
    : 'Not tracking';
  const items = [
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    { label: 'Open Fitma Tick', click: () => { if (win) { win.show(); win.focus(); } } }
  ];
  if (!T.tracking) {
    items.push({ label: 'Start', click: () => { if (cfg.deviceToken && T.project) startTracking(); else { if (win) { win.show(); win.focus(); } } } });
  } else {
    items.push(T.manualPaused
      ? { label: 'End break', click: () => resumeTracking() }
      : { label: 'Break', click: () => pauseTracking() });
    items.push({ label: 'Stop', click: () => stopTracking() });
  }
  items.push({ type: 'separator' });
  items.push({ label: 'Quit Fitma Tick', click: async () => { app.isQuitting = true; await stopTracking(); app.quit(); } });
  const menu = Menu.buildFromTemplate(items);
  tray.setToolTip('Fitma Tick' + (T.tracking ? (T.manualPaused ? ' — on break' : (T.paused ? ' — away' : ' — tracking')) : ''));
  tray.setContextMenu(menu);
}
function createTray() {
  let img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  if (img.isEmpty()) img = nativeImage.createEmpty();
  tray = new Tray(img);
  tray.on('click', () => { if (win) { win.isVisible() ? win.focus() : win.show(); } });
  updateTray();
}

// ---- state to renderer ---------------------------------------------------
function pushState() {
  if (!win || win.isDestroyed()) return;
  const activity = T.totalSamples ? Math.round((T.activeSamples / T.totalSamples) * 100) : 0;
  win.webContents.send('state', {
    signedIn: !!cfg.deviceToken,
    name: cfg.name || '',
    empId: cfg.empId || '',
    mustChange: !!cfg.mustChange,
    tracking: T.tracking,
    paused: T.paused,            // automatic idle pause
    manualPaused: T.manualPaused,// user-pressed pause
    project: T.project,
    todaySec: T.todaySec,
    activity: activity,
    // Screenshot timing is deliberately NOT sent to the UI (anti-cheat):
    // the user can see that capture is on and how many were taken, never when the next one is.
    shotsActive: T.tracking && !T.paused && !T.manualPaused,
    shotsToday: T.shotsToday,
    sitesToday: T.sitesToday,
    aiToday: T.aiToday,
    error: T.lastErr,
    baseUrl: baseUrl()
  });
}

// ---- IPC -----------------------------------------------------------------
ipcMain.handle('login', async (_e, { email, password }) => {
  const body = await apiPost({ action: 'login', email, password });
  cfg.deviceToken = body.deviceToken; cfg.empId = body.empId; cfg.name = body.name; cfg.mustChange = !!body.mustChange;
  applySettings(body.settings);   // obey the company's screenshot/idle settings
  saveConfig(cfg);
  pushState();
  return { ok: true, name: body.name, mustChange: !!body.mustChange };
});
ipcMain.handle('projects', async () => {
  try {
    const body = await apiPost({ action: 'projects', deviceToken: cfg.deviceToken });
    return body.projects || [];
  } catch (e) { return []; }
});
ipcMain.handle('start', async (_e, { project }) => { startTracking(project); return { ok: true }; });
ipcMain.handle('pause', async () => { pauseTracking(); return { ok: true }; });
ipcMain.handle('resume', async () => { resumeTracking(); return { ok: true }; });
ipcMain.handle('stop', async () => { await stopTracking(); return { ok: true }; });
ipcMain.handle('logout', async () => {
  await stopTracking();
  cfg.deviceToken = null; cfg.name = ''; cfg.empId = ''; cfg.mustChange = false; cfg.cloud = null;
  saveConfig(cfg); pushState(); return { ok: true };
});
ipcMain.handle('getState', async () => { pushState(); return { ok: true }; });
ipcMain.handle('openExternal', async (_e, url) => { try { await shell.openExternal(url); } catch (e) {} });

// ---- app lifecycle -------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
  app.whenReady().then(() => {
    cfg = loadConfig();
    T.project = cfg.lastProject || '';
    T.todayKey = localDayKey();
    createWindow();
    try { createTray(); } catch (e) {}
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else if (win) win.show(); });
  });
  app.on('window-all-closed', (e) => { /* stay alive in tray */ });
  app.on('before-quit', () => { app.isQuitting = true; });
}
