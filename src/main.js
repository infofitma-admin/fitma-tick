'use strict';
/*
 * Fitma Tick — main process.
 * Tracks active work time + activity, takes periodic screenshots, and uploads
 * everything to the Fitma Workspace (the same Apps Script backend the portal uses).
 * Backend actions used:  login | ingest | screenshot | projects
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, powerMonitor, desktopCapturer, screen, nativeImage, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

// ---- config --------------------------------------------------------------
const DEFAULT_BASE_URL = 'https://script.google.com/macros/s/AKfycbzig98s-ZzuHELem-krcoma0AtcNHIxRCVKIK0LGjTex7eYKiosnRtLeFR32lPedTI/exec';
const IDLE_LIMIT_S = 300;        // auto-pause after 5 min of no input
const ACTIVE_IF_IDLE_UNDER = 10; // a 1-second sample counts as "active" if last input was within 10s
const FLUSH_MS = 60 * 1000;      // push the running segment every minute (so nothing is lost)
const SHOT_MIN_MS = 9 * 60 * 1000;   // screenshot cadence ~10 min (jittered 9–12)
const SHOT_MAX_MS = 12 * 60 * 1000;
const SHOT_MAX_WIDTH = 1600;     // downscale screenshots to keep uploads small

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'fitma-tick.json');
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf8')); } catch (e) { return {}; }
}
function saveConfig(cfg) {
  try { fs.writeFileSync(CONFIG_PATH(), JSON.stringify(cfg, null, 2)); } catch (e) {}
}
let cfg = {};
function baseUrl() { return (cfg.baseUrl || DEFAULT_BASE_URL); }

// ---- backend client ------------------------------------------------------
async function apiPost(payload) {
  const res = await fetch(baseUrl(), {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { throw new Error('Unexpected reply from the server.'); }
  // backend wraps as { status, body }
  if (parsed && typeof parsed.status === 'number') {
    if (parsed.status >= 200 && parsed.status < 300) return parsed.body;
    throw new Error((parsed.body && parsed.body.error) || ('Server error ' + parsed.status));
  }
  return parsed;
}

// ---- tracking state ------------------------------------------------------
const T = {
  tracking: false,
  paused: false,          // auto-paused due to idle
  project: '',
  segStart: 0,            // ms, start of the current un-flushed active segment (0 = none open)
  todaySec: 0,            // active seconds logged today (local calendar day)
  todayKey: '',
  activeSamples: 0,       // for activity% over the current screenshot window
  totalSamples: 0,
  lastShot: 0,
  nextShotAt: 0,
  flushTimer: null,
  tickTimer: null,
  lastErr: ''
};

function localDayKey(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function rollDayIfNeeded() {
  const k = localDayKey();
  if (T.todayKey !== k) { T.todayKey = k; T.todaySec = 0; }
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
  } catch (e) {
    T.lastErr = 'Screenshot: ' + (e.message || e);
  } finally {
    // reset the activity window after each screenshot, like WebWork intervals
    T.activeSamples = 0; T.totalSamples = 0;
    scheduleNextShot();
  }
}
function scheduleNextShot() {
  const jitter = SHOT_MIN_MS + Math.random() * (SHOT_MAX_MS - SHOT_MIN_MS);
  T.nextShotAt = Date.now() + jitter;
}

// ---- the per-second tick -------------------------------------------------
function tick() {
  if (!T.tracking) return;
  rollDayIfNeeded();
  const idle = powerMonitor.getSystemIdleTime(); // seconds since last input

  if (idle >= IDLE_LIMIT_S) {
    // user went idle: close the segment at the moment idle began, then pause
    if (!T.paused && T.segStart) {
      const idleStartMs = Date.now() - idle * 1000;
      flushSegment(Math.max(T.segStart, idleStartMs));
    }
    T.paused = true;
  } else {
    if (T.paused) {
      // user is back: resume with a fresh segment
      T.paused = false;
      T.segStart = Date.now();
    }
    // count this active second
    T.todaySec += 1;
    T.totalSamples += 1;
    if (idle < ACTIVE_IF_IDLE_UNDER) T.activeSamples += 1;
    // time for a screenshot?
    if (T.nextShotAt && Date.now() >= T.nextShotAt) {
      T.nextShotAt = 0; // guard against double-fire while capturing
      captureAndUpload();
    }
  }
  pushState();
}

// ---- start / stop --------------------------------------------------------
function startTracking(project) {
  if (T.tracking) return;
  rollDayIfNeeded();
  T.tracking = true; T.paused = false;
  T.project = project || T.project || '';
  T.segStart = Date.now();
  T.activeSamples = 0; T.totalSamples = 0;
  scheduleNextShot();
  T.flushTimer = setInterval(() => { if (T.tracking && !T.paused && T.segStart) flushSegment(Date.now()); }, FLUSH_MS);
  T.tickTimer = setInterval(tick, 1000);
  cfg.lastProject = T.project; saveConfig(cfg);
  updateTray(); pushState();
}
async function stopTracking() {
  if (!T.tracking) return;
  clearInterval(T.flushTimer); clearInterval(T.tickTimer);
  T.flushTimer = T.tickTimer = null;
  const wasOpen = T.segStart;
  T.tracking = false; T.paused = false;
  if (wasOpen) await flushSegment(Date.now());
  T.segStart = 0;
  updateTray(); pushState();
}

// ---- window + tray -------------------------------------------------------
let win = null, tray = null;
function createWindow() {
  win = new BrowserWindow({
    width: 760, height: 600, minWidth: 420, minHeight: 520,
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
  const menu = Menu.buildFromTemplate([
    { label: T.tracking ? (T.paused ? 'Paused (idle)' : 'Tracking…') : 'Not tracking', enabled: false },
    { type: 'separator' },
    { label: 'Open Fitma Tick', click: () => { if (win) { win.show(); win.focus(); } } },
    T.tracking
      ? { label: 'Stop', click: () => stopTracking() }
      : { label: 'Start', click: () => { if (cfg.deviceToken && T.project) startTracking(); else { if (win) { win.show(); win.focus(); } } } },
    { type: 'separator' },
    { label: 'Quit Fitma Tick', click: async () => { app.isQuitting = true; await stopTracking(); app.quit(); } }
  ]);
  tray.setToolTip('Fitma Tick' + (T.tracking ? (T.paused ? ' — paused' : ' — tracking') : ''));
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
    paused: T.paused,
    project: T.project,
    todaySec: T.todaySec,
    activity: activity,
    lastShot: T.lastShot,
    nextShotAt: T.nextShotAt,
    error: T.lastErr,
    baseUrl: baseUrl()
  });
}

// ---- IPC -----------------------------------------------------------------
ipcMain.handle('login', async (_e, { email, password }) => {
  const body = await apiPost({ action: 'login', email, password });
  cfg.deviceToken = body.deviceToken; cfg.empId = body.empId; cfg.name = body.name; cfg.mustChange = !!body.mustChange;
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
ipcMain.handle('stop', async () => { await stopTracking(); return { ok: true }; });
ipcMain.handle('logout', async () => {
  await stopTracking();
  cfg.deviceToken = null; cfg.name = ''; cfg.empId = ''; cfg.mustChange = false;
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
