'use strict';
const $ = (id) => document.getElementById(id);

function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function fmtTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12;
  return h + ':' + m + ' ' + ap;
}
function relFuture(ms) {
  if (!ms) return '—';
  const diff = Math.round((ms - Date.now()) / 1000);
  if (diff <= 0) return 'any moment';
  if (diff < 60) return 'in ' + diff + 's';
  return 'in ' + Math.round(diff / 60) + ' min';
}

let state = {};
let projectsLoaded = false;

// ---- login ----
$('pw-eye').addEventListener('click', () => {
  const inp = $('password');
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  $('pw-eye').textContent = show ? 'hide' : 'show';
});
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('login-btn'); const err = $('login-err');
  err.hidden = true; btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    await window.tick.login($('email').value.trim(), $('password').value);
    $('password').value = '';
  } catch (ex) {
    err.textContent = ex.message || 'Could not sign in.'; err.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'Sign in';
  }
});

// ---- tracker ----
$('logout').addEventListener('click', async () => {
  if (state.tracking && !confirm('Stop tracking and sign out?')) return;
  projectsLoaded = false;
  await window.tick.logout();
});
$('toggle').addEventListener('click', async () => {
  const err = $('track-err'); err.hidden = true;
  if (state.tracking) {
    await window.tick.stop();
  } else {
    const project = $('project').value;
    if (!project) { err.textContent = 'Pick a project first.'; err.hidden = false; return; }
    await window.tick.start(project);
  }
});

async function loadProjects() {
  const sel = $('project');
  const list = await window.tick.projects();
  const cur = state.project || '';
  sel.innerHTML = '';
  if (!list.length) {
    const o = document.createElement('option'); o.value = ''; o.textContent = 'No projects assigned — pick “General work”'; sel.appendChild(o);
    const g = document.createElement('option'); g.value = 'General work'; g.textContent = 'General work'; sel.appendChild(g);
  } else {
    list.forEach(p => {
      const o = document.createElement('option'); o.value = p.name; o.textContent = p.name; sel.appendChild(o);
    });
    const g = document.createElement('option'); g.value = 'General work'; g.textContent = 'General work'; sel.appendChild(g);
  }
  if (cur) sel.value = cur;
  projectsLoaded = true;
}

function render() {
  const onLogin = !state.signedIn;
  $('view-login').hidden = !onLogin;
  $('view-track').hidden = onLogin;
  if (onLogin) return;

  $('who-name').textContent = state.name || '';
  if (!projectsLoaded) loadProjects();

  const pill = $('status-pill');
  if (state.tracking && state.paused) { pill.className = 'pill paused'; pill.textContent = 'Paused — you’re idle'; }
  else if (state.tracking) { pill.className = 'pill on'; pill.textContent = 'Tracking'; }
  else { pill.className = 'pill off'; pill.textContent = 'Not tracking'; }

  $('clock').textContent = fmtClock(state.todaySec || 0);

  const toggle = $('toggle');
  toggle.textContent = state.tracking ? 'Stop' : 'Start';
  toggle.className = 'btn big ' + (state.tracking ? 'stop' : 'primary');
  $('project').disabled = state.tracking;

  $('activity').textContent = state.tracking ? ((state.activity || 0) + '%') : '—';
  $('lastshot').textContent = fmtTime(state.lastShot);
  $('nextshot').textContent = state.tracking && !state.paused ? relFuture(state.nextShotAt) : '—';

  const err = $('track-err');
  if (state.error) { err.textContent = state.error; err.hidden = false; } else { err.hidden = true; }
}

window.tick.onState((s) => { state = s; render(); });

// local 1s repaint so the clock ticks smoothly even between main-process pushes
setInterval(() => { if (state.signedIn) render(); }, 1000);

window.tick.getState();
