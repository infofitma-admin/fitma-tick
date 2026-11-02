'use strict';
const $ = (id) => document.getElementById(id);

function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
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
  const btn = $('login-btn'); const err = $('login-err'); const hero = $('login-vora');
  err.hidden = true; btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    await window.tick.login($('email').value.trim(), $('password').value);
    $('password').value = '';
    hero.src = '../assets/icon.png';
  } catch (ex) {
    err.textContent = ex.message || 'Could not sign in.'; err.hidden = false;
    hero.src = '../assets/vora-error.png';          // Vora reacts to a failed sign-in
  } finally {
    btn.disabled = false; btn.textContent = 'Sign in';
  }
});

// ---- tracker actions ----
$('logout').addEventListener('click', async () => {
  if (state.tracking && !confirm('Stop tracking and sign out?')) return;
  projectsLoaded = false;
  await window.tick.logout();
});

function wireActions() {
  // delegated: buttons are rebuilt per state
  $('actions').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const err = $('track-err'); err.hidden = true;
    if (b.dataset.act === 'start') {
      const project = $('project').value;
      if (!project) { err.textContent = 'Pick a project first.'; err.hidden = false; return; }
      await window.tick.start(project);
    } else if (b.dataset.act === 'pause') {
      await window.tick.pause();
    } else if (b.dataset.act === 'resume') {
      await window.tick.resume();
    } else if (b.dataset.act === 'stop') {
      await window.tick.stop();
    }
  });
}

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

// current "mode": ready | tracking | paused (manual) | away (idle) | error
function mode() {
  if (state.error) return 'error';
  if (!state.tracking) return 'ready';
  if (state.manualPaused) return 'paused';
  if (state.paused) return 'away';
  return 'tracking';
}

function renderActions(m) {
  const box = $('actions');
  if (!state.tracking) {
    box.innerHTML = '<button class="btn primary big" data-act="start">Start tracking</button>';
  } else if (m === 'paused') {
    box.innerHTML = '<button class="btn resume big" data-act="resume">End break</button>' +
                    '<button class="btn stop big" data-act="stop">Stop</button>';
  } else {
    box.innerHTML = '<button class="btn pause big" data-act="pause">Break</button>' +
                    '<button class="btn stop big" data-act="stop">Stop</button>';
  }
}

function render() {
  const onLogin = !state.signedIn;
  $('view-login').hidden = !onLogin;
  $('view-track').hidden = onLogin;
  if (onLogin) return;

  $('who-name').textContent = state.name || '';
  if (!projectsLoaded) loadProjects();

  const m = mode();

  // status pill + dot
  const pill = $('status-pill'); const dot = $('status-dot');
  if (m === 'tracking') { pill.className = 'pill on'; pill.textContent = 'Tracking'; dot.className = 'status-dot on'; }
  else if (m === 'paused') { pill.className = 'pill paused'; pill.textContent = 'On break'; dot.className = 'status-dot paused'; }
  else if (m === 'away') { pill.className = 'pill paused'; pill.textContent = 'Away — you’re idle'; dot.className = 'status-dot paused'; }
  else { pill.className = 'pill off'; pill.textContent = 'Ready to track'; dot.className = 'status-dot off'; }

  $('clock').textContent = fmtClock(state.todaySec || 0);

  renderActions(m);
  $('project').disabled = state.tracking;

  // pause hint
  const ph = $('pausehint');
  if (m === 'paused') { ph.textContent = 'On break — your time, screenshots and activity are paused. Press End break when you’re back.'; ph.hidden = false; }
  else if (m === 'away') { ph.textContent = 'You’ve been idle, so tracking paused automatically. Move the mouse to continue.'; ph.hidden = false; }
  else { ph.hidden = true; }

  // activity meter
  const act = state.tracking ? (state.activity || 0) : 0;
  $('activity').textContent = state.tracking ? (act + '%') : '—';
  $('activity-bar').style.width = act + '%';

  // screenshots: count only — timing is intentionally hidden (anti-cheat)
  $('shots').textContent = state.shotsToday || 0;
  const sitesEl = $('sites');
  if (sitesEl) sitesEl.textContent = (state.sitesToday || 0) + (state.aiToday ? (' · ' + state.aiToday + ' AI') : '');
  $('cap-state').textContent = state.shotsActive ? 'On' : 'Off';

  const err = $('track-err');
  if (state.error) { err.textContent = state.error; err.hidden = false; } else { err.hidden = true; }

  // Reactive Vora:
  //   error -> wrench   | tracking -> check   | ready / paused / away -> friendly idle
  const vs = $('vora-state');
  if (vs) {
    const want = (m === 'error') ? 'error' : (m === 'tracking') ? 'success' : 'empty';
    if (vs.dataset.s !== want) { vs.dataset.s = want; vs.src = '../assets/vora-' + want + '.png'; }
    // rest/dim Vora when paused or away so "idle" reads at a glance
    vs.classList.toggle('resting', m === 'paused' || m === 'away');
  }
}

wireActions();
window.tick.onState((s) => { state = s; render(); });

// local 1s repaint so the clock ticks smoothly even between main-process pushes
setInterval(() => { if (state.signedIn) render(); }, 1000);

window.tick.getState();
