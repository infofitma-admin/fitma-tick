'use strict';
/*
 * Fitma Tick — active app / website capture (WebWork-style agent capture).
 *
 * Reads the FOREGROUND window the employee is looking at: the app name, the
 * window title, and — where the operating system exposes it — the browser URL.
 * No browser extension is required and nothing here can break tracking: every
 * path is wrapped and a failure simply yields null (we just skip that sample).
 *
 * Windows : PowerShell (foreground window title + process; best-effort URL via UI Automation for Chrome/Edge)
 * macOS   : osascript (frontmost app; active tab URL + title for common browsers)
 * Linux   : xdotool / xprop (best-effort)
 */
const { execFile } = require('child_process');

function run(cmd, args, opts) {
  return new Promise((resolve) => {
    let done = false;
    const to = (opts && opts.timeout) || 4000;
    const child = execFile(cmd, args, { timeout: to, windowsHide: true, maxBuffer: 1 << 20 }, (err, stdout) => {
      if (done) return; done = true;
      resolve(err ? '' : String(stdout || ''));
    });
    child.on('error', () => { if (!done) { done = true; resolve(''); } });
  });
}

// ---- which hosts / apps count as "AI" (flagged for the admin) -------------
const AI_PATTERNS = [
  'chatgpt', 'chat.openai', 'openai.com', 'claude.ai', 'anthropic',
  'gemini.google', 'bard.google', 'copilot', 'perplexity', 'poe.com',
  'deepseek', 'grok', 'x.ai', 'midjourney', 'character.ai', 'huggingface',
  'notion.so/ai', 'jasper.ai', 'quillbot', 'writesonic', 'you.com',
  'mistral.ai', 'phind.com', 'ora.ai', 'leonardo.ai', 'runwayml', 'elevenlabs'
];
function isAI(text) {
  const t = String(text || '').toLowerCase();
  return AI_PATTERNS.some(p => t.indexOf(p) >= 0);
}

const BROWSERS = ['chrome', 'msedge', 'edge', 'firefox', 'brave', 'opera', 'vivaldi', 'safari', 'arc'];
function looksLikeBrowser(app) {
  const a = String(app || '').toLowerCase();
  return BROWSERS.some(b => a.indexOf(b) >= 0);
}

// Pull a hostname out of a URL, or guess a clickable target from a window title.
function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
}

// ---- Windows --------------------------------------------------------------
const PS_FG = [
  '$ErrorActionPreference="SilentlyContinue";',
  'Add-Type @"',
  'using System;using System.Runtime.InteropServices;using System.Text;',
  'public class FgWin{',
  '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
  '[DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);',
  '[DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h,out int pid);',
  '}',
  '"@;',
  '$h=[FgWin]::GetForegroundWindow();',
  '$sb=New-Object System.Text.StringBuilder 1024;',
  '[FgWin]::GetWindowText($h,$sb,1024) | Out-Null;',
  '$p=0;[FgWin]::GetWindowThreadProcessId($h,[ref]$p) | Out-Null;',
  '$pn="";try{$pn=(Get-Process -Id $p).ProcessName}catch{};',
  'Write-Output ($pn + "|~|" + $sb.ToString())'
].join('');

// Best-effort URL read for Chrome/Edge via UI Automation (time-boxed).
const PS_URL = [
  '$ErrorActionPreference="SilentlyContinue";',
  'Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes;',
  'Add-Type @"',
  'using System;using System.Runtime.InteropServices;',
  'public class FgW2{ [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); }',
  '"@;',
  '$h=[FgW2]::GetForegroundWindow();',
  '$root=[System.Windows.Automation.AutomationElement]::FromHandle($h);',
  'if($root -ne $null){',
  ' $c=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit);',
  ' $e=$root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$c);',
  ' if($e -ne $null){ $v=$e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern); if($v -ne $null){ Write-Output $v.Current.Value } }',
  '}'
].join('');

async function captureWindows() {
  const raw = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', PS_FG], { timeout: 4000 });
  if (!raw) return null;
  const parts = raw.trim().split('|~|');
  const app = (parts[0] || '').trim();
  const title = (parts[1] || '').trim();
  if (!app && !title) return null;
  let url = '';
  if (looksLikeBrowser(app)) {
    const u = (await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', PS_URL], { timeout: 1800 })).trim();
    if (/^https?:\/\//i.test(u) || /^[\w-]+\.[\w.-]+\//.test(u)) {
      url = /^https?:/i.test(u) ? u : ('https://' + u);
    }
  }
  return { app, title, url };
}

// ---- macOS ----------------------------------------------------------------
const OSA = [
  'set a to ""',
  'set t to ""',
  'set u to ""',
  'tell application "System Events" to set a to name of first application process whose frontmost is true',
  'if a is in {"Google Chrome", "Google Chrome Canary", "Brave Browser", "Microsoft Edge", "Vivaldi", "Opera", "Arc"} then',
  '  tell application a to set u to URL of active tab of front window',
  '  tell application a to set t to title of active tab of front window',
  'else if a is "Safari" then',
  '  tell application "Safari" to set u to URL of front document',
  '  tell application "Safari" to set t to name of front document',
  'else',
  '  try',
  '    tell application "System Events" to tell process a to set t to name of front window',
  '  end try',
  'end if',
  'return a & "|~|" & t & "|~|" & u'
].map(l => ['-e', l]).reduce((acc, p) => acc.concat(p), []);

async function captureMac() {
  const raw = await run('osascript', OSA, { timeout: 4000 });
  if (!raw) return null;
  const p = raw.trim().split('|~|');
  const app = (p[0] || '').trim();
  let title = (p[1] || '').trim();
  const url = (p[2] || '').trim();
  if (!app) return null;
  if (!title && url) title = url;
  return { app, title, url: /^https?:/i.test(url) ? url : '' };
}

// ---- Linux ----------------------------------------------------------------
async function captureLinux() {
  const id = (await run('xdotool', ['getactivewindow'], { timeout: 2500 })).trim();
  if (!id) return null;
  const title = (await run('xdotool', ['getwindowname', id], { timeout: 2500 })).trim();
  let app = '';
  const wmc = (await run('xprop', ['-id', id, 'WM_CLASS'], { timeout: 2500 }));
  const m = wmc.match(/"([^"]+)"\s*$/);
  if (m) app = m[1];
  if (!app && !title) return null;
  return { app, title, url: '' };
}

// ---- public ---------------------------------------------------------------
async function captureActive() {
  try {
    let r = null;
    if (process.platform === 'win32') r = await captureWindows();
    else if (process.platform === 'darwin') r = await captureMac();
    else r = await captureLinux();
    if (!r) return null;
    r.app = (r.app || '').slice(0, 120);
    r.title = (r.title || '').slice(0, 300);
    r.url = (r.url || '').slice(0, 500);
    r.ai = isAI(r.url) || isAI(r.title) || isAI(r.app);
    r.host = hostFromUrl(r.url);
    return r;
  } catch (e) { return null; }
}

module.exports = { captureActive, isAI };
