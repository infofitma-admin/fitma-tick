(function(){try{var css=`.app{transition:grid-template-columns .18s ease}
.rail-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-inline:8px}
.rail-toggle{flex:none;display:flex;align-items:center;justify-content:center;width:30px;height:30px;border:0;border-radius:8px;background:rgba(255,255,255,.07);color:var(--on-navy-muted);cursor:pointer}
.rail-toggle:hover{color:var(--on-navy);background:rgba(255,255,255,.16)}
.nav button .lbl{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nav button.on{box-shadow:inset 3px 0 0 var(--steel)}
.rail-foot .btn{display:flex;align-items:center;gap:9px;justify-content:flex-start}
.app.rail-collapsed{grid-template-columns:76px minmax(0,1fr)}
.rail-collapsed .rail{padding-inline:12px}
.rail-collapsed .rail-head{justify-content:center}
.rail-collapsed .rail-head .brandline{display:none}
.rail-collapsed .nav .label{display:none}
.rail-collapsed .nav button{justify-content:center;padding-inline:0}
.rail-collapsed .nav button .lbl{display:none}
.rail-collapsed .nav button .badge{position:absolute;top:3px;right:8px;margin:0}
.rail-collapsed .rail-foot .sync{display:none}
.rail-collapsed .rail-foot .me .grow{display:none}
.rail-collapsed .rail-foot .me{justify-content:center}
.rail-collapsed .rail-foot .btn{justify-content:center;padding-inline:0}
.rail-collapsed .rail-foot .btn .lbl{display:none}
.voro-load{width:92px;margin:0 auto 4px;display:block}
.voro-load svg{width:100%;height:auto;display:block}
.wrap{gap:22px}

.main{padding-block:30px 72px}
html,body{margin:0;padding:0}
.auth-art{margin:0;border:0}
.ring.small .rv b{font-size:15px;letter-spacing:-.01em}
.ring.small .rv span{font-size:7px}
.pp{overflow:visible}
.pulse{display:grid;gap:14px;grid-template-columns:repeat(3,minmax(0,1fr))}
.pp .ring.small{flex:none}
@media (max-width:980px){.pulse{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:640px){.pulse{grid-template-columns:1fr}}
.loading{min-height:100vh;min-height:100dvh;display:grid;place-items:center;gap:10px;background:var(--navy);color:var(--on-navy)}
.loading p{color:var(--on-navy-muted);font-size:13px;margin:0;letter-spacing:.02em}
.voro-load{width:120px;height:auto;margin:0 auto}
.qcard{display:flex;align-items:center;gap:16px;background:linear-gradient(120deg,var(--brand-soft),var(--surface));border:1px solid var(--line);border-radius:var(--r);padding:16px 20px;margin-bottom:18px}
.qcard img{width:64px;height:64px;object-fit:contain;flex:none}
.qcard .qt{font-family:var(--display);font-size:24px;line-height:1.4;color:var(--ink)}
@media(max-width:620px){.qcard .qt{font-size:20px}}
.pboard{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
@media(max-width:900px){.pboard{grid-template-columns:1fr}}
.pcol{background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r);padding:12px}
.pcol-head{display:flex;align-items:center;justify-content:space-between;margin:2px 4px 10px;font-size:11.5px;font-weight:700;letter-spacing:.04em;color:var(--muted);text-transform:uppercase}
.pcol-head .n{background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:1px 9px;font-size:11px}
.pcard2{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--brand);border-radius:10px;padding:11px 12px;margin-bottom:9px;cursor:pointer;transition:transform .12s,box-shadow .12s}
.pcard2:hover{box-shadow:0 6px 16px rgba(40,53,68,.12);transform:translateY(-1px)}
.pcard2:last-child{margin-bottom:0}
.pcard2 b{display:block;font-size:13.5px;line-height:1.3}
.pcard2 .meta{display:flex;align-items:center;gap:8px;margin-top:9px;flex-wrap:wrap}
.pcol .empty{color:var(--muted);font-size:12px;text-align:center;padding:12px 6px;opacity:.7}`;var s=document.createElement('style');s.setAttribute('data-fitma','delta');s.textContent=css;document.head.appendChild(s);}catch(e){}})();

// Fitma Workspace engine — shared by the browser app (workspace/index.html)
// and the daily Fitma Tick sync (netlify/functions). Pure JavaScript, no dependencies.
// All dates are Sri Lanka local dates (Asia/Colombo, UTC+05:30, no daylight saving).

const MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const PLAN_LABEL = {std4:'4 hours · Mon–Fri', std3:'3 hours · Mon–Fri', founder:'Flexible · Founder', unset:'Schedule not set'};
const W = {punctuality:.25, completion:.15, attendance:.20, hours:.15, delivery:.25};
const OT_MIN = 30; // minutes of work beyond the schedule before it counts as overtime
const TZ_OFFSET_MIN = 330; // Asia/Colombo

// Shared, mutable data the scoring reads. The app and the sync both fill this.
const state = { DAYS:{}, TASKLIST:[], DATA_END:new Date(), HOLIDAYS:new Set() };

// ---------- dates ----------
const pad = n => String(n).padStart(2,'0');
const key = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y,m,d] = k.split('-').map(Number); return new Date(y,m-1,d); };
const monthLabel = ym => { const [y,m]=ym.split('-').map(Number); return `${MN[m-1]} ${y}`; };
const daysIn = ym => { const [y,m]=ym.split('-').map(Number); return new Date(y,m,0).getDate(); };
const dateOf = (ym,dd) => { const [y,m]=ym.split('-').map(Number); return new Date(y,m-1,dd); };
const fmtT = m => { const h=Math.floor(m/60)%24, mm=Math.round(m%60); return `${((h+11)%12)+1}:${pad(mm)} ${h<12?'AM':'PM'}`; };
const fmtH = m => { m=Math.round(m); const h=Math.floor(m/60), mm=m%60; return mm? `${h}h ${mm}m` : `${h}h`; };
const fmtD = d => `${DN[d.getDay()]} ${d.getDate()} ${MN[d.getMonth()].slice(0,3)}`;
const unlockDate = ym => { const [y,m]=ym.split('-').map(Number); return new Date(y,m,1); };
function monthsBetween(fromYm, toYm){ const out=[]; let [y,m]=fromYm.split('-').map(Number); const [ty,tm]=toYm.split('-').map(Number);
  while (y<ty || (y===ty && m<=tm)){ out.push(`${y}-${pad(m)}`); m++; if(m>12){m=1;y++;} } return out; }
// "Now" in Sri Lanka as a local-calendar Date (works on a UTC server too)
function colomboNow(){ const u = new Date(Date.now() + TZ_OFFSET_MIN*60000); return new Date(u.getUTCFullYear(),u.getUTCMonth(),u.getUTCDate(),u.getUTCHours(),u.getUTCMinutes()); }

// ---------- schedules ----------
// minutes from midnight. Friday follows the Jummah schedule by gender.
function shiftsFor(emp, d){
  if (!emp || emp.plan==='founder' || emp.plan==='unset' || !emp.plan) return null;
  if (state.HOLIDAYS.has(key(d))) return [];
  const dow = d.getDay();
  if (dow===0 || dow===6) return [];
  if (dow===5){
    if (emp.gender==='F') return [[540,690],[960,1050]];                          // 9:00–11:30, 4:00–5:30
    return emp.plan==='std4' ? [[540,660],[960,1080]] : [[540,660],[960,1020]];   // 9–11 + 4–6 / 4–5
  }
  return emp.plan==='std4' ? [[540,720],[780,840]] : [[540,720]];                 // 9–12 (+ 1–2)
}
const isScored = emp => emp && (emp.plan==='std4' || emp.plan==='std3');

// ---------- build a member's month from real Fitma Tick time entries ----------
// entriesByDate: { 'YYYY-MM-DD': [ {start_time, end_time, track_type, ...} ] } for this member
const NOT_WORK = new Set(['Idle time','Paid leave','Paid break','Paid holiday']);
function toMinutes(iso, dayKey){
  const [y,m,d] = dayKey.split('-').map(Number);
  const midnightUtc = Date.UTC(y,m-1,d) - TZ_OFFSET_MIN*60000;
  return Math.max(0, Math.min(1440, (Date.parse(iso) - midnightUtc)/60000));
}
function buildMonth(emp, ym, entriesByDate, dataEnd, opts={}){
  const days = {}; const n = daysIn(ym); const leaves = [];
  for (let dd=1; dd<=n; dd++){
    const d = dateOf(ym,dd), k = key(d), sh = shiftsFor(emp,d);
    if (d > dataEnd){ days[k] = {status:'future', sessions:[], shifts: sh||[]}; continue; }
    if (opts.from && k < opts.from){ days[k] = {status:'nodata', sessions:[], shifts:[]}; continue; }
    const raw = entriesByDate[k] || [];
    const paidLeave = raw.some(e=>e.track_type==='Paid leave');
    const holiday = raw.some(e=>e.track_type==='Paid holiday');
    // merge work entries into sessions (gaps of 2 min or less join up)
    const iv = raw.filter(e=>!NOT_WORK.has(e.track_type) && e.start_time && e.end_time)
      .map(e=>({in:toMinutes(e.start_time,k), out:toMinutes(e.end_time,k)})).filter(x=>x.out>x.in).sort((a,b)=>a.in-b.in);
    const merged = []; for (const x of iv){ const last=merged[merged.length-1]; if (last && x.in<=last.out+2) last.out=Math.max(last.out,x.out); else merged.push({...x}); }
    const round = x => ({in:Math.round(x.in), out:Math.round(x.out)});
    if (sh===null){ days[k] = {status: merged.length?'flex':'off', sessions: merged.map(x=>({...round(x),kind:'flex'})), shifts:[]}; continue; }
    if (!sh.length || holiday){ days[k] = {status:'weekend', sessions: merged.map(x=>({...round(x),kind:'extra'})), shifts:[], holiday:holiday||state.HOLIDAYS.has(k)}; continue; }
    if (!merged.length){
      const lost = sh.reduce((a,[s,e])=>a+e-s,0);
      days[k] = {status:'leave', sessions:[], shifts:sh, reason: paidLeave?'Approved leave':'No time tracked', lost, covered:0};
      leaves.push(k); continue;
    }
    // A session belongs to every shift it overlaps (one long session can cover both shifts).
    // Times are clipped at the neighbouring shifts so a long session doesn't count twice.
    const used = new Set(); let anyLate=false, anyEarly=false; const sessions=[];
    let lastOut = 0;
    sh.forEach(([s,e],j)=>{
      const nextStart = j<sh.length-1 ? sh[j+1][0] : 1440;
      const mine = merged.filter(x=>x.out > s && x.in < e);
      merged.forEach((x,i)=>{ if (mine.includes(x)) used.add(i); });
      if (!mine.length){ anyEarly=true; sessions.push({in:s,out:s,s,e,late:0,early:e-s,ot:0,kind:'shift',missed:true}); return; }
      const inn = Math.max(lastOut, Math.min(...mine.map(x=>x.in))), out = Math.min(nextStart, Math.max(...mine.map(x=>x.out))); lastOut = out;
      const late = Math.max(0, Math.round(inn - s)), early = Math.max(0, Math.round(e - out)), ot = Math.max(0, Math.round(out - e));
      anyLate = anyLate || late>0; anyEarly = anyEarly || early>0;
      sessions.push({in:Math.round(inn), out:Math.round(out), s, e, late, early, ot, kind:'shift'});
    });
    merged.forEach((x,i)=>{ if(!used.has(i)) sessions.push({...round(x), kind:'extra'}); });
    sessions.sort((a,b)=>a.in-b.in);
    days[k] = {status: anyLate&&anyEarly?'lateearly':anyLate?'late':anyEarly?'early':'ontime', sessions, shifts:sh};
  }
  applyCover(days, leaves);
  return days;
}
// Time worked outside scheduled shifts (extra sessions, and staying 15+ min past a shift)
// after a leave day is counted as making that leave up.
function applyCover(days, leaves){
  for (const lk of leaves){
    const L = days[lk]; let need = L.lost;
    for (const k of Object.keys(days).filter(k=>k>lk).sort()){
      if (need<=0) break;
      for (const s of days[k].sessions){
        if (need<=0) break;
        if (s.kind==='extra'){ const len=s.out-s.in; const take=Math.min(len,need); s.kind='makeup'; s.cover=lk; L.covered+=take; need-=take; }
        else if (s.kind==='shift' && s.ot>=15){ const avail=s.ot-(s.otUsed||0); const take=Math.min(avail,need); if(take>0){ s.otUsed=(s.otUsed||0)+take; L.covered+=take; need-=take; } }
      }
    }
    L.covered = Math.min(L.covered, L.lost);
    if (L.covered >= L.lost) L.status='covered';
  }
}

// ---------- tasks from Fitma Tick ----------
// returns {emp, ym, project, title, assigned, due, done, status} with Date objects
function taskStatus(t, dataEnd){
  if (t.done) return (t.due && t.done > t.due) ? 'late' : 'ontime';
  if (t.due && t.due <= dataEnd) return 'overdue';
  if (t.started || (t.assigned && t.assigned <= dataEnd)) return 'progress';
  return 'todo';
}

// ---------- metrics & scoring ----------
function metrics(emp, ym){
  const DATA_END = state.DATA_END; const n = daysIn(ym);
  const m = {working:0,present:0,leave:0,lostMin:0,coverMin:0,lateCount:0,lateMin:0,earlyCount:0,earlyMin:0,starts:0,requiredMin:0,trackedMin:0,overtimeMin:0,days:[],reasons:[]};
  const mine = state.DAYS[emp.id] || {};
  for (let dd=1; dd<=n; dd++){
    const d = dateOf(ym,dd), k = key(d);
    const day = mine[k] || {status: d>DATA_END?'future':(shiftsFor(emp,d)===null?'off':'weekend'), sessions:[], shifts:[]};
    m.days.push({d,k,...day});
    if (day.status==='future') continue;
    m.trackedMin += day.sessions.reduce((a,s)=>a+(s.out-s.in),0);
    if (!isScored(emp)){ if (day.sessions.length) m.present++; continue; }
    if (!day.shifts || !day.shifts.length){
      // scored member on a non-working day (weekend/off): extra work counts as OT only if it totals 30+ min
      let b0=0; day.sessions.forEach(s=>{ if (s.kind==='extra') b0 += s.out-s.in; });
      if (b0>=OT_MIN) m.overtimeMin += b0;
      continue;
    }
    m.working++; m.requiredMin += day.shifts.reduce((a,[s,e])=>a+e-s,0);
    if (day.status==='leave'||day.status==='covered'){ m.leave++; m.lostMin+=day.lost; m.coverMin+=day.covered; m.reasons.push(day.reason); continue; }
    m.present++;
    day.sessions.filter(s=>s.kind==='shift').forEach(s=>{ m.starts++;
      if (s.late){ m.lateCount++; m.lateMin+=s.late; }
      if (s.early){ m.earlyCount++; m.earlyMin+=s.early; } });
    // overtime: work beyond the schedule (extra sessions + staying past a shift), credited only when it totals 30+ min that day
    let beyond=0;
    day.sessions.forEach(s=>{ if (s.kind==='extra') beyond += s.out-s.in; });
    day.sessions.filter(s=>s.kind==='shift').forEach(s=>{ const ot=(s.ot||0)-(s.otUsed||0); if(ot>0) beyond+=ot; });
    if (beyond>=OT_MIN) m.overtimeMin += beyond;
  }
  const tasks = state.TASKLIST.filter(t=>t.emp===emp.id && t.ym===ym);
  const dueNow = tasks.filter(t=>t.due && t.due<=DATA_END);
  m.tasks = tasks; m.tasksDone = tasks.filter(t=>t.done).length;
  m.tasksOnTime = dueNow.filter(t=>t.status==='ontime').length;
  m.tasksLate = tasks.filter(t=>t.status==='late').length;
  m.tasksOverdue = tasks.filter(t=>t.status==='overdue').length;
  m.tasksDue = dueNow.length;
  const s = {};
  s.delivery = m.tasksDue ? m.tasksOnTime/m.tasksDue*100 : 100;
  if (!isScored(emp)){ s.overall = s.delivery; m.scores=s; m.founder=true; return m; }
  const coverRate = m.lostMin ? Math.min(1, m.coverMin/m.lostMin) : 1;
  m.coverRate = coverRate;
  // share of shifts on time, minus 0.25 pt per late minute / 0.15 pt per minute left early
  s.punctuality = m.starts ? Math.max(0,(m.starts-m.lateCount)/m.starts*100 - m.lateMin*0.25) : 100;
  s.completion = m.starts ? Math.max(0,(m.starts-m.earlyCount)/m.starts*100 - m.earlyMin*0.15) : 100;
  s.attendance = m.working ? (m.present + m.leave*coverRate*0.9)/m.working*100 : 100;
  s.hours = m.requiredMin ? Math.min(100, m.trackedMin/m.requiredMin*100) : 100;
  s.overall = s.punctuality*W.punctuality + s.completion*W.completion + s.attendance*W.attendance + s.hours*W.hours + s.delivery*W.delivery;
  m.scores = s; return m;
}
function grade(v, m){
  if (m && isFinite(m.lateCount)){
    const late=m.lateCount||0, lateMin=m.lateMin||0, early=m.earlyCount||0, earlyMin=m.earlyMin||0, avg=late?lateMin/late:0;
    if (v<60 || avg>5 || late>3 || lateMin>45 || early>2 || earlyMin>90) return ['At risk','c-bad'];
    if (late>0 || early>0) return ['Need improvement','c-warn'];
  }
  return v>=92?['Excellent','c-good']: v>=82?['Strong','c-good']: v>=72?['Steady','c-info']: v>=60?['Need improvement','c-warn']:['At risk','c-bad'];
}

// ---------- feedback ----------
function feedback(emp, ym){
  const m = metrics(emp, ym), s = m.scores; const pos=[], imp=[], exp=[];
  if (m.founder){
    pos.push(`Logged ${fmtH(m.trackedMin)} across ${m.present} working days on a flexible schedule.`);
    if (!m.tasksDue) exp.push('Add due dates to tasks so delivery can be measured.');
    else if (s.delivery>=85) pos.push(`Delivered ${m.tasksOnTime} of ${m.tasksDue} due tasks on time.`);
    else { imp.push(`${m.tasksDue-m.tasksOnTime} of ${m.tasksDue} due tasks missed their deadline.`); exp.push('Re-plan deadlines that slip and flag blockers early to the team.'); }
    if (!exp.length) exp.push('Keep the same standard next month.');
    return {m, pos, imp, exp, summary: s.delivery>=85? 'A productive month with dependable delivery.' : 'Good effort this month; delivery dates need a closer eye.'};
  }
  if (m.lateCount===0) pos.push(`Joined all ${m.starts} shifts on time, including every 9:00 AM start.`);
  else if (m.lateCount<=2){ pos.push(`On time for ${m.starts-m.lateCount} of ${m.starts} shifts.`); imp.push(`Late to ${m.lateCount} shift${m.lateCount>1?'s':''} (${m.lateMin} min in total).`); }
  else { imp.push(`Late to ${m.lateCount} of ${m.starts} shifts, ${m.lateMin} minutes in total (average ${Math.round(m.lateMin/m.lateCount)} min).`);
         exp.push('Be signed in and tracking on Fitma Tick before 9:00 AM sharp. Target: no late starts next month.'); }
  if (m.earlyCount===0) pos.push('Completed every shift through to its scheduled end time.');
  else if (m.earlyCount>=2){ imp.push(`Ended ${m.earlyCount} shifts early (${m.earlyMin} min short).`); exp.push('Stay until the scheduled end of each shift, or agree any change with the admin in advance.'); }
  if (m.leave===0) pos.push('Full attendance with no leave days.');
  else if (m.coverRate>=.95) pos.push(`Took ${m.leave} leave day${m.leave>1?'s':''} and made up all ${fmtH(m.lostMin)} of missed time.`);
  else { imp.push(`${m.leave} leave day${m.leave>1?'s':''} with ${fmtH(m.lostMin-m.coverMin)} not made up (covered ${Math.round(m.coverRate*100)}%).`);
         exp.push('Inform the admin before 8:30 AM when you cannot work, and cover missed hours within the same week.'); }
  if (m.leave>=3) { imp.push(`${m.leave} absences recorded this month.`); exp.push('Reduce unplanned absences. Where power or internet is the cause, set up a backup connection or location.'); }
  if (m.overtimeMin>=180) pos.push(`Put in ${fmtH(m.overtimeMin)} of extra time beyond scheduled hours.`);
  if (s.hours<95) imp.push(`Tracked ${fmtH(m.trackedMin)} of ${fmtH(m.requiredMin)} required.`);
  if (m.tasksDue){
    if (s.delivery>=90) pos.push(`Delivered ${m.tasksOnTime} of ${m.tasksDue} due tasks on or before the deadline.`);
    else if (s.delivery<80){ imp.push(`Only ${m.tasksOnTime} of ${m.tasksDue} due tasks were on time${m.tasksOverdue?`; ${m.tasksOverdue} still overdue`:''}.`);
      exp.push('Update task progress daily and raise blockers at least one day before a deadline.'); }
  }
  const [g] = grade(s.overall, m);
  const summary = {Excellent:`An excellent month. ${emp.name} was dependable on time, attendance and delivery.`,
    Strong:'A strong month overall, with a few small areas to tighten.',
    Steady:'A steady month. Consistency on timekeeping will lift the overall result.',
    'Need improvement':'This month needs focus. Timekeeping and delivery fell below the expected standard.',
    'At risk':'Performance this month is below the required standard and needs immediate improvement.'}[g];
  if (!exp.length) exp.push('Keep the same standard next month.');
  return {m,pos,imp,exp,summary};
}

// Demo data for previewing the workspace with sample numbers.
// Open /workspace/?demo to use it. Nothing here is real.

const DATA_END_REF = {v:null};
const DEMO_TEAM = [
  {id:'266001', name:'Azri',    gender:'M', plan:'std4',    email:'azri@example.com',    position:'', location:'Sri Lanka', wa:'',
   p:{late:.04,lateMax:3, early:.02,earlyMax:12, leave:.025, cover:1,  ot:.25, delivery:.95}, projects:['Lading SOP Suite','Lading Audit Tool']},
  {id:'266002', name:'Hasan',   gender:'M', plan:'founder', email:'hasan@example.com',   position:'Founder', location:'Sri Lanka', wa:'',
   p:{delivery:.9}, projects:['Fitma Website','Business Development']},
  {id:'266004', name:'Ashfa',   gender:'F', plan:'founder', email:'ashfa@example.com',   position:'Founder', location:'Sri Lanka', wa:'',
   p:{delivery:.9}, projects:['Dymek Website','Lading SOP Suite','Business Development']},
  {id:'266005', name:'Aadhil',  gender:'M', plan:'std4',    email:'aadhil@example.com',  position:'', location:'Sri Lanka', wa:'',
   p:{late:.13,lateMax:9, early:.05,earlyMax:20, leave:.04, cover:.6, ot:.1, delivery:.84}, projects:['Dymek Website','i-Photonics Homepage']},
  {id:'266006', name:'Sadhir',  gender:'M', plan:'std3',    email:'',  position:'', location:'Sri Lanka', wa:'',
   p:{late:.3,lateMax:24, early:.16,earlyMax:35, leave:.09, cover:.15, ot:.03, delivery:.64}, projects:['Planet Positive Social','Fitma Social']},
  {id:'266007', name:'Safiyya', gender:'F', plan:'std4',    email:'safiyya@example.com', position:'', location:'Sri Lanka', wa:'',
   p:{late:.05,lateMax:4, early:.03,earlyMax:15, leave:.07, cover:1, ot:.15, delivery:.93}, projects:['Beyazian Store','Fitma Website']},
];

const TASKS = {
  'Lading SOP Suite':['Draft onboarding SOP','Carrier setup SOP review','Load tender SOP','Format SOP templates','Billing exceptions SOP','Update SOP index','Driver docs SOP'],
  'Lading Audit Tool':['Audit tool copy edits','New-authority lead list','Squarespace form test','Lead export cleanup','FMCSA data check'],
  'Dymek Website':['Product page content','Contact form wiring','Image optimisation','Careers page update','SEO meta pass','Mobile layout fixes'],
  'i-Photonics Homepage':['Hero section build','Coating tech section','Support section copy','Netlify deploy check','Responsive QA'],
  'Planet Positive Social':['Weekly Instagram posts','Facebook caption set','Story highlights','Content calendar','Engagement report','Carousel design'],
  'Fitma Social':['LinkedIn post drafts','Instagram carousel','Profile highlight covers','Monthly content plan'],
  'Beyazian Store':['Product listing upload','Category page copy','Order follow-up sheet','Banner design','Stock sheet update'],
  'Fitma Website':['Insights article upload','Guides page review','Pricing page copy','Contact form QA','Blog image set'],
  'Business Development':['Partner proposal draft','Lead research batch','Discovery call prep','Follow-up emails']
};
const LEAVE_REASONS = ['Sick leave','Family matter','Power outage','Internet down','Medical appointment','Personal errand','Travel'];


// ---------- Seeded random ----------
function rng(seed){ let h=1779033703^seed.length; for(let i=0;i<seed.length;i++){h=Math.imul(h^seed.charCodeAt(i),3432918353);h=h<<13|h>>>19;}
  let a=h>>>0; return ()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}; }

// ---------- Generate attendance (sample) ----------
function genMonth(emp, ym){
  const out = state.DAYS[emp.id] || (state.DAYS[emp.id] = {});
  const n = daysIn(ym); const leaves=[];
  for (let dd=1; dd<=n; dd++){
    const d = dateOf(ym,dd), k = key(d), r = rng(emp.id+k);
    if (d > DATA_END_REF.v){ out[k]={status:'future',sessions:[],shifts:shiftsFor(emp,d)||[]}; continue; }
    const sh = shiftsFor(emp,d);
    if (sh===null){ // founder: flexible hours, any day
      const wk = d.getDay()===0||d.getDay()===6;
      if (r() < (wk? .6 : .12)){ out[k]={status:'off',sessions:[],shifts:[]}; continue; }
      const sessions=[]; let t = 480 + Math.floor(r()*240); const cnt = 1+Math.floor(r()*3);
      for(let i=0;i<cnt;i++){ const len=60+Math.floor(r()*150); sessions.push({in:t,out:Math.min(t+len,1380),kind:'flex'}); t+=len+60+Math.floor(r()*180); if(t>1320)break; }
      out[k]={status:'flex',sessions,shifts:[]}; continue;
    }
    if (!sh.length){ out[k]={status:'weekend',sessions:[],shifts:[]}; continue; }
    if (r() < emp.p.leave){
      const lost = sh.reduce((a,[s,e])=>a+e-s,0);
      out[k]={status:'leave',sessions:[],shifts:sh,reason:LEAVE_REASONS[Math.floor(r()*LEAVE_REASONS.length)],lost,covered:0};
      leaves.push(k); continue;
    }
    let anyLate=false, anyEarly=false;
    const sessions = sh.map(([s,e],i)=>{
      const late = r()<emp.p.late ? 1+Math.floor(r()*emp.p.lateMax) : 0;
      const early = r()<emp.p.early ? 5+Math.floor(r()*emp.p.earlyMax) : 0;
      const ot = early ? 0 : (r()<emp.p.ot ? 15+Math.floor(r()*45) : Math.floor(r()*4));
      anyLate = anyLate||late>0; anyEarly = anyEarly||early>0;
      return {in:s+late,out:e-early+ot,s,e,late,early,ot,kind:'shift'};
    });
    out[k]={status: anyLate&&anyEarly?'lateearly':anyLate?'late':anyEarly?'early':'ontime',sessions,shifts:sh};
  }
  // leave cover: make-up sessions on following working days
  leaves.forEach(lk=>{
    const L = out[lk]; const r = rng('cover'+emp.id+lk);
    let need = Math.round(L.lost * emp.p.cover * (emp.p.cover<1 ? (0.6+r()*0.8) : 1));
    if (need<=0) return;
    const keys = Object.keys(out).filter(k=>k>lk && out[k].sessions.length && out[k].status!=='future' && out[k].status!=='leave').sort();
    for (const k of keys.slice(0,4)){
      if (need<=0) break;
      const day = out[k]; const last = day.sessions[day.sessions.length-1];
      const chunk = Math.min(need, 60 + Math.floor(r()*30));
      const start = last.out + 30;
      day.sessions.push({in:start,out:start+chunk,kind:'makeup',cover:lk});
      L.covered += chunk; need -= chunk;
    }
    L.covered = Math.min(L.covered, L.lost);
    if (L.covered >= L.lost) L.status='covered';
  });
}

// ---------- Generate tasks (sample, sample projects/tasks) ----------
function genTasks(emp, ym){
  const r = rng('tasks'+emp.id+ym); const n = daysIn(ym);
  const count = emp.plan==='founder' ? 4+Math.floor(r()*3) : 6+Math.floor(r()*4);
  for (let i=0;i<count;i++){
    const project = emp.projects[Math.floor(r()*emp.projects.length)];
    const pool = TASKS[project]; const title = pool[Math.floor(r()*pool.length)];
    let a = 1+Math.floor(r()*(n-6)); let ad = dateOf(ym,a); while(ad.getDay()===0||ad.getDay()===6){a++;ad=dateOf(ym,a);}
    const dueDay = Math.min(n, a+3+Math.floor(r()*8)); let due = dateOf(ym,dueDay);
    if (due.getDay()===6) due = dateOf(ym,dueDay-1); if (due.getDay()===0) due = dateOf(ym,Math.max(1,dueDay-2));
    let done=null, status;
    if (due <= DATA_END_REF.v){
      if (r() < emp.p.delivery){ done = new Date(due); done.setDate(due.getDate()-Math.floor(r()*3)); if(done<ad) done=new Date(ad); status='ontime'; }
      else { const d2 = new Date(due); d2.setDate(due.getDate()+1+Math.floor(r()*4));
        if (d2 <= DATA_END_REF.v){ done=d2; status='late'; } else status='overdue'; }
    } else {
      if (ad > DATA_END_REF.v) status='todo';
      else if (r()<.3){ done = new Date(DATA_END_REF.v); done.setDate(DATA_END_REF.v.getDate()-Math.floor(r()*2)); if(done<ad) done=new Date(ad); status='ontime'; }
      else status='progress';
    }
    state.TASKLIST.push({id:emp.id+ym+i, emp:emp.id, ym, project, title, assigned:ad, due, done, status});
  }
}

function loadDemo(months){
  const y = new Date(); y.setDate(y.getDate()-1);
  const end = new Date(y.getFullYear(),y.getMonth(),y.getDate());
  state.DATA_END = end; DATA_END_REF.v = end;
  for (const e of DEMO_TEAM) for (const ym of months){ genMonth(e,ym); genTasks(e,ym); }
  return { team: DEMO_TEAM.map(({p,projects,...rest})=>rest), dataEnd: DATA_END_REF.v };
}

// ---------- Fitma Workspace client (Apps Script build) ----------
const LOGO_WHITE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAANwAAADMCAYAAAAYjM0aAAAQ70lEQVR42u2dabAcVRmG32/uvSoEoVzYBK0SQcVyZwfXIC4gKAHZRCACghECKkuM+EcFBEM0MZRLWaigLGoVVW7EIEq5i4JLWWVRpYBAubBHQCB3ul9/zDnkpJ25d7rnnJnumfepmprkJren5/R5+vu+c7pPA6I2kGy596Uk/0EyI5mzGjnJWZJ/Jrkw3L4Qko2ccu+LCtIMgv/9h0juRNIk3WhR49ePUwEQwCwAG3BbBmADgK0AHGlm1DGXcMIFOfe+wInSiniMCWBLNbGEE/9PnmCblmi7QsI1HmvYdoWEE0LCCSHh1ARCSDghJJwQQsIJIeGEEBJOCAknhIQTQkg4ISScEELCCSHhhJBwQggJJ4SEE0JIOCEknBBCwgkh4YSQcEIICSeEhBNCSDgh6sO0mkD0wj3RJ9aKzbmZ5RJOiO6ymZllkbfZmnTpJJz4P9EAwMxI8nAAb3D9pGqkI4AHAVxtZn90IlPCCdHBzCwnuQrA0ojbPZPkIWZ2Pcmp2NFTwokmRreWk+3lTrYMG59bNwgZgKcBuIjkDZjgR2dJOBHScjK8KBAtRh+Zctt7LoAFZvbwpKaWmhYQvequ2M+T8w+FnOjn1Ek4MdT6UCmEEELCCSHhhBASTggJJ4SQcEJIOCEknBBCwgkh4YQQEk4ICSeEhBNCSDghxgvdgFrArenRwuC3khCdlaqoVhUSrrtsflWpLME2hZBwYWRz63lsB2BvdNbgqHLns/+dhwH8dJKXExASbs4oRPJtAC4H8OxIm76N5CK3PJwindCgiavZSHIrAF9zss26tHKQ1wYAOwH4slvBWAhFOAAtM8tIvgTA1k6WmUgnsxzAywBsa2b/UJQTmhbYtC1ir1blpdOJTUi4LliibWrAREg4ISScEBJOCCHhhJBwQggJJ4SEE0LCCSEknBASTggh4YSQcEJIODWBEMNDt42IscDdSOxv9B313Rn+rpOsuLSGhBPjINuUmWUA2jXeNwknxiKqwd2xvx2AgwDsic4yGaNa1iIDcA+AXwP4gZndG+wnJZxoumwkuRzAhwA8q0a7eCqAf5O82MxWkjSSJuFEU2VrAWiRvBrAIvdP7UINNbJddO/bAriE5O4AjgUg4UQj8Qs/rXaybUBn4ae69WeiswLc0QDuNLNlmhYQTYtuU062fQAscVFtpgZRrRvm9i0DcBbJ3SScaCpLgtTNaryfft+mACyVcKJRtZuLbjMA9nWduQl92C/BuL9qONFEnonOor11j27FKLedIpwQw2NKwokm8gCAf/tMs0k7LuFEY3CT3NNmNgvgZ+7HuYQTIh0+ol3a5WcSTojIUS5zc3E3A1iBzmT3bFMinUYpRRPJ3TP3zkXn8qn3uJ9nFaNda1jBRxFONLKWcxGNZnYcgNMB3IXO5PJ0hdfQPFCEE42Vzl+Bb2ZrSF4B4AB0bs/ZBvM/74+u/z8K4KUA9kH85wNKODF2kc5fX7kewLfdq29IPhfAOgxp4EXCiXEQLwtu2ZkvQhHAtJk9QfKVAK5H54bVfBippYQT4xTtsj4impftZQDWOtkyDOkOcQ2aiInBydZ2sl2Pzgjn0GSTcGISZXv5qGRTSikmVbZtRiGbIpyYNNnWjVI2RbiIx7XwLhTZJFxkcmwcSvaZQrch6UwijpVsA00fSLjyZIFkvuE3ALgfwHp0FrV5CoCt0LkrecEoz6iSrT6ySbjyjR2uX/8ndOZxfgrgL+istvuou+SoBWALANsD2BXAQ0o5hy7bKyLXbF62WwG8EBUvAZNw/Uc1f8CuBbAGwI1m1vWWEPfz/7jXrcHPJVwzZWs7V84H8DvXByptV6OU8w+G+Ia9GcBCM1tkZj82s5zkNMkpki1/Ia078OZeLffvpqZsvGxfMrPzAGymlDKdbHQH7DMAlpnZBncfFswsM7N2jwinUcvRyPZqAD9EvMu1ZtFZyPVSMzvNlQqq4RLK1gKwxMw+7yLWJo8eErWTbR06D/RIIdtT3Ak3l3DxZfPp9olmdplbeLQ9JNlyHYLayTYVK1uRcL1r2+PM7AqSM26VqGGxwEmndLQ/2XZzaWQs2dpdZPMj1OMjXJAfx+hohi6Pe+0zskwBONbMvhEsydbvd7BCDVd2nwHglwBeHaS1GnAZnmzdIlvupnowNsK52+Tz2OmU226/LTXj3t9tZlf2G9mCGx8Rppzh4EpftnVuomyZ2ekk/4nOEDQw4kuRJjCyrXHH4EnZYu7/dE1kI8kdAJwGYJcBz+o5OnNfq83snj6kY/B7J5WUreVOFFkg31PN7HEvmvuZ9ZqzK0iXu21eQPLPAL6Czjr6baX/Q4lsSWUbuXAujSTJHQH8AsDzIm7+CJKvAXDvXNJ5Eczs5wB+7jp8P7JNBU9yOQKdBwPuCmAByfUA/gDgm2b2Pfcd+xrh9PN7ZvYdkvsBuBLAqyZduoJs69yJqDGRrTaN6N4vZofHSLYjvB5z2zsv/Jw+TwBl9nt3kjdzbtaRfH6Z/Sh8xhYkr3TbykjmLMese79gvn0IPvNw9zttxsHv879IbhnWuxXa+/6I+7bBvX/On0R77VewD0cP8vmjvtLEn0Ve4FK6aXfGGvQ17ba3S6lRiz7SvuBM+wYAP3EDHG13ts2DV+ZeBwD4FckD3O/1deWJ/79m9oiZHQNgOTYuktO0uUA/ALR52UGxoL13d2lk7Mj2uZKRbaBBrLpc2pUl2JdWgkEYf/DfCOB76FygnAUnivAuAi9/G53b+deS/KC7QqWvk51fjcqJdyGAg9G5K8Fvt0myGYCPAXjEpe0csWzTTralfcrm/+2RAT73sboIZ3XfrhtI8bJ9Fxvny+Y7+D7aGoCVJC8j+TRXq031IR2deNOuHtwPwC1uu23Ue76OQRudaWar+h1AqplsoXB/qRAg/Lzqrbp4uf/INhtENi9bv+3XCg72YgA3ktzJi9Rnutt2+3ErgNcB+IbrOEQ9r04JZTvDzFa5/R+lbLOuzVaXlO3JEWQAfwVwU5CZ9dsWBuAqCVc+jdwc1W5EtCAq7eXqurdUqOtaZvaomR0LYFmQwmY1lm21b8cS7b1HoppttZmdUXE00o92f9wdz36uCPL7fgeAL0q44chWTDEzdG4fuY7kh0vWdXlQ110E4O0A7qtRXRdLtrUJ0shVA8gWPiprLYBVTmA/OMYu7TDr9j0HsNjM1ku4+Wu2hRFl80wFZ8cVJL9KcjM/B1eyrvs+gH3RuTFy1HVdXSPbNICVZnZmhHm23El3JoCVwYCZj3h5kELOuJPhoWZ2Yz81e+pOPeXev1WYMxqUWTf3c5k/mGUjm3tfSPLRYA4sNnnwnX9D8gVl9zfY181JXh7sazbkebg8+P+nl/kewefuQfKBiPNs/rtf4vtbjJuBCzcbH0DyOpIPFz77bpJrSD4v7OvjKpyf0LxmgA6cWrZuHeMekm8t2znCVJTk2cF220MSLoZsezZBtjnafQeSryX5ZpK7kXx6sZ+Pq3B5cEXGojJfeESysUsnO6vbQe3jrOvb80AnL4OrblIJF1u2LIFs06mWufBLbJT9t3ERLgtkO6pkh51x7/uPQDZ2SQW/RnKzASL0ziRvCsQ5P4FwoWyn1SyyrUgV2XpFO/dZT65xU8eBiZjChZHtyIoHf5SydavrbiK58wDSbeYm2knywsjCSbYGjgTGEi7rIttMBdn+O2LZetV1bxuwrvtk5Agn2SZYOC/aOMnWra47u2Jd50fTtizRHnMJF0O2vUg+mKBmW5G6Zpt04bIglTyi5MH3NdubIsuWVbyNpp+67nKSm1dIMcvedtRLuFC2D0SQLWZk+7QiW1rhQtkOqxjZUsg2199j1HW/JblLBelsQOEk2wQLlwUdoA6yhUKcTfKE4O/tiCmm3+a9JA+M3cnmEK4JsimNTCRcnWU7L/is15O8K/KEfrGznlM2bawgXGzZMsnWHOFC2RZVrNnemki2jwYH33/WjiRvLFxuFruuu6JKXdencLMRZNs7kWwXK41MK1w32cpGtgNJPpFSti7fbZrkpYW5wtgp5u9IvnBQ6boI5y+RWxJBtnYC2RTZEgkXQ7aDnGx5wshmXa4+8MPypwYdOFVdd9AgZ/2grRYFbbSkYnvvTfIhydY84QaRbWZYss0zF+a/5+tI3pm4rju3al0XyHKU29YpA0S2hxKmkZItkXAxarZUsi2v2Bl3IPmTwqBE7Lru6yQXVJ06ILkLyWPCY1QD2S5SzZZWuFC2QyumNW93adxIZetR161JXNfdPGhdV2HCfJ9EaeRFimxphWuEbBXrpLCuOyVxXXcfyYPLRoYwDZZs4y/cILLN1DGyzVPXvYbk3xPXdR8ptnmk49dNtkyyNUe4JwLZ3lmxZksl20diyNajwz6H5A2J67orq9R1I5TtU5ItrXBetFC2uqSR0WXr0gZTJFcnrutuIfniiPN1+0q2Zgp3TTDRWlY2H9kObppsPeq6k4PJ+dkE0t1P8pCqI34F2dZLtmYKd61r7INrJtuy1LIV6jrfmfcjeUfium552bpuCLJdKNnSdrJWkFIeX7Fma7xsPTr19iR/lKCuC9vpKpJb9PM9Jdv4SGckt68473PIOMnWJfK3SK4qDILETjF/P19dJ9nGONqViGxjKVuPuu6kxHXdAyTf0a2uK6S5km1colwF2WYTyHZuHWTrUdftS/L2xHXdRwvCp5btAslWXylTy7asTrL1SOm2I3l94rruam66avB+JP8j2SZLtulJimx91HWfTVzX/YHkTuwsZafINqGR7R2TKluPuu5Eko8nrOvuSzSpLdkmWLZzmiJbj7pun0R1XVZor1jtLdkmULZ2U2Wbo65bl6iuyyNGtvMlW/07UyrZPthk2brUdUZyZaK6LkZkk2wNiGzvTCTbGeMgW6Gu81fsLObGx1PNjlg4ySbZxku2HnXd3iT/NkLpwsj2ScnWDNnakm2gVHxbkj9MUNeViWySrQEdJZVsS8ddth513SVDrOsU2RoW2Q6VbEnquhOGVNdJNsk2ebL1qOv2SljXhZHtE5JtcmU7fVJl65Gub0NybYK6TrI1qBNItuHXdSsi1XWKbA2LbIsk28jquuO58QlCswNGto9LNsk2o9aet67bk+RfK0iXSzbJRpZ8wLtSeoDk1iSvK1HXSbaGHeDDJFu96jr3508XUsW8h2i5ZGtOZDuCG5cxzyVb7eq69wT3v4WDKnlBxrMkWzNk81EtRWRTzTZYXedHMXcm+QWSdxfa/F52ltTbvRgdRf3SyFA2RbZmpJhPJ/kqkgtJ7kHyWd3+n6hfZDsyUWT7gGRLlmJO9RKSJZ+oKkYnWy7ZGpdmtpxkeuKoZFPNJiTbdGLZliiyCTGcmk2yCTGkNHKJ0kghNpXtKMkmxHBqtlSyvV9ppBC9I1sm2YRIJ9vRiSOb0kgh2QLZmEC29ymyCbFpzZZKtpMlmxDDiWwnK40UQrIJMRLZjkkk20mSTYhNa7bUsqlmE4psimxCDFe2d0eWzU+MnyjZhEgrW7sgm9JIoZpNsgkxXrIpjRQTL5tfIu1Y1WxCDEe6NyeKbO9VGinEprI9g+RdkR5LG0Y2ySZEF+GWBw9ziB3ZlEYKURDuTxEerhH+/mLJJkRv4f4bMY1crDRSiLmFyyWbEMMT7sFAHqWRQiQW7obCgIdkEyKhcO8qOUoZynaC0kghygnXIvkjJ9CGeWTLJJsQgwlnJHcgeVsQ6YpXnGSFCHiC0kghKkY4974jyevmiXC3kzxEkU2ICNK5Px9Ncq17rnNO8hGSt5D8GMmt3f/RY2eFqMD/ABeJfVsiekPoAAAAAElFTkSuQmCC";
const ADMIN_EMAIL = "info.fitma@gmail.com";
const VORA = '<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Vora, the Fitma mascot"> <defs> <linearGradient id="vbody" x1="0" y1="0" x2="0" y2="1"> <stop offset="0" stop-color="#6f9fd0"/> <stop offset="1" stop-color="#4a6f8f"/> </linearGradient> <linearGradient id="vspark" x1="0" y1="0" x2="1" y2="1"> <stop offset="0" stop-color="#ffd37a"/> <stop offset="1" stop-color="#ffb24d"/> </linearGradient> </defs> <!-- little feet --> <ellipse cx="50" cy="116" rx="9" ry="5" fill="#3f5d73"/> <ellipse cx="78" cy="116" rx="9" ry="5" fill="#3f5d73"/> <!-- body: a friendly rounded droplet --> <path d="M64 14 C92 14 108 36 108 66 C108 96 90 116 64 116 C38 116 20 96 20 66 C20 36 36 14 64 14 Z" fill="url(#vbody)" stroke="#2f4a60" stroke-width="3"/> <!-- belly --> <ellipse cx="64" cy="74" rx="30" ry="30" fill="#eef4f9"/> <!-- spark / Fitma upward mark on the belly --> <path d="M50 86 L60 72 L67 80 L80 60" fill="none" stroke="url(#vspark)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/> <path d="M74 58 L82 57 L81 65" fill="none" stroke="url(#vspark)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/> <!-- eyes --> <circle cx="51" cy="50" r="8.5" fill="#ffffff"/> <circle cx="77" cy="50" r="8.5" fill="#ffffff"/> <circle cx="53" cy="51" r="4" fill="#243444"/> <circle cx="79" cy="51" r="4" fill="#243444"/> <circle cx="54.6" cy="49.4" r="1.4" fill="#ffffff"/> <circle cx="80.6" cy="49.4" r="1.4" fill="#ffffff"/> <!-- smile --> <path d="M55 60 Q64 67 73 60" fill="none" stroke="#243444" stroke-width="3" stroke-linecap="round"/> <!-- cheeks --> <circle cx="42" cy="58" r="3.5" fill="#f3a9a0" opacity="0.7"/> <circle cx="86" cy="58" r="3.5" fill="#f3a9a0" opacity="0.7"/> <!-- antenna spark --> <line x1="64" y1="14" x2="64" y2="6" stroke="#2f4a60" stroke-width="3" stroke-linecap="round"/> <circle cx="64" cy="5" r="4" fill="url(#vspark)"/> </svg>';

// ---------- runtime data ----------
const DEMO = new URLSearchParams(location.search).has('demo');
const DAYS = state.DAYS, TASKLIST = state.TASKLIST;
let TEAM = [], PROFILES = {}, SETTINGS = {}, SYNC = {}, NOW = new Date(), DATA_END, TODAY, MONTHS = [], CUR;
let ACTIVITY = [], EVENTS = [], PROGRESS = {}, ACT_FEED = null;
let PROJECTS = [], PROJMETA = {};
const ADMIN = { id:'admin', name:'Fitma Admin', email: ADMIN_EMAIL.toLowerCase() };
const isUnlocked = ym => NOW >= unlockDate(ym);
function setDataEnd(d){ DATA_END = d; state.DATA_END = d; TODAY = new Date(d.getFullYear(), d.getMonth(), d.getDate()+1); CUR = key(d).slice(0,7); }
setDataEnd((()=>{ const y=new Date(); return new Date(y.getFullYear(), y.getMonth(), y.getDate()-1); })());
const profileOf = emp => ({ name:emp.name, position:'', location:'', wa:'', offEmail:'', photo:null, ...(PROFILES[emp.id]||{}) });

function clearData(){ for (const k of Object.keys(DAYS)) delete DAYS[k]; TASKLIST.length = 0; TEAM = []; PROFILES = {}; PROJECTS = []; PROJMETA = {}; }
function fillGaps(){
  for (const e of TEAM){ const m = DAYS[e.id] || (DAYS[e.id] = {});
    for (const ym of MONTHS) for (let dd=1; dd<=daysIn(ym); dd++){ const d=dateOf(ym,dd), k=key(d);
      if (!m[k]) m[k] = { status: d>DATA_END ? 'future' : (SETTINGS.trackingStart && k<SETTINGS.trackingStart ? 'nodata' : (shiftsFor(e,d)===null ? 'off' : 'weekend')), sessions:[], shifts: shiftsFor(e,d)||[] }; } }
}
function ingestMonth(doc){
  const empId = doc.empId; if (!TEAM.find(e=>e.id===empId)) return;
  Object.assign(DAYS[empId] || (DAYS[empId] = {}), doc.days || {});
  for (const t of (doc.tasks||[])) TASKLIST.push({ ...t, emp:empId, ym:doc.ym, assigned: t.assigned?parseKey(t.assigned):null, due: t.due?parseKey(t.due):null, done: t.done?parseKey(t.done):null });
}
function setMonths(dataEndKeys){
  const ends = dataEndKeys.filter(Boolean).sort(); if (ends.length) setDataEnd(parseKey(ends[ends.length-1]));
  const start = (SETTINGS.trackingStart || key(DATA_END)).slice(0,7);
  MONTHS = monthsBetween(start, CUR); if (!MONTHS.length) MONTHS = [CUR];
  state.HOLIDAYS = new Set(SETTINGS.holidays || []);
}

// ---------- server API ----------
// Works two ways from the SAME bundle:
//   • inside the Apps Script web app  -> google.script.run.apiCall(...)   (unchanged)
//   • on a fast static host (GitHub Pages) -> cross-origin fetch() to the /exec URL
// The server routes a {action:'api', path, body, token} POST through the same apiCall().
const FW_EXEC = (typeof window!=='undefined' && window.FW_EXEC) || 'https://script.google.com/macros/s/AKfycbzig98s-ZzuHELem-krcoma0AtcNHIxRCVKIK0LGjTex7eYKiosnRtLeFR32lPedTI/exec';
let TOKEN = ''; try { TOKEN = localStorage.getItem('fw:tok') || ''; } catch(e){}
function setToken(t){ TOKEN = t || ''; try { if (t) localStorage.setItem('fw:tok', t); else localStorage.removeItem('fw:tok'); } catch(e){} }
function api(path, body){
  return new Promise((resolve, reject)=>{
    const ok = (res)=>{ let out; try { out = JSON.parse(res); } catch(e){ out = { status:500, body:{ error:'Unexpected response.' } }; }
      if (out.status >= 200 && out.status < 300) resolve(out.body);
      else { const e = new Error((out.body && out.body.error) || `Request failed (${out.status})`); e.status = out.status; reject(e); } };
    const bad = ()=>{ const e = new Error('The workspace didn’t respond. Check your connection and try again.'); e.status = 0; reject(e); };
    if (typeof google !== 'undefined' && google.script && google.script.run){
      google.script.run.withSuccessHandler(ok).withFailureHandler(bad)
        .apiCall(path, body ? JSON.stringify(body) : '', TOKEN);
    } else {
      // Simple cross-origin POST (text/plain body → no CORS preflight; GAS reads e.postData.contents)
      fetch(FW_EXEC, { method:'POST', body: JSON.stringify({ action:'api', path:path, body: body ? JSON.stringify(body) : '', token: TOKEN }) })
        .then(r=>r.text()).then(ok).catch(bad);
    }
  });
}
function applyData(d){
  clearData(); SETTINGS = d.settings || {}; SYNC = d.sync || {};
  TEAM = (d.members||[]).filter(m=>m.active!==false).sort((a,b)=>a.id.localeCompare(b.id));
  PROFILES = d.profiles || {}; ACTIVITY = d.activity || []; EVENTS = d.events || []; PROGRESS = d.progress || {};
  setMonths((d.months||[]).map(m=>m.dataEnd));
  (d.months||[]).filter(m=>MONTHS.includes(m.ym)).forEach(ingestMonth); fillGaps();
  PROJMETA = d.projectMeta || {};
  PROJECTS = (d.projects||[]).map(p=>({ ...p,
    startD: p.start?parseKey(p.start):null, deadlineD: p.deadline?parseKey(p.deadline):null, completedD: p.completed?parseKey(p.completed):null }));
  return d.who;
}
async function loadData(){
  const d = await api('/data');
  try { localStorage.setItem('fw:data', JSON.stringify(d)); } catch(e){}
  return applyData(d);
}
const loadAll = loadData;
async function startSession(){
  if (!TOKEN){ S.loading = false; render(); return; }
  let hydrated = false;
  try {
    const c = localStorage.getItem('fw:data');
    if (c){ const d = JSON.parse(c); const who = applyData(d);
      S.user = who.role==='admin' ? 'admin' : who.empId; S.mustChange = !!who.mustChange; S.loading = false; hydrated = true; render(); }
  } catch(e){}
  if (!hydrated){ S.loading = true; render(); }
  try { const who = await loadData(); S.user = who.role==='admin' ? 'admin' : who.empId; S.mustChange = !!who.mustChange; if (!hydrated) S.view = null; }
  catch(e){ if (e.status === 401){ setToken(''); try{ localStorage.removeItem('fw:data'); }catch(_e){} S.user = null; } else if (!hydrated){ S.authMsg = 'We couldn’t load your workspace. Check your connection and try again.'; } }
  S.loading = false; render();
}
async function loadActivityFeed(){
  if (DEMO){ ACT_FEED = { events:EVENTS, activity:ACTIVITY }; return; }
  const r = await api('/activityfeed'); ACT_FEED = { events:r.events||[], activity:r.activity||[] };
}
async function loadSettings(){ try { await loadData(); } catch(e){} }
async function loadDemoData(){
  clearData(); const r = loadDemo((()=>{ const y=new Date(); const start = key(new Date(y.getFullYear(), y.getMonth()-2, 1));
    SETTINGS = { trackingStart:start }; SYNC = { source:'demo', lastRun:new Date().toISOString(), ok:true };
    setMonths([]); return MONTHS; })());
  TEAM = r.team; setDataEnd(r.dataEnd); setMonths([]); fillGaps();
}

// ---------- writes ----------
async function saveProfile(id, data){ if (!DEMO) await api('/profile', { id, data }); PROFILES[id] = { ...(PROFILES[id]||{}), ...data }; }
async function removePhoto(id){ if (!DEMO) await api('/profile', { id, data:{ photo:null } }); if (PROFILES[id]) delete PROFILES[id].photo; }
async function saveMemberAll(id, upd){
  if (!DEMO) await api('/member', { id, ...upd });
  const m = TEAM.find(e=>e.id===id);
  if ('plan' in upd) m.plan = upd.plan; if ('gender' in upd) m.gender = upd.gender; if ('email' in upd) m.email = upd.email.toLowerCase();
}
async function saveHolidays(list){ if (!DEMO) await api('/settings', { holidays:list }); SETTINGS.holidays = list; state.HOLIDAYS = new Set(list); }
async function changePassword(oldPassword, newPassword){ if (DEMO) return; await api('/password', { oldPassword, newPassword }); }
async function resetMemberPw(id){ return (await api('/resetpw', { id })).password; }
async function sampleData(opts){ await api('/sample', opts); await loadAll(); }

// ---------- Access ----------
const ACCESS_NOTE = 'Each team member signs in with the email address registered for them here and their own password. Any other address is refused. Starter passwords are changed by each person on first login; the admin can reset a password here at any time.';
const accessEmail = emp => (emp.email || '').trim().toLowerCase();
const empByEmail = email => { email = email.trim().toLowerCase(); return TEAM.find(e=>accessEmail(e) && accessEmail(e)===email); };

// ---------- State ----------
const S = { user:null, loading:true, railCollapsed:false, mustChange:false, view:null, viewing:null, month:null, revMonth:null, sort:{k:'overall',d:-1}, projFilter:'all', projEmp:'all', selDay:null, chooser:null, preview:null, authMsg:'', busy:'', shotEmp:null, shots:null, shotsLoading:false };
const empById = id => TEAM.find(e=>String(e.id)===String(id));
const isAdmin = () => S.user==='admin';
const subject = () => isAdmin() ? (S.viewing? empById(S.viewing):null) : empById(S.user);

// ---------- Small helpers ----------
const P = {
  home:'<path d="M3 9.5L10 4l7 5.5V17H3z M8 17v-5h4v5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  att:'<path d="M3 5h14v12H3z M3 9h14 M7 3v4 M13 3v4" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  proj:'<path d="M3 4h4v12H3z M8.5 4h4v8h-4z M14 4h3v5h-3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  rev:'<path d="M5 2h7l4 4v12H5z M12 2v4h4 M8 11h5 M8 14h3" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  prof:'<path d="M10 3a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7z M3 17c1-3.5 4-5 7-5s6 1.5 7 5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  team:'<path d="M7 4a3 3 0 1 0 0 6a3 3 0 0 0 0-6z M14 5a2.5 2.5 0 1 0 0 5 M2 17c.8-3 3-4.5 5-4.5s4.2 1.5 5 4.5 M13 12.5c2 0 4 1.3 5 4.5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  cmp:'<path d="M3 15l4.5-5 3.5 3 6-7 M13 6h4v4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  set:'<path d="M10 7a3 3 0 1 0 0 6a3 3 0 0 0 0-6z M10 2v2 M10 16v2 M2 10h2 M16 10h2 M4.3 4.3l1.4 1.4 M14.3 14.3l1.4 1.4 M4.3 15.7l1.4-1.4 M14.3 5.7l1.4-1.4" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  key:'<path d="M7 9a3.5 3.5 0 1 1 3 3.4L8 14.5H6.5V16H5v1.5H3v-2.2l4.3-4.3A3.5 3.5 0 0 1 7 9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  lock:'<path d="M5 9h10v8H5z M7 9V6a3 3 0 0 1 6 0v3" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  dl:'<path d="M10 3v10 M6 9l4 4l4-4 M4 17h12" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  eye:'<path d="M2 10s3-6 8-6s8 6 8 6s-3 6-8 6s-8-6-8-6z M10 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  'chev-left':'<path d="M12 5l-5 5l5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  'chev-right':'<path d="M8 5l5 5l-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  logout:'<path d="M8 4H4v12h4 M12 7l3 3l-3 3 M15 10H7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  info:'<path d="M10 2.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 0 0 0-15z M10 9v5 M10 6v.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  clock:'<path d="M10 3a7 7 0 1 0 0 14a7 7 0 0 0 0-14z M10 6v4l3 2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  sync:'<path d="M15.5 7A6 6 0 0 0 4.6 6.4 M4.5 13a6 6 0 0 0 10.9.6 M15.5 3v4h-4 M4.5 17v-4h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  // badge icons
  b_sun:'<path d="M10 6a4 4 0 1 0 0 8a4 4 0 0 0 0-8z M10 1.5v2 M10 16.5v2 M1.5 10h2 M16.5 10h2 M4 4l1.4 1.4 M14.6 14.6L16 16 M4 16l1.4-1.4 M14.6 5.4L16 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  b_full:'<path d="M3 10.5l4 4l10-10" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  b_flag:'<path d="M5 18V3 M5 4h9l-2 3.5l2 3.5H5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  b_shield:'<path d="M10 2.5l6 2.5v4.5c0 4-2.7 6.7-6 8c-3.3-1.3-6-4-6-8V5z M7 10l2 2l4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  b_bolt:'<path d="M11 2L4 11h5l-1 7l7-9h-5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  b_week:'<path d="M3 5h14v12H3z M3 9h14 M6.5 12.5l1.5 1.5l3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
};
const icon = (n,s=18)=>`<svg viewBox="0 0 20 20" width="${s}" height="${s}" aria-hidden="true">${P[n]}</svg>`;
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const VORA_EMPTY="https://raw.githubusercontent.com/infofitma-admin/fitma-tick/main/web/vora-states/vora-empty.png";const VORA_SUCCESS="https://raw.githubusercontent.com/infofitma-admin/fitma-tick/main/web/vora-states/vora-success.png";const VORA_ERROR="https://raw.githubusercontent.com/infofitma-admin/fitma-tick/main/web/vora-states/vora-error.png";
function avatar(emp, cls=''){ if(!emp||emp.id==='admin') return `<span class="avatar ${cls}" style="background:var(--navy);padding:6px"><img src="${LOGO_WHITE}" alt="" style="object-fit:contain"></span>`;
  const p = profileOf(emp); return `<span class="avatar ${cls}">${p.photo?`<img src="${p.photo}" alt="">`:esc((p.name||emp.name)[0])}</span>`; }
function ringColor(v){ return v>=82?'var(--good)':v>=72?'var(--steel)':v>=60?'var(--warn)':'var(--bad)'; }
function ring(v, size=120, stroke=10, label='score', cls='', track='var(--off)', col){
  const r=(size-stroke)/2, c=2*Math.PI*r, off=c*(1-Math.max(0,Math.min(100,v))/100);
  return `<div class="ring ${cls}" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${col||ringColor(v)}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><div class="rv"><div><b>${Math.round(v)}</b>${label?`<br><span>${label}</span>`:''}</div></div></div>`;
}
const pct = v => `${Math.round(v)}%`;
function lastSync(){ if(!SYNC.lastRun) return 'Not synced yet'; const t=new Date(SYNC.lastRun); return `${fmtD(t)}, ${fmtT(t.getHours()*60+t.getMinutes())}`; }
const STATUS = {ontime:['On time','c-good'],late:['Late','c-warn'],early:['Left early','c-early'],lateearly:['Late, left early','c-early'],leave:['Leave','c-bad'],covered:['Leave, made up','c-info'],flex:['Flexible','c-info'],off:['No time logged','c-off'],weekend:['Weekend','c-off'],future:['Upcoming','c-off'],nodata:['Before tracking','c-off']};
const statusChip = st => { const [l,c]=STATUS[st]||['','c-off']; return `<span class="chip ${c}">${l}</span>`; };
const TASKST = {ontime:['Done on time','c-good'],late:['Done late','c-warn'],overdue:['Overdue','c-bad'],progress:['In progress','c-info'],todo:['Not started','c-off']};
const taskChip = st => `<span class="chip ${TASKST[st][1]}">${TASKST[st][0]}</span>`;
const PROJ_COL = ['#3f5d73','#6b8499','#2e8a68','#b97c12','#8f5aa8','#b5622c','#3a7ca5','#7a8a3a','#bf4439'];
const projColor = name => { let h=0; for (const c of String(name)) h=(h*31+c.charCodeAt(0))>>>0; return PROJ_COL[h % PROJ_COL.length]; };
const sampleTag = !DEMO ? '' : `<span class="sample">${icon('info',14)} Sample data until Fitma Tick is connected</span>`;
function dueLabel(t){
  if (!t.due && !t.done) return 'No due date';
  if (t.done) return `Done ${fmtD(t.done)}`;
  const d = Math.round((t.due - new Date(DATA_END.getFullYear(),DATA_END.getMonth(),DATA_END.getDate()))/864e5);
  if (d<0) return `${-d} day${d===-1?'':'s'} overdue`; if (d===0) return 'Due today'; if (d===1) return 'Due tomorrow'; return `Due in ${d} days`;
}
const monthSelect = (id, val, list=MONTHS) => `<select class="fchip" id="${id}" data-change="${id}" aria-label="Month">${list.map(m=>`<option value="${m}" ${m===val?'selected':''}>${monthLabel(m)}</option>`).join('')}</select>`;

// ---------- Live shift status (uses the real clock) ----------
function nextShift(emp, from){
  const d = new Date(from.getFullYear(),from.getMonth(),from.getDate());
  for (let i=0;i<10;i++){ const sh = shiftsFor(emp,d); const nowMin = i===0? from.getHours()*60+from.getMinutes() : -1;
    if (sh && sh.length){ const f = sh.find(([s])=>s>nowMin); if (f) return {d:new Date(d),s:f[0],e:f[1]}; }
    d.setDate(d.getDate()+1); }
  return null;
}
function liveStatus(emp){
  const now = new Date(), nm = now.getHours()*60+now.getMinutes(), sh = shiftsFor(emp,now);
  const span = m => m>=60? `${Math.floor(m/60)}h ${pad(m%60)}m` : `${m} min`;
  if (sh===null) return {msg:`Flexible hours today. Work when it suits you; Fitma Tick keeps the record.`, slots:[], prog:null};
  const slots = (sh||[]).map(([s,e])=>({s,e,state: nm>=e?'past': nm>=s?'now':'next'}));
  const cur = slots.find(x=>x.state==='now');
  if (cur) return {msg:`<b>On shift</b> until ${fmtT(cur.e)} · ${span(cur.e-nm)} left`, slots, prog:(nm-cur.s)/(cur.e-cur.s)*100};
  const nx = nextShift(emp, now);
  const when = nx ? (key(nx.d)===key(now) ? `today at <b>${fmtT(nx.s)}</b>, in ${span(nx.s-nm)}` : `<b>${fmtD(nx.d)}</b> at <b>${fmtT(nx.s)}</b>`) : '';
  if (!sh.length) return {msg:`No shift today. Next shift ${when}.`, slots, prog:null};
  if (slots.every(x=>x.state==='past')) return {msg:`Done for today. Next shift ${when}.`, slots, prog:100};
  if (slots[0].state==='next') return {msg:`Your shift starts ${when}. Be on Fitma Tick by ${fmtT(slots[0].s)} sharp.`, slots, prog:null};
  return {msg:`On a break. Next shift ${when}.`, slots, prog:null};
}
function clockHTML(){ const n=new Date(); const h=n.getHours(); return `${((h+11)%12)+1}:${pad(n.getMinutes())}<small>${h<12?'AM':'PM'}</small>`; }

// ---------- Streak & badges ----------
function streak(emp){
  let cur=0, best=0, run=0, counting=true;
  const keys = Object.keys(DAYS[emp.id]).filter(k=>new Date(k+'T00:00')<=DATA_END).sort().reverse();
  for (const k of keys){ const st = DAYS[emp.id][k].status; if (st==='weekend'||st==='nodata'||st==='off') continue;
    if (st==='ontime'){ run++; if(counting) cur=run; } else { counting=false; best=Math.max(best,run); run=0; } }
  best=Math.max(best,run,cur); return {cur,best};
}
function badges(emp, ym){
  const m = metrics(emp,ym);
  if (m.founder) return [
    {ic:'b_flag',t:'Deadline keeper',d:'Every due task on time',ok:m.tasksDue>0&&m.tasksOnTime===m.tasksDue},
    {ic:'b_bolt',t:'Steady hand',d:'Time logged on 15+ days',ok:m.present>=15},
    {ic:'b_full',t:'Clear desk',d:'No overdue tasks',ok:m.tasksOverdue===0}];
  // last complete Mon–Fri week in data
  const wk = m.days.filter(x=>x.shifts&&x.shifts.length&&x.status!=='future');
  const weeks = {}; wk.forEach(x=>{ const mon=new Date(x.d); mon.setDate(x.d.getDate()-((x.d.getDay()+6)%7)); (weeks[key(mon)] ||= []).push(x); });
  const perfectWeek = Object.values(weeks).some(w=>w.length>=5 && w.every(x=>x.status==='ontime'));
  return [
    {ic:'b_sun',t:'Early bird',d:'No late starts this month',ok:m.lateCount===0},
    {ic:'b_week',t:'Perfect week',d:'A full week all on time',ok:perfectWeek},
    {ic:'b_full',t:'Full shifts',d:'Never left a shift early',ok:m.earlyCount===0},
    {ic:'b_flag',t:'Deadline keeper',d:'Every due task on time',ok:m.tasksDue>0&&m.tasksOnTime===m.tasksDue},
    {ic:'b_shield',t:m.leave?'Covered in full':'Full attendance',d:m.leave?'All leave time made up':'No leave days',ok:m.leave? m.coverRate>=.99 : true},
    {ic:'b_bolt',t:'Extra mile',d:'3+ hours beyond schedule',ok:m.overtimeMin>=180}];
}

// =========================================================================
//  SIGN-IN
// =========================================================================
const G = `<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4C13 4 4 13 4 24s9 20 20 20s20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4C16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
const APPLE = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9c-1.2-1.8-3.1-2-3.7-2c-1.6-.2-3.1.9-3.9.9s-2-.9-3.4-.9C5.9 6.8 4.3 7.8 3.4 9.4c-1.8 3.2-.5 7.9 1.3 10.5c.9 1.3 1.9 2.7 3.2 2.6c1.3-.1 1.8-.8 3.3-.8s2 .8 3.4.8s2.2-1.3 3.1-2.6c1-1.5 1.4-2.9 1.4-3c0 0-2.7-1-2.7-4.3zM13.9 4.9c.7-.9 1.2-2 1.1-3.2c-1 0-2.3.7-3 1.6c-.7.8-1.2 2-1.1 3.1c1.1.1 2.3-.6 3-1.5z"/></svg>`;
const MS = `<svg viewBox="0 0 24 24"><path fill="#F25022" d="M2 2h9.5v9.5H2z"/><path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z"/><path fill="#00A4EF" d="M2 12.5h9.5V22H2z"/><path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z"/></svg>`;

function renderAuth(){
  if (S.loading) return `<div class="loading"><img class="voro-load" src="${VORA_EMPTY}" alt="Fitma"><p>Just a moment…</p></div>`;
  return `<div class="auth">
  <section class="auth-art">
    <img class="bigmark" src="${LOGO_WHITE}" alt="">
    <div class="brandline"><img src="${LOGO_WHITE}" alt="Fitma logo"><div>Fitma<small>Workspace</small></div></div>
    <div class="auth-hero">
      <h1>Show up.<br>Deliver.<br>Watch it add up.</h1>
      <p class="auth-sub">Your shift, your hours and your monthly review — all in one place, updated straight from Fitma Tick.</p>
    </div>
    <p class="auth-foot">Fitma team only</p>
  </section>
  <section class="auth-panel">
    <form class="auth-card" id="auth-form" novalidate>
      <div><h2 style="font-size:25px">Sign in</h2><p class="muted" style="margin-top:4px">Use your Fitma email and password.</p></div>
      ${S.authMsg?`<div style="text-align:center"><img class="vora-fig" style="width:92px" src="${VORA_ERROR}" alt="" loading="lazy"></div><p class="note" style="background:var(--bad-soft);color:var(--bad);grid-template-columns:1fr">${esc(S.authMsg)}</p>`:''}
      ${DEMO?`<p class="note" style="grid-template-columns:1fr"><b>Demo preview.</b> Pick any account to look around. No password needed here.</p>
        <button type="button" class="btn primary" data-action="demo-pick">Choose a demo account</button>`
      :`<div class="field"><label for="f-email">Email</label><input id="f-email" type="email" placeholder="name@gmail.com" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
        <div class="field"><label for="f-pass">Password</label><div class="pw-wrap"><input id="f-pass" type="password" placeholder="Your password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false"><button type="button" class="pw-eye" data-action="toggle-pw" data-target="f-pass" aria-label="Show password">${icon('eye',18)}</button></div></div>
        <p class="hint" id="auth-msg">First time? Use the starter password from your admin. You'll set your own next.</p>
        <button class="btn primary" type="submit">Sign in</button><button type="button" class="link" data-action="forgot" style="justify-self:center;margin-top:-2px">Forgot your password?</button>`}
      <div class="note">${icon('key',18)}<p><b>Access note.</b> ${ACCESS_NOTE.replace(' the admin can reset a password here at any time.',' ask the admin if you can’t get in.')}</p></div>
    </form>
  </section>
  </div>${S.chooser?renderChooser():''}`;
}

function renderChangePw(){
  const forced = S.mustChange;
  return `<div class="auth"><section class="auth-art">
    <img class="bigmark" src="${LOGO_WHITE}" alt="">
    <div class="brandline"><img src="${LOGO_WHITE}" alt="Fitma logo"><div>Fitma<small>Workspace</small></div></div>
    <div class="auth-hero"><h1>${forced?'Set your own password':'Change password'}</h1>
      <p class="auth-sub">${forced?'You’re signed in with a starter password. Choose a new one only you know, then you’re in.':'Pick a new password for your account.'}</p></div>
    <p class="auth-foot">Fitma team only</p>
  </section>
  <section class="auth-panel"><form class="auth-card" id="pw-form" novalidate>
    <div><h2 style="font-size:23px">${forced?'Create a new password':'Change your password'}</h2></div>
    <div class="field"><label for="pw-old">${forced?'Starter password':'Current password'}</label><div class="pw-wrap"><input id="pw-old" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false"><button type="button" class="pw-eye" data-action="toggle-pw" data-target="pw-old" aria-label="Show password">${icon('eye',18)}</button></div></div>
    <div class="field"><label for="pw-new">New password</label><div class="pw-wrap"><input id="pw-new" type="password" placeholder="At least 8 characters" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false"><button type="button" class="pw-eye" data-action="toggle-pw" data-target="pw-new" aria-label="Show password">${icon('eye',18)}</button></div></div>
    <div class="field"><label for="pw-new2">Confirm new password</label><div class="pw-wrap"><input id="pw-new2" type="password" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false"><button type="button" class="pw-eye" data-action="toggle-pw" data-target="pw-new2" aria-label="Show password">${icon('eye',18)}</button></div></div>
    <p class="hint" id="pw-msg">Use at least 8 characters. Keep it private.</p>
    <button class="btn primary" type="submit">${forced?'Save and continue':'Save password'}</button>
    ${forced?'<button class="btn ghost" type="button" data-action="signout">Sign out</button>':'<button class="btn ghost" type="button" data-action="nav" data-v="profile">Cancel</button>'}
  </form></section></div>`;
}

function renderChooser(){
  const rows = [{id:'admin',name:'Fitma Admin',email:ADMIN.email,sub:'Admin'}, ...TEAM.map(e=>({id:e.id,name:e.name,email:accessEmail(e),sub:e.id}))];
  return `<div class="overlay" data-action="close-chooser"><div class="sheet" role="dialog" aria-label="Choose an account" data-stop="1">
    <div class="sheet-head"><span class="label">${esc(S.chooser)}</span><h3>Choose an account</h3><p class="muted small">Only registered addresses can continue to Fitma Workspace.</p></div>
    ${rows.map(a=>`<button class="acct" data-action="signin" data-id="${a.id}" ${a.email?'':'disabled'}>${avatar(a.id==='admin'?null:empById(a.id))}<span style="min-width:0"><b>${esc(a.name)}</b><small>${a.email?esc(a.email):'No email registered yet. Can’t sign in'} · ${esc(a.sub)}</small></span></button>`).join('')}
  </div></div>`;
}

// =========================================================================
//  SHELL
// =========================================================================
const EMP_NAV = [['home','Home','home'],['attendance','Attendance','att'],['projects','Projects','proj'],['reviews','Reviews','rev'],['download','Fitma Tick','dl'],['profile','Profile','prof']];
const ADM_NAV = [['pulse','Team pulse','home'],['compare','Compare','cmp'],['teamatt','Attendance','att'],['teamproj','Projects','proj'],['teamrev','Reviews','rev'],['shots','Screenshots','eye'],['activity','Activity & sites','cmp'],['access','Team & access','key'],['payslips','Payslips','rev'],['settings','Settings','set']];
function renderApp(){
  const adminHome = isAdmin() && !S.viewing;
  const nav = adminHome ? ADM_NAV : (isAdmin() && S.viewing ? [['eval','Evaluation','cmp'], ...EMP_NAV] : EMP_NAV);
  if (!S.view || !nav.find(n=>n[0]===S.view)) S.view = nav[0][0];
  const me = isAdmin()? null : empById(S.user), mp = me? profileOf(me) : {name:'Fitma Admin'};
  const pendingAccess = TEAM.filter(e=>!accessEmail(e)).length;
  const badge = k => (k==='access'&&pendingAccess)? `<span class="badge">${pendingAccess}</span>`:'';
  return `<div class="app ${S.railCollapsed?'rail-collapsed':''}">
    <aside class="rail">
      <div class="rail-head"><div class="brandline"><img src="${LOGO_WHITE}" alt="Fitma logo"><div>Fitma<small>Workspace</small></div></div><button class="rail-toggle" data-action="toggle-rail" aria-label="${S.railCollapsed?'Expand menu':'Collapse menu'}" title="${S.railCollapsed?'Expand menu':'Collapse menu'}">${icon(S.railCollapsed?'chev-right':'chev-left',18)}</button></div>
      <nav class="nav" aria-label="Main"><div class="label">${adminHome?'Admin':isAdmin()?esc(subject().name)+"'s space":'My workspace'}</div>
        ${nav.map(([k,l,ic])=>`<button class="${S.view===k?'on':''}" data-action="nav" data-v="${k}" ${S.view===k?'aria-current="page"':''} title="${l}">${icon(ic)}<span class="lbl">${l}</span>${badge(k)}</button>`).join('')}</nav>
      <div class="rail-foot">
        <div class="me">${avatar(me)}<div class="grow"><div>${esc(mp.name)}</div><small>${me?'ID '+me.id:'Admin'}</small></div></div>
        <button class="btn sm" data-action="changepw" title="Change password">${icon('key',16)}<span class="lbl">Change password</span></button><button class="btn sm" data-action="signout" title="Sign out">${icon('logout',16)}<span class="lbl">Sign out</span></button>
      </div>
    </aside>
    <div style="min-width:0">
      <header class="topbar"><div class="brandline"><img src="${LOGO_WHITE}" alt="Fitma logo"><div>Fitma</div></div><div style="display:flex;gap:8px;align-items:center">${avatar(me,'sm')}<button class="btn sm" data-action="signout">Sign out</button></div></header>
      <main class="main"><div class="wrap">
        ${isAdmin()&&S.viewing?`<div class="adminbar"><span>Viewing ${esc(subject().name)}'s workspace as admin</span><button class="btn sm" data-action="back-team">Back to team</button></div>`:''}
        ${route()}
      </div></main>
    </div>
    <nav class="tabbar" aria-label="Main">${nav.map(([k,l,ic])=>`<button class="${S.view===k?'on':''}" data-action="nav" data-v="${k}">${icon(ic,20)}${l.split(' ')[0]}</button>`).join('')}</nav>
  </div>${S.preview?renderPreview():''}`;
}
function route(){
  if (isAdmin() && !S.viewing) return ({pulse:aPulse,compare:aCompare,teamatt:aAtt,teamproj:aProj,teamrev:aRev,shots:aShots,activity:aActivity,access:aAccess,payslips:aPayslips,settings:aSettings}[S.view]||aPulse)();
  const e = subject();
  if (isAdmin() && S.viewing && (S.view==='eval' || !S.view)) return aEval(e);
  return ({home:eHome,attendance:eAtt,projects:eProj,reviews:eRev,download:pDownload,profile:eProfile}[S.view]||eHome)(e);
}

// =========================================================================
//  EMPLOYEE
// =========================================================================
function weekDays(emp){
  const mon = new Date(DATA_END); mon.setDate(DATA_END.getDate()-((DATA_END.getDay()+6)%7));
  return Array.from({length:5},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return {d, day:(DAYS[emp.id]||{})[key(d)] || {status:'nodata',sessions:[],shifts:[]}}; });
}
const QUOTES=[
{t:"The secret of getting ahead is getting started.",a:"Mark Twain"},
{t:"Quality is not an act, it is a habit.",a:"Aristotle"},
{t:"Success is the sum of small efforts repeated day in and day out.",a:"Robert Collier"},
{t:"Your work is going to fill a large part of your life, so do it well.",a:"Steve Jobs"},
{t:"Do the hard jobs first. The easy jobs will take care of themselves.",a:"Dale Carnegie"},
{t:"It always seems impossible until it is done.",a:"Nelson Mandela"},
{t:"Discipline is the bridge between goals and accomplishment.",a:"Jim Rohn"},
{t:"Great things are done by a series of small things brought together.",a:"Vincent van Gogh"},
{t:"Start where you are. Use what you have. Do what you can.",a:"Arthur Ashe"},
{t:"The way to get started is to quit talking and begin doing.",a:"Walt Disney"},
{t:"Punctuality is the politeness of kings.",a:"Louis XVIII"},
{t:"Well begun is half done.",a:"Aristotle"},
{t:"Either you run the day or the day runs you.",a:"Jim Rohn"},
{t:"Focus on being productive instead of busy.",a:"Tim Ferriss"},
{t:"Small deeds done are better than great deeds planned.",a:"Peter Marshall"},
{t:"Don't watch the clock; do what it does. Keep going.",a:"Sam Levenson"},
{t:"Amateurs sit and wait for inspiration; the rest of us just get up and go to work.",a:"Stephen King"},
{t:"The future depends on what you do today.",a:"Mahatma Gandhi"},
{t:"Motivation gets you going, but discipline keeps you growing.",a:"John C. Maxwell"},
{t:"You don't have to be great to start, but you have to start to be great.",a:"Zig Ziglar"},
{t:"Hard work beats talent when talent doesn't work hard.",a:"Tim Notke"},
{t:"Success usually comes to those too busy to be looking for it.",a:"Henry David Thoreau"},
{t:"A year from now you may wish you had started today.",a:"Karen Lamb"},
{t:"Productivity is never an accident. It is always the result of commitment to excellence.",a:"Paul J. Meyer"},
{t:"Do what you can, with what you have, where you are.",a:"Theodore Roosevelt"},
{t:"The expert in anything was once a beginner.",a:"Helen Hayes"},
{t:"Setting goals is the first step in turning the invisible into the visible.",a:"Tony Robbins"},
{t:"Excellence is doing ordinary things extraordinarily well.",a:"John W. Gardner"},
{t:"If you get tired, learn to rest, not to quit.",a:"Banksy"},
{t:"Opportunities don't happen. You create them.",a:"Chris Grosser"},
{t:"The only way to do great work is to love what you do.",a:"Steve Jobs"},
{t:"Continuous improvement is better than delayed perfection.",a:"Mark Twain"},
{t:"Today's accomplishments were yesterday's impossibilities.",a:"Robert H. Schuller"},
{t:"Make each day your masterpiece.",a:"John Wooden"},
{t:"Your attitude, not your aptitude, will determine your altitude.",a:"Zig Ziglar"},
{t:"The difference between ordinary and extraordinary is that little extra.",a:"Jimmy Johnson"},
{t:"Work hard in silence, let your success be your noise.",a:"Frank Ocean"},
{t:"A goal without a plan is just a wish.",a:"Antoine de Saint-Exupery"},
{t:"Done is better than perfect.",a:"Sheryl Sandberg"},
{t:"Energy and persistence conquer all things.",a:"Benjamin Franklin"},
{t:"Believe you can and you're halfway there.",a:"Theodore Roosevelt"},
{t:"The best preparation for tomorrow is doing your best today.",a:"H. Jackson Brown Jr."},
{t:"Little by little, one travels far.",a:"J.R.R. Tolkien"},
{t:"Success is not final; failure is not fatal: it is the courage to continue that counts.",a:"Winston Churchill"},
{t:"Act as if what you do makes a difference. It does.",a:"William James"},
{t:"The harder you work for something, the greater you'll feel when you achieve it.",a:"Anonymous"},
{t:"Don't count the days, make the days count.",a:"Muhammad Ali"},
{t:"Strive for progress, not perfection.",a:"Anonymous"},
{t:"Great work is done by people who are not afraid to be great.",a:"Fernando Flores"},
{t:"What you do today can improve all your tomorrows.",a:"Ralph Marston"},
{t:"Be so good they can't ignore you.",a:"Steve Martin"},
{t:"Dreams don't work unless you do.",a:"John C. Maxwell"},
{t:"The man who moves a mountain begins by carrying away small stones.",a:"Confucius"},
{t:"Perseverance is not a long race; it is many short races one after the other.",a:"Walter Elliot"},
{t:"Nothing will work unless you do.",a:"Maya Angelou"},
{t:"Success is walking from failure to failure with no loss of enthusiasm.",a:"Winston Churchill"},
{t:"The only limit to our realization of tomorrow is our doubts of today.",a:"Franklin D. Roosevelt"},
{t:"Do something today that your future self will thank you for.",a:"Sean Patrick Flanery"},
{t:"Discipline equals freedom.",a:"Jocko Willink"},
{t:"If it is important to you, you will find a way. If not, you will find an excuse.",a:"Ryan Blair"},
{t:"Consistency is what transforms average into excellence.",a:"Anonymous"},
{t:"Push yourself, because no one else is going to do it for you.",a:"Anonymous"},
{t:"The key is not to prioritize what's on your schedule, but to schedule your priorities.",a:"Stephen Covey"},
{t:"You miss 100% of the shots you don't take.",a:"Wayne Gretzky"},
{t:"Whether you think you can or you think you can't, you're right.",a:"Henry Ford"},
{t:"Begin anywhere.",a:"John Cage"},
{t:"Ideas are easy. Implementation is hard.",a:"Guy Kawasaki"},
{t:"Simplicity is the soul of efficiency.",a:"Austin Freeman"},
{t:"Working hard becomes a habit, a serious kind of fun.",a:"Sir Alex Ferguson"},
{t:"Be miserable. Or motivate yourself. Whatever has to be done, it's always your choice.",a:"Wayne Dyer"},
{t:"Today is always the most productive day of your week.",a:"Mark Hunter"},
{t:"Ambition is the path to success. Persistence is the vehicle you arrive in.",a:"Bill Bradley"},
{t:"Don't be afraid to give up the good to go for the great.",a:"John D. Rockefeller"},
{t:"A little progress each day adds up to big results.",a:"Anonymous"},
{t:"The best way to predict the future is to create it.",a:"Peter Drucker"},
{t:"Trust the process. Your time is coming.",a:"Anonymous"},
{t:"Falling down is an accident. Staying down is a choice.",a:"Rosemary Nonny Knight"},
{t:"You don't need to see the whole staircase, just take the first step.",a:"Martin Luther King Jr."},
{t:"Hard work keeps the wrinkles out of the mind and spirit.",a:"Helena Rubinstein"},
{t:"Make it happen. Shock everyone.",a:"Anonymous"},
{t:"Success doesn't come to you, you go to it.",a:"Marva Collins"},
{t:"Be stronger than your excuses.",a:"Anonymous"},
{t:"The secret of your future is hidden in your daily routine.",a:"Mike Murdock"},
{t:"Stay focused and never give up.",a:"Anonymous"},
{t:"A dream becomes a goal when action is taken toward its achievement.",a:"Bo Bennett"},
{t:"Do it with passion or not at all.",a:"Rosa Nouchette Carey"},
{t:"Your only limit is you. Be brave and fearless.",a:"Anonymous"},
{t:"Work until your idols become your rivals.",a:"Anonymous"},
{t:"One hour of focused work is worth a day of distraction.",a:"Anonymous"},
{t:"Great attitude becomes a great day, which becomes a great month, a great year, a great life.",a:"Mandy Hale"},
{t:"Be the energy you want to attract.",a:"Anonymous"},
{t:"Success is liking yourself, liking what you do, and liking how you do it.",a:"Maya Angelou"}
];
function quoteOfDay(){ var d=Math.floor((Date.now()+330*60000)/864e5); var i=((d%QUOTES.length)+QUOTES.length)%QUOTES.length; return QUOTES[i]; }
function projBoard(emp){
  var mine=myProjects(emp); var c={todo:[],prog:[],done:[]};
  mine.forEach(function(p){ var k=projStatus(p).k; if(k==='done')c.done.push(p); else if(k==='todo')c.todo.push(p); else c.prog.push(p); });
  var col=function(title,arr){ return `<div class="pcol"><div class="pcol-head"><span>${title}</span><span class="n">${arr.length}</span></div>`+
    (arr.length?arr.map(function(p){var st=projStatus(p);return `<div class="pcard2" style="border-left-color:${projColor(p.name)}" data-action="projcard" data-k="${esc(p.key)}"><b>${esc(p.name)}</b><div class="meta"><span class="chip ${st.chip}">${st.label}</span>${p.deadline?`<span class="muted small">Due ${fmtShort(p.deadline)}</span>`:(p.completed?`<span class="muted small">Done ${fmtShort(p.completed)}</span>`:'')}</div></div>`;}).join(''):'<div class="empty">Nothing here</div>')+`</div>`; };
  if(!mine.length) return `<div class="card"><div class="card-head"><div><h3>Your projects</h3></div></div><p class="muted">No projects assigned yet. They'll show up here as a board once your admin adds them.</p></div>`;
  return `<div style="margin-bottom:18px"><div class="card-head" style="padding:0 2px 2px"><div><h3>Your projects</h3><p>Tap any card to see the full details.</p></div><button class="btn sm ghost" data-action="nav" data-v="projects">Open projects</button></div>
    <div class="pboard">${col('To do',c.todo)}${col('In progress',c.prog)}${col('Completed',c.done)}</div></div>`;
}
function showProjDetail(k){
  var p=PROJECTS.find(function(x){return String(x.key)===String(k);}); if(!p)return;
  var st=projStatus(p);
  var tasks=TASKLIST.filter(function(t){return t.project===p.name;}).sort(function(a,b){return (a.due||8.64e15)-(b.due||8.64e15);});
  var o=document.querySelector('.overlay.projdetail'); if(o)o.remove();
  o=document.createElement('div'); o.className='overlay projdetail';
  o.innerHTML=`<div class="modal" data-stop="1" style="max-width:520px"><div class="modal-head"><div><span class="label" style="display:inline-flex;align-items:center;gap:8px"><span class="tag" style="background:${projColor(p.name)};margin:0"></span>Project</span><h3>${esc(p.name)}</h3></div><button class="btn sm" data-close>Close</button></div>
    <div class="modal-body" style="padding:20px;display:grid;gap:14px">
      <div><span class="chip ${st.chip}">${st.label}</span></div>
      <div class="list small"><div class="li"><span class="muted">Assigned</span><span>${p.start?fmtShort(p.start):'—'}</span></div><div class="li"><span class="muted">Deadline</span><span>${p.deadline?fmtShort(p.deadline):'—'}</span></div><div class="li"><span class="muted">Completed</span><span>${p.completed?fmtShort(p.completed):'—'}</span></div></div>
      ${tasks.length?`<div><div class="muted small" style="margin-bottom:8px;font-weight:700;letter-spacing:.03em;text-transform:uppercase">Tasks (${tasks.length})</div><div class="list small">${tasks.map(function(t){return `<div class="li"><div class="grow"><div class="t1">${esc(t.title)}</div>${t.desc?`<div class="t2">${esc(t.desc)}</div>`:''}</div>${taskChip(t.status)}</div>`;}).join('')}</div></div>`:'<p class="muted small">No individual tasks logged under this project yet.</p>'}
    </div></div>`;
  o.addEventListener('click',function(ev){ if(ev.target.closest('[data-close]')||!ev.target.closest('[data-stop]')) o.remove(); });
  document.body.appendChild(o);
}
function eHome(emp){
  const m = metrics(emp,CUR), s=m.scores, p=profileOf(emp), [g,gc]=grade(s.overall, m), live=liveStatus(emp), st=streak(emp), bd=badges(emp,CUR);
  const hello = NOW.getHours()<12?'Good morning':NOW.getHours()<17?'Good afternoon':'Good evening';
  const due = TASKLIST.filter(t=>t.emp===emp.id && !t.done && (t.ym===CUR)).sort((a,b)=>(a.due||8.64e15)-(b.due||8.64e15)).slice(0,4);
  const filled = [p.position,p.location,p.wa,p.photo].filter(Boolean).length;
  const factors = m.founder ? [['On-time delivery',s.delivery,'all of your score']] :
    [['Punctuality',s.punctuality,'25%'],['Full shifts',s.completion,'15%'],['Attendance',s.attendance,'20%'],['Hours',s.hours,'15%'],['On-time delivery',s.delivery,'25%']];
  return `
  <section class="hero">
    <img class="bigmark" src="${LOGO_WHITE}" alt="">
    <div style="position:relative;min-width:0">
      <div class="eyebrow">${fmtD(new Date())} · ${PLAN_LABEL[emp.plan]}</div>
      <h1>${hello}, ${esc(p.name)}</h1>
      <div class="live" id="live">${liveHTML(live)}</div>
    </div>
    <div class="hero-side">${ring(s.overall,112,9,'this month','on-dark','rgba(255,255,255,.14)','#d8dde0')}<span class="chip" style="background:rgba(255,255,255,.12);color:var(--on-navy)">${g}</span></div>
  </section>

  <div class="qcard"><img src="${VORA_SUCCESS}" alt="Fitma"><div>${(function(q){return `<div class="qt">“${esc(q.t)}”</div>`;})(quoteOfDay())}</div></div>

  ${projBoard(emp)}

  ${filled<4?`<div class="nudge"><div><b>Finish your profile</b><p class="muted small">${4-filled} detail${4-filled>1?'s':''} missing. They appear on your monthly report.</p></div><div style="display:flex;gap:12px;align-items:center"><div class="meter"><i style="width:${filled/4*100}%"></i></div><button class="btn sm primary" data-action="nav" data-v="profile">Complete profile</button></div></div>`:''}

  <div class="card"><div class="card-head"><div><h3>This week</h3><p>Hover a day to see your times</p></div><button class="btn sm ghost" data-action="nav" data-v="attendance">Full calendar</button></div>
    <div class="week">${weekDays(emp).map(({d,day})=>{ const [l]=STATUS[day.status]||['']; const tr=day.sessions.reduce((a,x)=>a+x.out-x.in,0);
      return `<div class="wd" title="${esc(day.sessions.map(x=>fmtT(x.in)+'–'+fmtT(x.out)).join(', ')||l)}"><div class="top"><span>${DN[d.getDay()]} ${d.getDate()}</span><span class="pin p-${day.status}"></span></div><div class="st">${l}</div><div class="t">${day.sessions.length?`In ${fmtT(day.sessions[0].in)} · ${fmtH(tr)}`:(day.reason?esc(day.reason):'—')}</div></div>`;}).join('')}</div>
  </div>

  <div class="grid g-main">
    <div class="card"><div class="card-head"><div><h3>Your month so far</h3><p>${monthLabel(CUR)}, updated every morning</p></div><span class="chip ${gc}">${g}</span></div>
      <div class="scorebox">${ring(s.overall,128,11)}
        <div class="factors">${factors.map(([l,v,w])=>`<div class="factor"><span>${l} <span class="muted small">${w}</span></span><b>${pct(v)}</b><div class="track"><i style="width:${Math.max(2,v)}%;background:${ringColor(v)}"></i></div></div>`).join('')}</div></div>
      <details class="how"><summary>How is my score worked out?</summary><ul>
        ${m.founder?'<li>Founders work flexible hours, so only on-time delivery of tasks is scored.</li>':`
        <li><b>Punctuality</b>: shifts started on time. One minute late counts, and each late minute takes a little more off.</li>
        <li><b>Full shifts</b>: shifts worked to the scheduled end.</li>
        <li><b>Attendance</b>: days worked. Leave counts back in when you make up the hours.</li>
        <li><b>Hours</b>: time tracked in Fitma Tick against your schedule.</li>`}
        <li><b>On-time delivery</b>: tasks finished on or before the due date.</li></ul></details>
    </div>
    <div class="grid" style="align-content:start">
      ${m.founder?'':`<div class="card"><div class="card-head"><h3>On-time streak</h3></div><div class="streak"><b>${st.cur}</b><span class="muted">working day${st.cur===1?'':'s'} in a row</span></div><p class="muted small" style="margin-top:6px">Best run: ${st.best} days. Leave and late starts reset it.</p></div>`}
      <div class="card"><div class="card-head"><h3>Due next</h3><button class="btn sm ghost" data-action="nav" data-v="projects">Board</button></div>
        <div class="list">${due.length?due.map(t=>`<div class="li"><div class="grow"><div class="t1">${esc(t.title)}</div><div class="t2"><span class="tag" style="background:${projColor(t.project)}"></span>${esc(t.project)}</div></div><span class="chip ${t.status==='overdue'?'c-bad':'c-off'}">${dueLabel(t)}</span></div>`).join(''):'<div style="text-align:center;padding:4px 0"><img class="vora-fig" style="width:86px" src="'+VORA_SUCCESS+'" alt="" loading="lazy"><p class="muted">Nothing open. Nice work.</p></div>'}</div></div>
    </div>
  </div>

  <div class="card"><div class="card-head"><div><h3>This month's milestones</h3><p>${bd.filter(b=>b.ok).length} of ${bd.length} reached</p></div></div>
    <div class="badges">${bd.map(b=>`<div class="bdg ${b.ok?'':'locked'}"><span class="ic">${icon(b.ic,20)}</span><div><b>${b.t}</b><span>${b.d}</span></div></div>`).join('')}</div></div>`;
}
function liveHTML(live){
  return `<p class="msg">${live.msg}</p>
    ${live.prog!==null && live.prog<100?`<div class="shiftbar" aria-label="Shift progress"><i style="width:${live.prog.toFixed(1)}%"></i></div>`:''}
    ${live.slots.length?`<div class="slots">${live.slots.map(x=>`<span class="slot ${x.state}">${fmtT(x.s)} – ${fmtT(x.e)}</span>`).join('')}</div>`:''}`;
}

function eAtt(emp){
  const ym=S.month, m=metrics(emp,ym), offset=(dateOf(ym,1).getDay()+6)%7;
  const validSel = S.selDay && S.selDay.startsWith(ym) && DAYS[emp.id][S.selDay];
  const lw = [...m.days].reverse().find(x=>x.sessions.length||['leave','covered'].includes(x.status));
  const sel = validSel ? S.selDay : (lw? lw.k : key(dateOf(ym,1)));
  const cells = Array.from({length:offset},()=>'<div class="day blank"></div>');
  m.days.forEach(x=>{ const dim = ['weekend','future','off','nodata'].includes(x.status);
    const late = x.sessions.reduce((a,s)=>a+(s.late||0),0);
    const lbl = {ontime:'On time',late:`${late}m late`,early:'Left early',lateearly:'Late + early',leave:'Leave',covered:'Made up',flex:fmtH(x.sessions.reduce((a,s)=>a+s.out-s.in,0))}[x.status]||'';
    cells.push(`<button class="day s-${x.status} ${dim?'dim':''} ${x.k===sel?'sel':''}" ${dim&&!x.sessions.length?'disabled':''} data-action="selday" data-k="${x.k}" aria-label="${fmtD(x.d)}: ${STATUS[x.status]?.[0]||''}"><span class="d">${x.d.getDate()}</span><span><span class="st" style="display:block">${lbl}</span><span class="t" style="display:block">${x.sessions.length?'In '+fmtT(x.sessions[0].in):''}</span></span></button>`); });
  const D = DAYS[emp.id][sel], sd = new Date(sel+'T00:00');
  const ex = m.days.filter(x=>['late','early','lateearly','leave','covered'].includes(x.status)).reverse();
  return `<div class="pagehead"><div><h1>Attendance</h1><p>${emp.plan==='founder'?'Flexible schedule. Your logged days and hours.':'Shifts start sharp. Tap any day to see exactly when you started and finished.'}</p></div>${monthSelect('m-att',ym)}</div>
  ${m.founder?'':`<div class="kpis">
    <div class="kpi"><span class="label">Late starts</span><span class="v">${m.lateCount}</span><span class="s">${m.lateMin} min in total</span></div>
    <div class="kpi"><span class="label">Left early</span><span class="v">${m.earlyCount}</span><span class="s">${m.earlyMin} min short</span></div>
    <div class="kpi"><span class="label">Leave</span><span class="v">${m.leave}<small> day${m.leave===1?'':'s'}</small></span><span class="s">${m.leave?`${fmtH(m.coverMin)} of ${fmtH(m.lostMin)} made up`:'None taken'}</span></div>
    <div class="kpi"><span class="label">Hours</span><span class="v">${Math.floor(m.trackedMin/60)}<small> / ${Math.round(m.requiredMin/60)} h</small></span><span class="s">${fmtH(m.overtimeMin)} extra</span></div></div>`}
  <div class="grid g-main">
    <div class="card"><div class="card-head"><h3>${monthLabel(ym)}</h3>
      <div class="legend"><span><i class="pin p-ontime"></i>On time</span><span><i class="pin p-late"></i>Late</span><span><i class="pin p-early"></i>Left early</span><span><i class="pin p-leave"></i>Leave</span><span><i class="pin p-covered"></i>Made up</span></div></div>
      <div class="cal">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<div class="dh">${x}</div>`).join('')}${cells.join('')}</div></div>
    <div class="card" style="align-self:start"><div class="card-head"><div><span class="label">Selected day</span><h3>${fmtD(sd)}</h3></div>${statusChip(D.status)}</div>
      ${dayDetail(emp,D,sd)}</div>
  </div>
  ${m.founder?'':`<div class="card"><div class="card-head"><div><h3>Reminders & Notes</h3><p>Every late start, early finish and leave day this month</p></div><span class="chip ${ex.length?'c-warn':'c-good'}">${ex.length} recorded</span></div>
  ${ex.length?`<div class="list">${ex.map(x=>{const sh=x.sessions.filter(s=>s.kind==='shift'), l=sh.reduce((a,s)=>a+s.late,0), e=sh.reduce((a,s)=>a+s.early,0);
    const what = ['leave','covered'].includes(x.status)? `${esc(x.reason)} · ${fmtH(x.lost)} missed${x.covered?`, ${fmtH(x.covered)} made up`:', not made up'}` : [l?`Started ${l} min late`:'', e?`Finished ${e} min early`:''].filter(Boolean).join(' · ');
    return `<button class="li" style="width:100%;background:none;border-left:0;border-right:0;border-top:0;text-align:left;cursor:pointer;color:inherit" data-action="selday" data-k="${x.k}"><div class="grow"><div class="t1">${fmtD(x.d)}</div><div class="t2">${what}</div></div>${statusChip(x.status)}</button>`;}).join('')}</div>`
  :'<p class="muted">Clean month. No late starts, early finishes or leave.</p>'}</div>`}`;
}
function dayDetail(emp, D, d){
  if (D.status==='future') return '<p class="muted">This day hasn’t happened yet.</p>';
  if (['leave','covered'].includes(D.status)) {
    const mk = []; Object.entries(DAYS[emp.id]).forEach(([k,x])=>x.sessions.forEach(s=>{ if(s.cover===key(d)) mk.push({k,s}); }));
    return `<p><b>${esc(D.reason)}</b></p><p class="muted small" style="margin-top:4px">${fmtH(D.lost)} of scheduled time missed.</p>
      <div class="list" style="margin-top:10px">${mk.length?mk.map(({k,s})=>`<div class="li"><div class="grow"><div class="t1">Made up on ${fmtD(new Date(k+'T00:00'))}</div><div class="t2">${fmtT(s.in)} – ${fmtT(s.out)}</div></div><b class="num">${fmtH(s.out-s.in)}</b></div>`).join(''):'<p class="muted small">No time made up yet.</p>'}</div>`;
  }
  if (!D.sessions.length) return '<p class="muted">No time logged on this day.</p>';
  const lo=480, hi=1200, x=v=>((Math.max(lo,Math.min(hi,v))-lo)/(hi-lo)*100).toFixed(2);
  return `<div class="tl"><div class="tl-bar">${D.sessions.map(s=>`<span class="act ${s.kind==='makeup'?'mk':''}" style="left:${x(s.in)}%;width:${Math.max(.8,x(s.out)-x(s.in))}%"></span>`).join('')}</div>
    <div class="tl-axis"><span>8 AM</span><span>11</span><span>2 PM</span><span>5</span><span>8 PM</span></div>
    <div class="legend"><span><i class="pin p-ontime"></i>Tracked</span><span><i class="pin" style="background:var(--steel-2)"></i>Make-up</span></div></div>
    <div class="list" style="margin-top:8px">${D.sessions.map(s=>`<div class="li"><div class="grow"><div class="t1 num">${fmtT(s.in)} – ${fmtT(s.out)}</div><div class="t2">${s.kind==='makeup'?'Make-up time for leave':s.kind==='flex'?'Tracked session':`Shift ${fmtT(s.s)} – ${fmtT(s.e)}`}</div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${s.late?`<span class="chip c-warn">${s.late} min late</span>`:''}${s.early?`<span class="chip c-early">${s.early} min early</span>`:''}${s.kind==='shift'&&!s.late&&!s.early?'<span class="chip c-good">On time</span>':''}${s.ot>=15?`<span class="chip c-info">+${s.ot} min</span>`:''}</div></div>`).join('')}</div>`;
}

function projectSummary(tasks){
  const by={}; tasks.forEach(t=>{(by[t.project] ||= []).push(t);});
  return Object.entries(by).map(([name,ts])=>({name,ts,total:ts.length,done:ts.filter(t=>t.done).length,ontime:ts.filter(t=>t.status==='ontime').length,late:ts.filter(t=>t.status==='late').length,overdue:ts.filter(t=>t.status==='overdue').length,open:ts.filter(t=>['progress','todo'].includes(t.status)).length})).sort((a,b)=>b.total-a.total);
}
function board(tasks, showOwner){
  const cols = [['todo','Not started',t=>t.status==='todo'],['progress','In progress',t=>t.status==='progress'],['overdue','Overdue',t=>t.status==='overdue'],['done','Done',t=>!!t.done]];
  return `<div class="board">${cols.map(([k,l,f])=>{ const ts=tasks.filter(f).sort((a,b)=>(a.due||8.64e15)-(b.due||8.64e15));
    return `<div class="col"><div class="col-h">${l}<span>${ts.length}</span></div>${ts.map(t=>`<div class="task"><div class="pj"><span class="tag" style="background:${projColor(t.project)}"></span><span>${esc(t.project)}</span></div><b>${esc(t.title)}</b>${t.desc?`<div class="muted small" style="margin-top:2px">${esc(t.desc)}</div>`:''}
      <div class="meta"><span>${dueLabel(t)}</span>${showOwner?`<span class="person" style="font-weight:600">${avatar(empById(t.emp),'sm')}</span>`:t.status==='late'?'<span class="chip c-warn">Late</span>':t.status==='ontime'?'<span class="chip c-good">On time</span>':''}</div></div>`).join('')||'<div class="empty-col">Nothing here</div>'}</div>`;}).join('')}</div>`;
}
function projCards(ps, total){
  return `<div class="projrow"><button class="pcard ${S.projFilter==='all'?'on':''}" data-action="pfilter" data-p="all"><span class="label">All projects</span><span class="pct">${total.done}/${total.total}</span><span class="muted small">tasks completed</span></button>
   ${ps.map(p=>`<button class="pcard ${S.projFilter===p.name?'on':''}" data-action="pfilter" data-p="${esc(p.name)}"><span class="pj label" style="display:flex;align-items:center;gap:6px"><span class="tag" style="background:${projColor(p.name)};margin:0"></span>${esc(p.name)}</span><span class="pct">${Math.round(p.done/p.total*100)}%</span>
     <div class="seg">${[['ontime','var(--good)'],['late','var(--warn)'],['overdue','var(--bad)'],['open','var(--sky)']].map(([k,c])=>p[k]?`<i style="width:${p[k]/p.total*100}%;background:${c}"></i>`:'').join('')}</div>
     <span class="muted small">${p.done} of ${p.total} done${p.overdue?` · ${p.overdue} overdue`:''}</span></button>`).join('')}</div>`;
}
function fmtShort(k){ try{ const d=parseKey(k); return `${d.getDate()} ${MN[d.getMonth()].slice(0,3)}`; }catch(e){ return k||'—'; } }
function projStatus(p){
  if (p.completed || p.status==='done') return {k:'done', label:'Completed', chip:'c-good'}; if (p.status==='paused') return {k:'paused', label:'Paused', chip:'c-off'};
  const due = p.deadlineD;
  if (due && due < TODAY) return {k:'overdue', label:'Overdue', chip:'c-bad'};
  if (due){ const days=Math.ceil((due-TODAY)/864e5); if (days<=2) return {k:'soon', label:'Due soon', chip:'c-warn'}; }
  if (p.start || p.status==='progress') return {k:'progress', label:'On track', chip:'c-info'};
  return {k:'todo', label:'Not started', chip:''};
}
const PROJ_ORDER = {overdue:0, soon:1, progress:2, paused:3, todo:4, done:5};
function myProjects(emp){ return PROJECTS.filter(p=>String(p.empId)===String(emp.id))
  .sort((a,b)=>(PROJ_ORDER[projStatus(a).k]-PROJ_ORDER[projStatus(b).k]) || String(b.start).localeCompare(String(a.start))); }
function projList(emp, canEdit){
  const mine = myProjects(emp);
  if (!mine.length) return `<div class="card"><p class="muted">No projects assigned yet.${canEdit?' Use “Assign project” to add one.':''}</p></div>`;
  return `<div class="card" style="padding:0">${mine.map((p,i)=>{ const st=projStatus(p);
    return `<div style="padding:15px 18px;${i?'border-top:1px solid #e9ecf1;':''}display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px">
      <span class="tag" style="background:${projColor(p.name)};margin:0;flex:0 0 auto"></span>
      <b style="flex:1 1 220px;min-width:0">${esc(p.name)}</b>
      <span class="chip ${st.chip}">${st.label}</span>
      <span class="muted small" style="flex:0 0 auto">Start ${fmtShort(p.start)} · Due ${fmtShort(p.deadline)}${p.completed?` · Done ${fmtShort(p.completed)}`:''}</span>
      ${canEdit?`<button class="btn sm" data-action="editproj" data-k="${esc(p.key)}">Set dates</button>`:''}
    </div>`; }).join('')}</div>`;
}
function eProj(emp){
  const ym = S.month || CUR;
  const log = dailyLog(emp,ym);
  const canEdit = isAdmin();
  return `<div class="pagehead"><div><h1>Projects</h1><p>Projects assigned to ${esc(profileOf(emp).name)}. Status follows the start and deadline dates.</p></div>${canEdit?`<button class="btn primary" data-action="assignproj" data-e="${emp.id}">Assign project</button> <button class="btn" data-action="assigntask" data-e="${emp.id}">Assign task</button>`:''}</div>
  ${projList(emp, canEdit)}
  ${empTasksCard(emp)}
  <div class="card"><div class="card-head"><div><h3>Daily progress</h3><p>Hours and work from the tracker, most recent first</p></div></div>
    <div class="list">${log.map(r=>`<div class="li"><div class="grow"><div class="t1">${fmtD(r.d)}</div><div class="t2">${r.items.length?r.items.map(t=>`<span class="tag" style="background:${projColor(t.project)}"></span>${esc(t.title)}`).join(' &nbsp; '):'General work'}</div></div><b class="num">${fmtH(r.mins)}</b></div>`).join('')||'<p class="muted">No tracked days yet.</p>'}</div></div>`;
}
function dailyLog(emp, ym){
  const rows=[]; const ks = Object.keys(DAYS[emp.id]).filter(k=>k.startsWith(ym)).sort().reverse();
  for (const k of ks){ const day=DAYS[emp.id][k]; if(!day.sessions.length||day.status==='future') continue;
    const d=new Date(k+'T00:00'), mins=day.sessions.reduce((a,s)=>a+s.out-s.in,0);
    const items = TASKLIST.filter(t=>t.emp===emp.id && t.assigned<=d && (t.done? t.done>=d : true) && t.due>=new Date(d.getTime()-4*864e5)).slice(0,2);
    rows.push({d,mins,items}); if(rows.length>=7) break; }
  return rows;
}

function eRev(emp){
  if (!S.revMonth || !MONTHS.includes(S.revMonth)) S.revMonth = [...MONTHS].reverse().find(m=>isAdmin()||isUnlocked(m)) || MONTHS[MONTHS.length-1];
  const ym=S.revMonth, open = isAdmin()||isUnlocked(ym);
  const tabs = `<div class="monthtabs">${MONTHS.map(m=>{const o=isAdmin()||isUnlocked(m); const sc=metrics(emp,m).scores.overall;
    return `<button class="mtab ${m===ym?'on':''}" data-action="revm" data-m="${m}"><b>${monthLabel(m)}</b><span>${o?`Score ${Math.round(sc)} · ${grade(sc)[0]}`:`${icon('lock',13)} Opens ${fmtD(unlockDate(m))}`}</span></button>`;}).join('')}</div>`;
  let body;
  if (!open){ const days = Math.max(1,Math.ceil((unlockDate(ym)-NOW)/864e5));
    body = `<div class="card locked-panel"><span class="avatar md" style="background:var(--brand-soft);color:var(--brand)">${icon('lock',22)}</span><div class="bignum">${days}</div><h3>day${days===1?'':'s'} until your ${MN[Number(ym.slice(5))-1]} review opens</h3>
      <p class="muted" style="max-width:46ch">Your report, feedback and PDF unlock on ${fmtD(unlockDate(ym))}, once the month is complete. Meanwhile, your live progress is on Home.</p><button class="btn" data-action="nav" data-v="home">See my month so far</button></div>`;
  } else {
    const f=feedback(emp,ym), s=f.m.scores, [g,gc]=grade(s.overall, f.m);
    const factors = f.m.founder ? [['On-time delivery',s.delivery]] : [['Punctuality',s.punctuality],['Full shifts',s.completion],['Attendance',s.attendance],['Hours',s.hours],['On-time delivery',s.delivery]];
    body = `<div class="grid g-main">
      <div class="card fb"><div class="card-head"><h3>${monthLabel(ym)} feedback</h3><span class="chip ${gc}">${g}</span></div>
        <p class="fb-summary">${esc(f.summary)}</p>
        ${f.pos.length?`<div class="fb-block pos"><span class="label" style="color:var(--good)">What went well</span><ul>${f.pos.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
        ${f.imp.length?`<div class="fb-block imp"><span class="label" style="color:var(--warn)">Room for improvement</span><ul>${f.imp.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
        <div class="fb-block exp"><span class="label" style="color:var(--steel)">Expected next month</span><ul>${f.exp.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div>
      <div class="grid" style="align-content:start">
        <div class="card"><div class="scorebox" style="justify-content:center">${ring(s.overall,128,11)}</div>
          <div class="factors" style="margin-top:16px">${factors.map(([l,v])=>`<div class="factor"><span>${l}</span><b>${pct(v)}</b><div class="track"><i style="width:${Math.max(2,v)}%;background:${ringColor(v)}"></i></div></div>`).join('')}</div></div>
        <div class="card" style="display:grid;gap:10px"><h3>Monthly report</h3><p class="muted small">A branded 2-page PDF with attendance, projects and this feedback.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-action="download" data-e="${emp.id}" data-m="${ym}">${icon('dl',15)} Download PDF</button><button class="btn" data-action="preview" data-e="${emp.id}" data-m="${ym}">${icon('eye',15)} Preview</button></div></div>
      </div></div>`;
  }
  return `<div class="pagehead"><div><h1>Monthly reviews</h1><p>Each review opens on the 1st of the following month, with your report ready to download.</p></div></div>${tabs}${body}`;
}

function eProfile(emp){
  const p = profileOf(emp), filled=[p.position,p.location,p.wa,p.photo].filter(Boolean).length;
  return `<div class="pagehead"><div><h1>Profile</h1><p>These details appear on your monthly report.</p></div><div style="display:flex;gap:10px;align-items:center"><span class="muted small">${filled}/4 complete</span><div class="meter"><i style="width:${filled/4*100}%"></i></div></div></div>
  <form class="card profile" id="profile-form" novalidate>
    <div class="photo">${avatar(emp,'lg')}<label class="btn sm" for="f-photo">Upload photo</label><input id="f-photo" type="file" accept="image/*" hidden>
      ${p.photo?'<button type="button" class="btn sm ghost" data-action="rm-photo">Remove photo</button>':''}<p class="hint">A clear, square photo works best.</p></div>
    <div style="display:grid;gap:18px;min-width:0">
      <div class="form">
        <div class="field"><label for="p-name">Employee name</label><input id="p-name" value="${esc(p.name)}"></div>
        <div class="field"><label for="p-id">Employee ID</label><input id="p-id" value="${emp.id}" readonly></div>
        <div class="field"><label for="p-loc">Location</label><input id="p-loc" value="${esc(p.location)}" placeholder="City, Sri Lanka"></div>
        <div class="field"><label for="p-pos">Position / profession</label><input id="p-pos" value="${esc(p.position)}" placeholder="e.g. Content Executive"></div>
        <div class="field"><label for="p-wa">WhatsApp number</label><input id="p-wa" value="${esc(p.wa)}" placeholder="+94 7X XXX XXXX" inputmode="tel"></div>
        <div class="field"><label for="p-email">Official email address</label><input id="p-email" type="email" value="${esc(p.offEmail||'')}" placeholder="name@fitma.lk"></div>
      </div>
      <div class="note">${icon('key',18)}<p><b>Sign-in email:</b> ${esc(accessEmail(emp)||'not registered yet')}. Only this address can open your workspace. The admin can change it.</p></div>
      <div class="field"><label>Work schedule</label><p class="muted">${PLAN_LABEL[emp.plan]}${emp.plan!=='founder'?` · Mon–Thu ${schedText(emp,new Date(2026,9,19))} · Fri ${schedText(emp,new Date(2026,9,23))}`:''}</p></div>
      <div><button class="btn primary" type="submit">Save profile</button></div>
    </div>
  </form>`;
}
const schedText = (emp,d)=>{ const sh=shiftsFor(emp,d); if(sh===null) return 'Flexible'; if(!sh.length) return 'Off'; return sh.map(([s,e])=>`${fmtT(s)}–${fmtT(e)}`).join(', '); };

// =========================================================================
//  ADMIN
// =========================================================================
const scored = () => TEAM.filter(isScored);
function aEval(emp){
  const m=metrics(emp,CUR), s=m.scores, [g,gc]=grade(s.overall, m), p=profileOf(emp);
  const fb = feedback(emp,CUR);
  const factors = m.founder ? [['On-time delivery',s.delivery,'all']] :
    [['Punctuality',s.punctuality,'25%'],['Full shifts',s.completion,'15%'],['Attendance',s.attendance,'20%'],['Hours',s.hours,'15%'],['On-time delivery',s.delivery,'25%']];
  const shotsReady = S.shotEmp===emp.id && S.shots;
  return `<div class="pagehead"><div><h1>Evaluation · ${esc(p.name)}</h1><p>${PLAN_LABEL[emp.plan]} · ${monthLabel(CUR)}. Review from attendance, hours and project delivery.</p></div></div>
  <div class="grid g-main">
    <div class="card"><div class="card-head"><div><h3>Overall score</h3><p>Weighted, updated each morning</p></div><span class="chip ${gc}">${g}</span></div>
      <div class="scorebox">${ring(s.overall,128,11)}
        <div class="factors">${factors.map(([l,v,w])=>`<div class="factor"><span>${l} <span class="muted small">${w}</span></span><b>${pct(v)}</b><div class="track"><i style="width:${Math.max(2,v)}%;background:${ringColor(v)}"></i></div></div>`).join('')}</div></div></div>
    <div class="kpis" style="align-content:start">
      <div class="kpi"><span class="label">Hours</span><span class="v">${Math.floor(m.trackedMin/60)}<small> / ${Math.round(m.requiredMin/60)}h</small></span><span class="s">${fmtH(m.overtimeMin)} overtime</span></div>
      <div class="kpi"><span class="label">Attendance</span><span class="v">${m.present}<small> / ${m.working||0}</small></span><span class="s">${m.leave} leave${m.leave===1?'':'s'}</span></div>
      <div class="kpi"><span class="label">Late starts</span><span class="v">${m.lateCount}</span><span class="s">${m.lateMin} min total</span></div>
      <div class="kpi"><span class="label">On-time delivery</span><span class="v">${m.tasksOnTime}<small> / ${m.tasksDue}</small></span><span class="s">${m.tasksOverdue} overdue</span></div>
    </div>
  </div>
  <div class="card"><div class="card-head"><div><h3>Projects</h3><p>Set start, deadline and completion to keep status accurate</p></div><button class="btn sm primary" data-action="assignproj" data-e="${emp.id}">Assign project</button></div></div>
  ${projList(emp, true)}
  <div class="grid g-main">
    <div class="card"><div class="card-head"><h3>Strengths</h3></div><ul style="margin:0;padding:2px 0 4px 18px">${fb.pos.map(x=>`<li>${esc(x)}</li>`).join('')||'<li class="muted">—</li>'}</ul></div>
    <div class="card"><div class="card-head"><h3>To work on</h3></div><ul style="margin:0;padding:2px 0 4px 18px">${fb.imp.length?fb.imp.map(x=>`<li>${esc(x)}</li>`).join(''):'<li class="muted">Nothing flagged this month.</li>'}</ul></div>
  </div>
  <div class="card"><div class="card-head"><div><h3>Screenshots</h3><p>From the tracker</p></div><button class="btn sm" data-action="eval-shots" data-id="${emp.id}">${shotsReady?'Refresh':'Load latest'}</button></div>
    ${shotsReady ? (S.shots.length? `<div class="shots-grid">${S.shots.slice(0,12).map(sh=>`<figure class="shot"><img loading="lazy" src="${sh.url}" alt="screenshot"><figcaption>${esc(fmtShotTime(sh.ts))} · ${Math.round(sh.activity)}% active</figcaption></figure>`).join('')}</div>` : '<p class="muted">No screenshots synced yet.</p>')
      : (S.shotsLoading && S.shotEmp===emp.id ? '<p class="muted">Loading…</p>' : '<p class="muted">Tap “Load latest” to pull recent screenshots.</p>')}</div>`;
}
function aPulse(){
  const rows = TEAM.map(e=>({e,m:metrics(e,CUR),prev:metrics(e,MONTHS[MONTHS.indexOf(CUR)-1]||CUR)}));
  const sc = rows.filter(r=>!r.m.founder); const avg = sc.reduce((a,r)=>a+r.m.scores.overall,0)/(sc.length||1);
  const starts=sc.reduce((a,r)=>a+r.m.starts,0), late=sc.reduce((a,r)=>a+r.m.lateCount,0);
  const tdone=rows.reduce((a,r)=>a+r.m.tasksDone,0), ttot=rows.reduce((a,r)=>a+r.m.tasks.length,0), over=rows.reduce((a,r)=>a+r.m.tasksOverdue,0);
  const top = [...sc].sort((a,b)=>b.m.scores.overall-a.m.scores.overall)[0];
  const imp = [...sc].sort((a,b)=>(b.m.scores.overall-b.prev.scores.overall)-(a.m.scores.overall-a.prev.scores.overall))[0];
  const delta = imp ? imp.m.scores.overall-imp.prev.scores.overall : 0; const prevName = MN[(Number(CUR.slice(5))+10)%12];
  const attention=[]; sc.forEach(r=>{ if(r.m.lateCount>=4) attention.push([r.e,`${r.m.lateCount} late starts (${r.m.lateMin} min)`,'c-warn','Timekeeping']);
    if(r.m.earlyCount>=3) attention.push([r.e,`Left early ${r.m.earlyCount} times`,'c-early','Early finishes']);
    if(r.m.leave && r.m.coverRate<.6) attention.push([r.e,`${fmtH(r.m.lostMin-r.m.coverMin)} of leave not made up`,'c-bad','Leave']);
    if(r.m.tasksOverdue) attention.push([r.e,`${r.m.tasksOverdue} overdue task${r.m.tasksOverdue>1?'s':''}`,'c-bad','Delivery']); });
  rows.filter(r=>r.m.founder&&r.m.tasksOverdue).forEach(r=>attention.push([r.e,`${r.m.tasksOverdue} overdue task${r.m.tasksOverdue>1?'s':''}`,'c-bad','Delivery']));
  const live = new Date(); const hello = live.getHours()<12?'Good morning':live.getHours()<17?'Good afternoon':'Good evening';
  return `<section class="hero"><img class="bigmark" src="${LOGO_WHITE}" alt="">
    <div style="position:relative;min-width:0"><div class="eyebrow">${fmtD(live)} · ${TEAM.length} members from Fitma Tick</div><h1>${hello}, Fitma</h1>
      <div class="live"><p class="msg">The team is at <b>${Math.round(avg)}/100</b> for ${MN[Number(CUR.slice(5))-1]}. ${attention.length?`<b>${attention.length}</b> thing${attention.length>1?'s':''} need${attention.length>1?'':'s'} your attention.`:'Everyone is on track.'}</p>
      <div class="slots"><span class="slot">${starts?pct((starts-late)/starts*100):'—'} on-time starts</span><span class="slot">${tdone}/${ttot} tasks done</span><span class="slot">${Math.round(rows.reduce((a,r)=>a+r.m.trackedMin,0)/60)} h tracked</span></div></div></div>
    <div class="hero-side">${ring(avg,112,9,'team','on-dark','rgba(255,255,255,.14)','#d8dde0')}</div></section>
  ${top?`<div class="grid g2">
    <div class="card spot">${avatar(top.e,'md')}<div><span class="label">Top performer · ${MN[Number(CUR.slice(5))-1]}</span><h3>${esc(profileOf(top.e).name)} · ${Math.round(top.m.scores.overall)}</h3><p class="muted small">${top.m.lateCount===0?'Every shift on time':`${top.m.lateCount} late start${top.m.lateCount>1?'s':''} only`} and ${top.m.tasksOnTime}/${top.m.tasksDue} tasks on time.</p></div></div>
    <div class="card spot">${avatar(imp.e,'md')}<div><span class="label">${delta>0?'Most improved':'Steadiest'} vs ${prevName}</span><h3>${esc(profileOf(imp.e).name)} · ${delta>0?'+':''}${Math.round(delta)} points</h3><p class="muted small">From ${Math.round(imp.prev.scores.overall)} last month to ${Math.round(imp.m.scores.overall)} so far.</p></div></div>
  </div>`:''}
  ${TEAM.length?'':`<div class="card"><h3>No team members yet</h3><p class="muted">They appear once Fitma Tick starts sending data.</p></div>`}
  <div class="pagehead"><div><h2>Everyone</h2><p>Latest synced day: ${fmtD(DATA_END)}. Tap a person to open their workspace.</p></div>${sampleTag}</div>
  <div class="pulse">${rows.map(({e,m})=>{ const day=DAYS[e.id][key(DATA_END)], ss=day.sessions, l=ss.reduce((a,x)=>a+(x.late||0),0);
    return `<button class="pp" data-action="open-emp" data-e="${e.id}"><div class="pp-top">${avatar(e,'md')}<div class="grow"><h3>${esc(profileOf(e).name)}</h3><p class="muted small">${PLAN_LABEL[e.plan]}</p></div>${ring(m.scores.overall,46,5,'','small')}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">${statusChip(day.status)}<span class="muted small num">${ss.length?`${fmtT(ss[0].in)} – ${fmtT(ss[ss.length-1].out)}`:(day.reason?esc(day.reason):'—')}${l?` · ${l}m late`:''}</span></div>
      <div style="display:flex;justify-content:space-between;align-items:center"><span class="label">This week</span><span class="mini-week">${weekDays(e).map(({d,day})=>`<i class="p-${day.status}" title="${fmtD(d)}: ${STATUS[day.status]?.[0]||''}"></i>`).join('')}</span></div></button>`;}).join('')}</div>
  <div class="card"><div class="card-head"><h3>Needs attention</h3><span class="chip ${attention.length?'c-warn':'c-good'}">${attention.length}</span></div>
    <div class="list">${attention.length?attention.map(([e,t,c,k])=>`<div class="li"><div class="person">${avatar(e,'sm')}<div>${esc(e.name)}<small style="white-space:normal">${esc(t)}</small></div></div><span class="chip ${c}">${k}</span></div>`).join(''):'<div style="text-align:center;padding:4px 0"><img class="vora-fig" style="width:86px" src="'+VORA_SUCCESS+'" alt="" loading="lazy"><p class="muted">Nothing needs attention.</p></div>'}</div></div>`;
}

function aCompare(){
  const ym=S.month; const rows = TEAM.map(e=>({e,m:metrics(e,ym)}));
  const val=(r,k)=>({overall:r.m.scores.overall,punctuality:r.m.scores.punctuality??-1,late:r.m.founder?-1:r.m.lateMin,early:r.m.founder?-1:r.m.earlyCount,leave:r.m.founder?-1:r.m.leave,hours:r.m.trackedMin,delivery:r.m.scores.delivery,name:r.e.name}[k]);
  rows.sort((a,b)=>{const x=val(a,S.sort.k),y=val(b,S.sort.k); return (typeof x==='string'?x.localeCompare(y):x-y)*S.sort.d;});
  const rank = [...rows].sort((a,b)=>b.m.scores.overall-a.m.scores.overall).map(r=>r.e.id);
  const th=(k,l,c='')=>`<th class="sortable ${c}" data-action="sort" data-k="${k}">${l}${S.sort.k===k?(S.sort.d<0?' ↓':' ↑'):''}</th>`;
  return `<div class="pagehead"><div><h1>Compare</h1><p>Scheduled staff are scored on punctuality, full shifts, attendance, hours and delivery. Founders on delivery only. Click a heading to sort.</p></div>${monthSelect('m-cmp',ym)}</div>
  <div class="card"><div class="tablewrap"><table><thead><tr><th>#</th>${th('name','Member')}${th('overall','Score')}${th('punctuality','Punctual','r')}${th('late','Late','r')}${th('early','Left early','r')}${th('leave','Leave','r')}${th('hours','Hours','r')}${th('delivery','Tasks on time','r')}<th>Grade</th></tr></thead><tbody>
  ${rows.map(({e,m})=>{const s=m.scores,[g,gc]=grade(s.overall, m); return `<tr class="click" data-action="open-emp" data-e="${e.id}"><td class="rank">${rank.indexOf(e.id)+1}</td>
    <td><div class="person">${avatar(e,'sm')}<div>${esc(profileOf(e).name)}<small>${e.id}</small></div></div></td><td>${ring(s.overall,42,5,'','small')}</td>
    <td class="r">${m.founder?'<span class="muted">Flexible</span>':pct(s.punctuality)}</td>
    <td class="r">${m.founder?'—':`${m.lateCount}× <span class="muted">${m.lateMin}m</span>`}</td>
    <td class="r">${m.founder?'—':`${m.earlyCount}× <span class="muted">${m.earlyMin}m</span>`}</td>
    <td class="r">${m.founder?'—':`${m.leave}${m.leave?` <span class="muted">${Math.round(m.coverRate*100)}% made up</span>`:''}`}</td>
    <td class="r">${fmtH(m.trackedMin)}${m.founder?'':` <span class="muted">/ ${Math.round(m.requiredMin/60)}h</span>`}</td>
    <td class="r">${m.tasksOnTime}/${m.tasksDue}</td><td><span class="chip ${gc}">${g}</span></td></tr>`;}).join('')}</tbody></table></div></div>
  <div class="card"><div class="card-head"><div><h3>Score trend</h3><p>${monthLabel(MONTHS[0])} to ${monthLabel(CUR)} (month to date)</p></div></div>${trend()}</div>`;
}
function trend(){
  if (MONTHS.length<2) return '<p class="muted">The trend appears once there is more than one month of data.</p>';
  const W0=720,H0=260,L=40,R=120,T=16,B=34,lo=40,hi=100;
  const x=i=>L+i*(W0-L-R)/(MONTHS.length-1), y=v=>T+(hi-v)/(hi-lo)*(H0-T-B);
  const cols=['var(--navy)','var(--steel)','var(--good)','var(--bad)'];
  let g=[40,60,80,100].map(v=>`<line x1="${L}" x2="${W0-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end" fill="var(--muted)" font-size="11">${v}</text>`).join('');
  g+=MONTHS.map((m,i)=>`<text x="${x(i)}" y="${H0-10}" text-anchor="middle" fill="var(--muted)" font-size="11">${MN[Number(m.slice(5))-1].slice(0,3)}</text>`).join('');
  const series=scored().map((e,i)=>({e,c:cols[i%cols.length],v:MONTHS.map(m=>metrics(e,m).scores.overall)}));
  const ends=series.map(s=>({s,y:y(s.v[s.v.length-1])})).sort((a,b)=>a.y-b.y); for(let i=1;i<ends.length;i++) if(ends[i].y-ends[i-1].y<15) ends[i].y=ends[i-1].y+15;
  series.forEach(s=>{ g+=`<polyline points="${s.v.map((v,i)=>`${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="${s.c}" stroke-width="2.2" stroke-linejoin="round"/>`+s.v.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="${i===s.v.length-1?4.5:3}" fill="${s.c}"><title>${s.e.name}, ${monthLabel(MONTHS[i])}: ${Math.round(v)}</title></circle>`).join(''); });
  ends.forEach(({s,y:yy})=>{ g+=`<text x="${W0-R+12}" y="${yy+4}" fill="${s.c}" font-size="12" font-weight="600">${s.e.name} ${Math.round(s.v[s.v.length-1])}</text>`; });
  return `<div class="tablewrap"><svg viewBox="0 0 ${W0} ${H0}" style="width:100%;min-width:520px;height:auto;display:block;font-family:var(--body)" role="img" aria-label="Monthly score per person">${g}</svg></div>`;
}

function aAtt(){
  const ym=S.month, n=daysIn(ym);
  return `<div class="pagehead"><div><h1>Team attendance</h1><p>Everyone, every day. Hover a square for times and reasons.</p></div>${monthSelect('m-tatt',ym)}</div>
  <div class="card"><div class="card-head"><h3>${monthLabel(ym)}</h3><div class="legend"><span><i class="pin p-ontime"></i>On time</span><span><i class="pin p-late"></i>Late</span><span><i class="pin p-early"></i>Left early</span><span><i class="pin p-leave"></i>Leave</span><span><i class="pin" style="background:var(--steel-2)"></i>Made up</span><span><i class="pin" style="background:var(--sky)"></i>Flexible</span></div></div>
  <div class="tablewrap"><table class="matrix"><thead><tr><th>Member</th>${Array.from({length:n},(_,i)=>{const d=dateOf(ym,i+1);return `<th>${d.getDate()}<br><span style="font-weight:500">${DN[d.getDay()][0]}</span></th>`;}).join('')}</tr></thead><tbody>
  ${TEAM.map(e=>`<tr><td><div class="person">${avatar(e,'sm')}${esc(e.name)}</div></td>${Array.from({length:n},(_,i)=>{const d=dateOf(ym,i+1),day=DAYS[e.id][key(d)];
    return `<td><span class="cell ${day.status}" title="${esc(`${fmtD(d)}: ${STATUS[day.status]?.[0]||''}${day.sessions.length?' · '+day.sessions.map(s=>fmtT(s.in)+'–'+fmtT(s.out)).join(', '):''}${day.reason?' · '+day.reason:''}`)}"></span></td>`;}).join('')}</tr>`).join('')}
  </tbody></table></div></div>
  <div class="card"><div class="card-head"><div><h3>Leave and make-up time</h3><p>Who takes leave, and who makes the hours up later</p></div></div>
  <div class="tablewrap"><table><thead><tr><th>Member</th><th class="r">Leave days</th><th class="r">Missed</th><th class="r">Made up</th><th class="r">Covered</th><th>Reasons given</th></tr></thead><tbody>
  ${scored().map(e=>{const m=metrics(e,ym); return `<tr><td><div class="person">${avatar(e,'sm')}${esc(e.name)}</div></td><td class="r">${m.leave}</td><td class="r">${fmtH(m.lostMin)}</td><td class="r">${fmtH(m.coverMin)}</td><td class="r">${m.leave?`<span class="chip ${m.coverRate>=.95?'c-good':m.coverRate>=.5?'c-warn':'c-bad'}">${Math.round(m.coverRate*100)}%</span>`:'—'}</td><td class="muted" style="white-space:normal">${esc([...new Set(m.reasons)].join(', '))||'—'}</td></tr>`;}).join('')}
  </tbody></table></div></div>`;
}


// ===== Activity & sites (admin) + task assignment (added) =====
function actLabel_(type){ return ({start:'Started work',stop:'Stopped',brk:'Break','break':'Started break',resume:'Back from break',idle:'Went idle (no input)',active:'Active again'}[type])||type; }
function tzTime_(ts){ try{ return new Date(ts).toLocaleTimeString('en-US',{timeZone:'Asia/Colombo',hour:'numeric',minute:'2-digit'}); }catch(e){ return ''; } }
function tzDate_(ts){ try{ return new Date(ts).toLocaleDateString('en-CA',{timeZone:'Asia/Colombo'}); }catch(e){ return ''; } }
function aActivity(){
  const emp = (S.actEmp ? empById(S.actEmp) : null) || TEAM[0] || null;
  const chips = `<div class="chips">${TEAM.map(e=>`<button class="fchip ${(emp&&emp.id===e.id)?'on':''}" data-action="act-emp" data-e="${e.id}">${avatar(e,'sm')}${esc(e.name)}</button>`).join('')}</div>`;
  if(!emp) return `<div class="pagehead"><div><h1>Activity &amp; sites</h1></div></div>${chips}<div class="card"><p class="muted">No team members yet.</p></div>`;
  if(ACT_FEED===null){
    if(!S.actLoading){ S.actLoading=true; loadActivityFeed().then(()=>{ S.actLoading=false; render(); }).catch(()=>{ S.actLoading=false; ACT_FEED={events:[],activity:[]}; render(); }); }
    return `<div class="pagehead"><div><h1>Activity &amp; sites</h1><p>Work sessions and the apps &amp; websites each person used while tracking.</p></div></div>${chips}<div class="card" style="text-align:center;padding:38px 24px"><img class="voro-load" style="width:92px;margin:0 auto" src="${VORA_EMPTY}" alt=""><p class="muted" style="margin-top:10px">Loading activity…</p></div>`;
  }
  const EV = ACT_FEED.events||[], AC = ACT_FEED.activity||[];
  const evs = EV.filter(x=>String(x.empId)===String(emp.id)).slice().sort((a,b)=>a.ts<b.ts?-1:1);
  const evByDay={}; evs.forEach(e=>{ const d=tzDate_(e.ts); if(!d)return; (evByDay[d]=evByDay[d]||[]).push(e); });
  const evDays=Object.keys(evByDay).sort().reverse().slice(0,5);
  const timeline = evDays.length ? evDays.map(d=>`<div class="li"><div class="grow"><div class="t1">${d}</div><div class="t2">${evByDay[d].map(e=>`${tzTime_(e.ts)} · ${actLabel_(e.type)}`).join('  →  ')}</div></div></div>`).join('') : '<p class="muted">No work sessions recorded yet.</p>';
  const acts = AC.filter(x=>String(x.empId)===String(emp.id)).slice().sort((a,b)=>a.ts<b.ts?1:-1);
  const aiN = acts.filter(a=>a.ai).length;
  const rows = acts.slice(0,250).map(a=>{
    const label = a.title || a.host || a.app || 'Unknown';
    const href = a.url ? a.url : (a.host ? ('https://'+a.host) : '');
    const site = href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>` : esc(label);
    return `<div class="li"><div class="grow"><div class="t1">${esc(a.app||'')} ${a.ai?'<span class="chip c-warn">AI</span>':''}</div><div class="t2">${site}</div></div><span class="muted small">${tzTime_(a.ts)}</span></div>`;
  }).join('') || '<p class="muted">No apps or sites recorded yet. They appear here while this person is tracking with Fitma Tick.</p>';
  return `<div class="pagehead"><div><h1>Activity &amp; sites</h1><p>Work sessions and the apps &amp; websites each person used while tracking. AI tools are flagged.</p></div></div>
  ${chips}
  <div class="card"><div class="card-head"><div><h3>Work sessions</h3><p>Exactly when ${esc(emp.name)} started, took breaks, went idle, and stopped</p></div></div><div class="list small">${timeline}</div></div>
  <div class="card"><div class="card-head"><div><h3>Apps &amp; websites</h3><p>${acts.length} captured${aiN?` · <b>${aiN} AI</b>`:''} — most recent first</p></div></div><div class="list small">${rows}</div></div>`;
}
function empTasksCard(emp){
  const ts = TASKLIST.filter(t=>t.emp===emp.id).slice().sort((a,b)=>(a.due||8.64e15)-(b.due||8.64e15));
  if(!ts.length) return '';
  const canEdit = isAdmin();
  return `<div class="card"><div class="card-head"><div><h3>Assigned tasks</h3><p>Topic, task and deadline — status follows the dates</p></div></div>
  <div class="list">${ts.map(t=>`<div class="li"><div class="grow"><div class="t1">${esc(t.title)}</div><div class="t2">${t.project?`<b>${esc(t.project)}</b> · `:''}${t.desc?esc(t.desc)+' · ':''}${dueLabel(t)}</div></div>${canEdit?`<button class="link" data-action="deltask" data-id="${esc(t.id)}">Remove</button>`:''}</div>`).join('')}</div></div>`;
}
function showTaskEditor(presetEmp){
  const inp='style="padding:9px 10px;border:1px solid var(--line);border-radius:8px;font-size:14px;width:100%;background:var(--surface)"';
  const fld=(label,inner)=>`<label style="display:grid;gap:4px"><span class="muted small">${label}</span>${inner}</label>`;
  let o=document.querySelector('.overlay.task'); if(o)o.remove();
  o=document.createElement('div'); o.className='overlay task';
  const opts=TEAM.map(e=>`<option value="${e.id}"${presetEmp===e.id?' selected':''}>${esc(e.name)}</option>`).join('');
  o.innerHTML=`<div class="sheet" style="max-width:460px" data-stop="1">
    <div class="sheet-head"><span class="label">Assign task</span><h3>New task</h3></div>
    <div style="padding:20px;display:grid;gap:12px">
      ${fld('Assignee', `<select id="tk-emp" ${inp}>${opts}</select>`)}
      ${fld('Topic', `<input id="tk-topic" type="text" placeholder="e.g. DMK | Website" ${inp}>`)}
      ${fld('Task', `<input id="tk-title" type="text" placeholder="e.g. Write the About page" ${inp}>`)}
      ${fld('Description', `<textarea id="tk-desc" rows="3" placeholder="What exactly to do" ${inp}></textarea>`)}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${fld('Assigned date', `<input id="tk-assigned" type="date" ${inp}>`)}${fld('Deadline', `<input id="tk-due" type="date" ${inp}>`)}</div>
      <div style="display:flex;gap:8px;margin-top:4px"><button class="btn" data-close style="flex:1">Cancel</button><button class="btn primary" id="tk-save" style="flex:1">Save task</button></div>
    </div></div>`;
  o.addEventListener('click',ev=>{ if(ev.target.closest('[data-close]')||!ev.target.closest('[data-stop]')) o.remove(); });
  document.body.appendChild(o);
  try{ o.querySelector('#tk-assigned').value=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Colombo'}); }catch(e){}
  o.querySelector('#tk-save').addEventListener('click', async ()=>{
    const g=id=>{ const el=o.querySelector(id); return el?(el.value||'').trim():''; };
    const empId=g('#tk-emp'), topic=g('#tk-topic'), title=g('#tk-title'), desc=g('#tk-desc'), assigned=g('#tk-assigned'), due=g('#tk-due');
    if(!empId||!title){ toast('Pick an assignee and enter the task.'); return; }
    const btn=o.querySelector('#tk-save'); btn.disabled=true;
    try{ await api('/task',{empId:empId,topic:topic,title:title,desc:desc,assigned:assigned,due:due}); o.remove(); await loadData(); render(); toast('Task assigned'); }
    catch(e){ btn.disabled=false; toast(e.message||'Couldn’t save the task.'); }
  });
}
function delTask(id){ if(!confirm('Remove this task?'))return; api('/taskdel',{id:id}).then(()=>loadData()).then(()=>{ render(); toast('Task removed'); }).catch(e=>toast(e.message||'Couldn’t remove.')); }

function aProj(){
  const ym=S.month; let all=TASKLIST.filter(t=>t.ym===ym); if(S.projEmp!=='all') all=all.filter(t=>t.emp===S.projEmp);
  const ps=projectSummary(all); if(S.projFilter!=='all'&&!ps.find(p=>p.name===S.projFilter)) S.projFilter='all';
  const tasks = S.projFilter==='all'?all:all.filter(t=>t.project===S.projFilter);
  return `<div class="pagehead"><div><h1>Projects</h1><p>${all.length} tasks assigned in ${monthLabel(ym)} · ${all.filter(t=>t.done).length} completed · ${all.filter(t=>t.status==='overdue').length} overdue</p></div><div style="display:flex;gap:8px;align-items:center">${monthSelect('m-tproj',ym)}<button class="btn primary" data-action="assigntask">+ Assign task</button></div></div>
  <div class="chips"><button class="fchip ${S.projEmp==='all'?'on':''}" data-action="pemp" data-e="all">Everyone</button>${TEAM.map(e=>`<button class="fchip ${S.projEmp===e.id?'on':''}" data-action="pemp" data-e="${e.id}">${avatar(e,'sm')}${esc(e.name)} <small>${TASKLIST.filter(t=>t.ym===ym&&t.emp===e.id).length}</small></button>`).join('')}</div>
  ${projCards(ps,{done:all.filter(t=>t.done).length,total:all.length})}
  ${board(tasks,true)}`;
}

function aRev(){
  return `<div class="pagehead"><div><h1>Reviews and reports</h1><p>You can view and download any month. Team members see each month from the 1st of the next.</p></div></div>
  <div class="card"><div class="tablewrap"><table><thead><tr><th>Member</th>${[...MONTHS].reverse().map(m=>`<th>${monthLabel(m)}${isUnlocked(m)?'':` <span class="chip c-off" title="Team members can open this from ${fmtD(unlockDate(m))}">${icon('lock',11)} ${fmtD(unlockDate(m)).slice(4)}</span>`}</th>`).join('')}</tr></thead><tbody>
  ${TEAM.map(e=>`<tr><td><div class="person">${avatar(e,'sm')}${esc(e.name)}</div></td>${[...MONTHS].reverse().map(ym=>{const s=metrics(e,ym).scores.overall; return `<td><div style="display:flex;gap:6px;align-items:center"><span class="chip ${grade(s)[1]}" style="min-width:34px;justify-content:center">${Math.round(s)}</span><button class="btn sm" data-action="preview" data-e="${e.id}" data-m="${ym}" aria-label="Preview">${icon('eye',14)}</button><button class="btn sm" data-action="download" data-e="${e.id}" data-m="${ym}" aria-label="Download PDF">${icon('dl',14)}</button></div></td>`;}).join('')}</tr>`).join('')}
  </tbody></table></div></div>
  <div class="card"><div class="card-head"><h3>Read a review</h3></div><p class="muted small">Open anyone's workspace from Team pulse and choose Reviews to read their feedback in full.</p></div>`;
}

function aAccess(){
  const unset = TEAM.filter(e=>e.plan==='unset'||!e.plan);
  return `<div class="pagehead"><div><h1>Team & access</h1><p>Each person signs in with their email and password. Set schedules here, and reset a password if someone is locked out.</p></div><div style="display:flex;gap:8px;align-items:center">${sampleTag}<button class="btn primary" data-action="addmember">+ Add member</button></div></div>
  <div class="note" style="font-size:13.5px">${icon('key',18)}<p><b>Access note.</b> ${ACCESS_NOTE}</p></div>
  ${unset.length?`<div class="nudge"><div><b>${unset.length} member${unset.length>1?'s':''} without a schedule</b><p class="muted small">Set a schedule for ${unset.map(e=>esc(e.name)).join(', ')} so they can be scored.</p></div></div>`:''}
  <div class="card"><div class="card-head"><div><h3>Members</h3><p>Schedule and Friday hours feed the scoring; email is the sign-in address</p></div></div>
  <div class="tablewrap"><table><thead><tr><th>Member</th><th>Employee ID</th><th>Schedule</th><th>Friday hours</th><th>Sign-in email</th><th></th></tr></thead><tbody>
  <tr><td><div class="person">${avatar(null,'sm')}<div>Fitma Admin<small>Full access</small></div></div></td><td>—</td><td>—</td><td>—</td><td>${ADMIN.email}</td><td><span class="chip c-good">Active</span></td></tr>
  ${TEAM.map(e=>`<tr>
    <td><div class="person">${avatar(e,'sm')}<div>${esc(profileOf(e).name)}<small>${esc(PLAN_LABEL[e.plan]||'Schedule not set')}</small></div></div></td>
    <td>${e.id}</td>
    <td><select class="fchip" id="plan-${e.id}" aria-label="Schedule for ${esc(e.name)}">${['std4','std3','founder','unset'].map(p=>`<option value="${p}" ${e.plan===p?'selected':''}>${PLAN_LABEL[p]}</option>`).join('')}</select></td>
    <td><select class="fchip" id="gen-${e.id}" aria-label="Friday schedule for ${esc(e.name)}"><option value="M" ${e.gender==='M'?'selected':''}>Men's</option><option value="F" ${e.gender==='F'?'selected':''}>Women's</option><option value="" ${!e.gender?'selected':''}>Not set</option></select></td>
    <td><input class="fchip" style="min-width:210px" id="acc-${e.id}" type="email" value="${esc(accessEmail(e))}" aria-label="Sign-in email for ${esc(e.name)}"></td>
    <td><div style="display:flex;gap:8px;align-items:center"><button class="btn sm primary" data-action="save-member" data-e="${e.id}">Save</button><button class="btn sm" data-action="resetpw" data-e="${e.id}">Reset password</button></div></td></tr>`).join('')}
  </tbody></table></div></div>
  <div class="grid g3">${TEAM.map(e=>{const p=profileOf(e); return `<button class="pp" data-action="open-emp" data-e="${e.id}"><div class="pp-top">${avatar(e,'md')}<div class="grow"><h3>${esc(p.name)}</h3><p class="muted small">${esc(p.position||'Position not added')}</p></div></div><div class="list small"><div class="li"><span class="muted">Location</span><span>${esc(p.location||'—')}</span></div><div class="li"><span class="muted">WhatsApp</span><span>${esc(p.wa||'—')}</span></div></div></button>`;}).join('')}</div>`;
}

function aSettings(){
  const ex=[new Date(2026,9,19),new Date(2026,9,23)];
  const hasData = TEAM.some(e=>Object.values(DAYS[e.id]||{}).some(d=>d.sessions&&d.sessions.length));
  return `<div class="pagehead"><div><h1>Settings</h1><p>Time source, holidays, scoring and schedules.</p></div></div>
  <div class="grid g2">
    <div class="card syncbox"><div class="card-head" style="margin:0"><h3>Time tracking</h3><span class="chip ${SYNC.lastRun?'c-good':'c-off'}">${SYNC.lastRun?'Receiving':'Waiting for data'}</span></div>
      <div class="list small"><div class="li"><span class="muted">Source</span><span>Fitma Tick (desktop app)</span></div>
        <div class="li"><span class="muted">Last data received</span><span>${SYNC.lastRun?`${fmtD(new Date(SYNC.lastRun))}, ${fmtT(new Date(SYNC.lastRun).getHours()*60+new Date(SYNC.lastRun).getMinutes())}`:'—'}</span></div>
        <div class="li"><span class="muted">Counting from</span><span>${SETTINGS.trackingStart?`${fmtD(parseKey(SETTINGS.trackingStart))} ${SETTINGS.trackingStart.slice(0,4)}`:'—'}</span></div></div>
      <p class="hint">Install Fitma Tick on each person's computer from the Download page. Their hours and screenshots arrive here automatically.</p>
      <div class="inline-form" style="margin-top:4px">
        ${hasData?`<button class="btn" data-action="sample-clear" ${S.busy?'disabled':''}>Clear sample data</button>`:`<button class="btn" data-action="sample-load" ${S.busy?'disabled':''}>Load sample month</button>`}
        <span class="hint">${esc(S.busy||'Preview the workspace with example data before Fitma Tick is installed.')}</span></div></div>
    <div class="card syncbox"><div class="card-head" style="margin:0"><div><h3>Holidays</h3><p>No shift is expected on these dates</p></div></div>
      <textarea id="holidays" placeholder="One date per line, e.g. 2026-11-24">${esc((SETTINGS.holidays||[]).join('\n'))}</textarea>
      <div class="inline-form"><button class="btn" data-action="save-holidays">Save holidays</button><span class="hint">Poya days and public holidays.</span></div></div>
  </div>
  <div class="grid g2">
    <div class="card"><div class="card-head"><h3>Scoring</h3><span class="muted small">Scheduled staff</span></div>
      <div class="factors">${[['Punctuality',W.punctuality],['Full shifts',W.completion],['Attendance',W.attendance],['Hours',W.hours],['On-time delivery',W.delivery]].map(([l,w])=>`<div class="factor"><span>${l}</span><b>${w*100}%</b><div class="track"><i style="width:${w*400}%"></i></div></div>`).join('')}</div>
      <p class="hint" style="margin-top:12px">Late means any start after the scheduled minute; every late or early minute lowers the score a little more. Leave counts back toward attendance as the hours are made up. Founders are scored on on-time delivery only.</p></div>
    <div class="card"><div class="card-head"><h3>How a day is scored</h3></div>
      <div class="list small"><div class="li"><span class="muted">Hours</span><span style="text-align:right">Start and end of every Fitma Tick session</span></div>
      <div class="li"><span class="muted">Leave</span><span style="text-align:right">A scheduled day with no tracked time</span></div>
      <div class="li"><span class="muted">Made up</span><span style="text-align:right">Extra time worked later (evenings, weekends)</span></div>
      <div class="li"><span class="muted">Tasks</span><span style="text-align:right">A task's due date is its deadline</span></div></div></div>
  </div>
  <div class="card syncbox"><div class="card-head" style="margin:0"><div><h3>Fitma Tick download links</h3><p>Paste the installer links so the Download page works for everyone</p></div></div>
    <div class="form"><div class="field"><label for="dl-win">Windows installer link</label><input id="dl-win" type="url" placeholder="https://… .exe" value="${esc((SETTINGS.downloads||{}).win||'')}"></div>
    <div class="field"><label for="dl-mac">Mac installer link</label><input id="dl-mac" type="url" placeholder="https://… .dmg" value="${esc((SETTINGS.downloads||{}).mac||'')}"></div></div>
    <div class="inline-form"><button class="btn" data-action="save-downloads">Save links</button><span class="hint">Upload the installers to Drive (or anywhere), share "anyone with the link", and paste the links here.</span></div></div>
  <div class="card"><div class="card-head"><div><h3>Work schedules</h3><p>Friday follows the Jummah schedule. Change a schedule in Team & access</p></div></div>
  <div class="tablewrap"><table><thead><tr><th>Member</th><th>Plan</th><th>Monday – Thursday</th><th>Friday</th></tr></thead><tbody>
  ${TEAM.map(e=>`<tr><td><div class="person">${avatar(e,'sm')}<div>${esc(e.name)}<small>${e.gender==='F'?'Women’s Friday hours':e.gender==='M'?'Men’s Friday hours':'Friday hours not set'}</small></div></div></td><td>${PLAN_LABEL[e.plan]||'—'}</td><td>${schedText(e,ex[0])}</td><td>${schedText(e,ex[1])}</td></tr>`).join('')}
  </tbody></table></div></div>`;
}

function aShots(){
  const emp = S.shotEmp ? empById(S.shotEmp) : null;
  return `<div class="pagehead"><div><h1>Screenshots</h1><p>Recent screenshots from Fitma Tick. Pick a person, then a month if you want a specific one.</p></div><label class="muted small" style="display:inline-flex;gap:8px;align-items:center">Show <select class="fchip" id="shots-ym"><option value="">Latest</option>${MONTHS.slice().reverse().map(m=>`<option value="${m}" ${S.shotYm===m?'selected':''}>${monthLabel(m)}</option>`).join('')}</select></label></div>
  <div class="chips">${TEAM.map(e=>`<button class="fchip ${S.shotEmp===e.id?'on':''}" data-action="shots-emp" data-e="${e.id}">${avatar(e,'sm')}${esc(e.name)}</button>`).join('')}</div>
  ${!emp?'<div class="card"><p class="muted">Choose a team member above.</p></div>'
    : S.shotsLoading?'<div class="card"><p class="muted">Loading screenshots…</p></div>'
    : !(S.shots&&S.shots.length)?`<div class="card" style="text-align:center"><img class="vora-fig" style="width:140px" src="${VORA_EMPTY}" alt="" loading="lazy"><h3>No screenshots yet</h3><p class="muted">${esc(emp.name)} hasn’t sent any from Fitma Tick, or the tracker isn’t installed yet.</p></div>`
    : `<div class="card"><div class="card-head"><h3>${esc(emp.name)} · latest ${S.shots.length}</h3></div>
       <div class="shots-grid">${S.shots.map(s=>`<figure class="shot"><img loading="lazy" src="${s.url}" alt="screenshot ${esc(s.ts)}"><figcaption>${esc(fmtShotTime(s.ts))} · ${Math.round(s.activity)}% active</figcaption></figure>`).join('')}</div></div>`}`;
}
function fmtShotTime(ts){ try{ const d=new Date(ts); return `${fmtD(d)} ${fmtT(d.getHours()*60+d.getMinutes())}`; }catch(e){ return ts; } }

function pDownload(emp){
  const dl = SETTINGS.downloads || { win:'', mac:'' };
  const steps = `<div class="card"><div class="card-head"><h3>How to set it up</h3></div>
    <div class="list small">
      <div class="li"><div class="grow"><div class="t1">1 · Download and install</div><div class="t2">Pick your computer below and run the installer.</div></div></div>
      <div class="li"><div class="grow"><div class="t1">2 · Sign in</div><div class="t2">Open Fitma Tick and sign in with your Fitma Workspace email and password — the same ones you use here.</div></div></div>
      <div class="li"><div class="grow"><div class="t1">3 · Press Start when you begin work</div><div class="t2">It counts your time and takes occasional screenshots while you work, and stops when you press Stop. Your hours appear here automatically.</div></div></div>
    </div>
    <div class="note" style="margin-top:12px">${icon('info',18)}<p>Fitma Tick shows when it’s running and that it captures screenshots during working hours. It only runs while you choose to track.</p></div></div>`;
  const btns = `<div class="card"><div class="card-head"><h3>Download Fitma Tick</h3></div>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      ${dl.win?`<a class="btn primary" href="${esc(dl.win)}">${icon('dl',16)} Download for Windows</a>`:'<button class="btn" disabled>Windows (coming soon)</button>'}
      ${dl.mac?`<a class="btn primary" href="${esc(dl.mac)}">${icon('dl',16)} Download for Mac</a>`:'<button class="btn" disabled>Mac (coming soon)</button>'}
    </div>
    ${(!dl.win&&!dl.mac)?'<p class="hint" style="margin-top:10px">The installers aren’t posted yet. The admin adds them in Settings.</p>':''}</div>`;
  return `<div class="pagehead"><div><h1>Fitma Tick</h1><p>The Fitma time tracker. Install it on your work computer so your hours reach your workspace.</p></div></div>
  <div class="grid g-main">${btns}${steps}</div>`;
}

// =========================================================================
//  REPORT (PDF)
// =========================================================================
// ===== Payslip generator (admin) =====
function fmtLKR(n){ n=Number(n)||0; return n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function loadPaySaved(id){ try{ return JSON.parse(localStorage.getItem('fw:pay:'+id)||'{}'); }catch(e){ return {}; } }
function savePaySaved(id,d){ try{ localStorage.setItem('fw:pay:'+id, JSON.stringify(d)); }catch(e){} }
function payslipHTML(emp, d){
  const p=profileOf(emp);
  const navy='#283544', mut='#6b7c8c', line='#e4e8ec', ink='#1e2834';
  const serif='font-family:var(--display),Georgia,serif';
  const E=[['Basic Salary',d.basic],['Overtime Allowance',d.ot],['Performance Bonus',d.bonus],['Other Allowance',d.other]];
  const D=[['Performance Deduction',d.dPerf],['Responsibility / Conduct Deduction',d.dResp],['Other Deduction',d.dOther]];
  const gross=(Number(d.basic)||0)+(Number(d.ot)||0)+(Number(d.bonus)||0)+(Number(d.other)||0);
  const totD=(Number(d.dPerf)||0)+(Number(d.dResp)||0)+(Number(d.dOther)||0);
  const net=gross-totD;
  const row=(no,lbl,amt,i)=>'<tr style="background:'+(i%2?'#f2f5f7':'#fff')+'"><td style="padding:9px 12px;color:'+mut+';width:40px">'+no+'</td><td style="padding:9px 12px">'+lbl+'</td><td style="padding:9px 12px;color:'+mut+'">-</td><td style="padding:9px 12px;text-align:right;font-weight:700">'+fmtLKR(amt)+'</td></tr>';
  const thead=t=>'<tr style="background:'+navy+';color:#fff;text-align:left"><th style="padding:9px 12px;width:40px">No.</th><th style="padding:9px 12px">'+t+'</th><th style="padding:9px 12px">Remarks</th><th style="padding:9px 12px;text-align:right">Amount (LKR)</th></tr>';
  const dl=(a,b)=>'<div style="display:flex;justify-content:space-between;padding:7px 0;font-size:12px"><span style="color:'+mut+'">'+a+'</span><span style="font-weight:700">'+b+'</span></div>';
  const pageCss='width:794px;min-height:1123px;background:#fff;color:'+ink+';font-family:var(--body),\'Segoe UI\',system-ui,sans-serif;position:relative;overflow:hidden;box-sizing:border-box;padding:0;margin:0 auto 16px;border:0;box-shadow:none';
  return '<div class="rpt-page" style="'+pageCss+'">'
    +'<div style="background:'+navy+';color:#fff;padding:30px 40px;display:flex;justify-content:space-between;align-items:center">'
      +'<img src="'+LOGO_WHITE+'" alt="" style="width:92px;height:92px;object-fit:contain">'
      +'<div style="text-align:right"><div style="'+serif+';font-size:40px;letter-spacing:1px">PAYSLIP</div><div style="'+serif+';font-size:18px;margin-top:2px">Fitma</div><div style="font-size:11px;color:#cdd8e2;margin-top:4px">info.fitma@gmail.com</div><div style="font-size:11px;color:#cdd8e2">www.fitma.lk</div></div></div>'
    +'<div style="background:'+navy+';color:#fff;padding:0 40px 14px;display:flex;justify-content:flex-end;gap:12px;font-size:11.5px"><span style="color:#9fb1c2">Date:</span><b>'+esc(d.date||'')+'</b></div>'
    +'<div style="padding:26px 40px 90px">'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-bottom:26px">'
        +'<div><div style="font-size:11px;letter-spacing:1px;font-weight:700;color:'+navy+';border-bottom:2px solid '+line+';padding-bottom:6px;margin-bottom:10px">EMPLOYEE DETAILS</div>'
          +payRow('Employee Name',esc(p.name),mut)+payRow('Employee ID',emp.id,mut)+payRow('Designation',esc(d.designation||p.position||''),mut)+payRow('Bank Name',esc(d.bank||''),mut)+payRow('Account Number',esc(d.account||''),mut)+'</div>'
        +'<div><div style="font-size:11px;letter-spacing:1px;font-weight:700;color:'+navy+';border-bottom:2px solid '+line+';padding-bottom:6px;margin-bottom:10px">PAYSLIP DETAILS</div>'
          +payRow('Pay From',esc(d.from||''),mut)+payRow('Pay To',esc(d.to||''),mut)+payRow('Payslip No.',esc(d.no||''),mut)+payRow('Payment Method',esc(d.method||'Bank Transfer'),mut)+payRow('Currency',esc(d.currency||'LKR'),mut)+'</div>'
      +'</div>'
      +'<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px"><thead>'+thead('Earnings')+'</thead><tbody>'+E.map((r,i)=>row(i+1,r[0],r[1],i)).join('')+'</tbody></table>'
      +'<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:22px"><thead>'+thead('Deductions')+'</thead><tbody>'+D.map((r,i)=>row(i+1,r[0],r[1],i)).join('')+'</tbody></table>'
      +'<div style="display:grid;grid-template-columns:1fr 360px;gap:24px;align-items:start">'
        +'<div style="'+serif+';font-size:26px;color:'+ink+';padding-top:6px">Thank you for your hard work!</div>'
        +'<div>'+dl('Gross Earnings',fmtLKR(gross))+dl('Total Deductions',fmtLKR(totD))
          +'<div style="display:flex;justify-content:space-between;align-items:center;background:'+navy+';color:#fff;padding:12px 14px;border-radius:6px;margin-top:6px"><span style="font-weight:700;font-size:13px">NET SALARY</span><span style="'+serif+';font-size:22px">'+fmtLKR(net)+'</span></div></div>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:40px;font-size:11px">'
        +'<div><div style="color:'+mut+'">Authorised by</div><div style="font-weight:700;margin-top:26px;border-top:1px solid '+line+';padding-top:8px">HR Department - Fitma Team</div></div>'
        +'<div style="color:'+mut+';text-align:right;line-height:1.6">Your salary will be credited to your bank account within 24-48 hours of this payslip. For any questions, please contact us at info.fitma@gmail.com.</div>'
      +'</div>'
    +'</div>'
    +'<div style="position:absolute;left:0;right:0;bottom:0;background:'+navy+';color:#fff;padding:12px 40px;display:flex;justify-content:space-between;font-size:11px"><span>info.fitma@gmail.com | www.fitma.lk | +94 76 650 1832</span><b>Private &amp; Confidential</b></div>'
    +'</div>';
}
function payRow(l,v,mut){ return '<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px"><span style="color:'+mut+'">'+l+'</span><span style="font-weight:600;text-align:right">'+v+'</span></div>'; }
function aPayslips(){
  const emp = S.payEmp ? empById(S.payEmp) : (TEAM[0]||null);
  const chips = `<div class="chips">${TEAM.map(e=>`<button class="fchip ${(emp&&emp.id===e.id)?'on':''}" data-action="pay-emp" data-e="${e.id}">${avatar(e,'sm')}${esc(e.name)}</button>`).join('')}</div>`;
  if(!emp) return `<div class="pagehead"><div><h1>Payslips</h1></div></div>${chips}<div class="card"><p class="muted">Add a team member first.</p></div>`;
  const p=profileOf(emp), sv=loadPaySaved(emp.id);
  const today=new Date(), dstr=`${pad(today.getDate())}-${MN[today.getMonth()].slice(0,3)}-${today.getFullYear()}`;
  const F=(id,label,val,ph='')=>`<label style="display:grid;gap:4px"><span class="muted small">${label}</span><input class="fchip" id="${id}" type="text" value="${esc(val==null?'':val)}" placeholder="${ph}" style="width:100%;min-width:0"></label>`;
  const money=(id,label,val)=>`<label style="display:grid;gap:4px"><span class="muted small">${label}</span><input class="fchip pay-amt" id="${id}" type="number" step="0.01" value="${val==null?'':val}" placeholder="0.00" style="width:100%;min-width:0"></label>`;
  const net0=(+sv.basic||0)+(+sv.ot||0)+(+sv.bonus||0)+(+sv.other||0)-((+sv.dPerf||0)+(+sv.dResp||0)+(+sv.dOther||0));
  return `<div class="pagehead"><div><h1>Payslips</h1><p>Enter this month's figures and download a PDF payslip in the Fitma template. Bank details are remembered on this computer only.</p></div></div>
  ${chips}
  <div class="card"><form id="payslip-form" onsubmit="return false">
    <div class="grid g2" style="gap:14px">
      ${F('ps-desig','Designation',sv.designation||p.position||'')}
      ${F('ps-no','Payslip No.',sv.no||('41'+emp.id))}
      ${F('ps-bank','Bank Name',sv.bank||'')}
      ${F('ps-acc','Account Number',sv.account||'')}
      ${F('ps-from','Pay From (e.g. 21-Oct-2026)',sv.from||'')}
      ${F('ps-to','Pay To (e.g. 31-Oct-2026)',sv.to||'')}
      ${F('ps-date','Payslip Date',sv.date||dstr)}
      ${F('ps-method','Payment Method',sv.method||'Bank Transfer')}
    </div>
    <h3 style="margin:18px 0 8px">Earnings (LKR)</h3>
    <div class="grid g2" style="gap:14px">${money('ps-basic','Basic Salary',sv.basic)}${money('ps-ot','Overtime Allowance',sv.ot)}${money('ps-bonus','Performance Bonus',sv.bonus)}${money('ps-other','Other Allowance',sv.other)}</div>
    <h3 style="margin:18px 0 8px">Deductions (LKR)</h3>
    <div class="grid g2" style="gap:14px">${money('ps-dperf','Performance Deduction',sv.dPerf)}${money('ps-dresp','Responsibility / Conduct Deduction',sv.dResp)}${money('ps-dother','Other Deduction',sv.dOther)}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:18px;flex-wrap:wrap;gap:12px">
      <div class="muted">Net salary: <b id="ps-net" style="color:var(--ink);font-size:18px">LKR ${fmtLKR(net0)}</b></div>
      <div style="display:flex;gap:8px"><button class="btn" data-action="pay-preview" data-e="${emp.id}">${icon('eye',15)} Preview</button><button class="btn primary" data-action="pay-download" data-e="${emp.id}">${icon('dl',15)} Download payslip PDF</button></div>
    </div>
  </form></div>`;
}
function payData(){
  const g=id=>{ const el=document.getElementById(id); return el?el.value.trim():''; };
  const num=id=>{ const el=document.getElementById(id); return el?(parseFloat(el.value)||0):0; };
  return { designation:g('ps-desig'), bank:g('ps-bank'), account:g('ps-acc'), no:g('ps-no'), from:g('ps-from'), to:g('ps-to'), date:g('ps-date'), method:g('ps-method')||'Bank Transfer', currency:'LKR',
    basic:num('ps-basic'), ot:num('ps-ot'), bonus:num('ps-bonus'), other:num('ps-other'), dPerf:num('ps-dperf'), dResp:num('ps-dresp'), dOther:num('ps-dother') };
}
function payNetUpdate(){ const el=document.getElementById('ps-net'); if(!el) return; const d=payData(); const net=(d.basic+d.ot+d.bonus+d.other)-(d.dPerf+d.dResp+d.dOther); el.textContent='LKR '+fmtLKR(net); }
function payPreview(eid){
  const emp=empById(eid); if(!emp) return; const d=payData(); savePaySaved(eid,d);
  let o=document.querySelector('.overlay.payprev'); if(o)o.remove();
  o=document.createElement('div'); o.className='overlay payprev';
  o.innerHTML=`<div class="modal" data-stop="1" style="max-width:880px;width:96vw"><div class="modal-head"><div><span class="label">Payslip preview</span><h3>${esc(emp.name)}</h3></div><button class="btn sm" data-close>Close</button></div><div class="modal-body" style="background:#9aa5ad;overflow:auto"><div id="pp-scale" style="transform-origin:top left">${payslipHTML(emp,d)}</div></div><div class="modal-foot"><span class="hint">A4 · 1 page</span><button class="btn primary" data-action="pay-download" data-e="${emp.id}">${icon('dl',15)} Download PDF</button></div></div>`;
  o.addEventListener('click',ev=>{ if(ev.target.closest('[data-close]')||!ev.target.closest('[data-stop]')) o.remove(); });
  document.body.appendChild(o);
  const box=o.querySelector('.modal-body'), sc=o.querySelector('#pp-scale'); const k=Math.min(1,(box.clientWidth-20)/794); sc.style.transform='scale('+k+')'; sc.style.height=(1123*k+20)+'px';
}
async function payDownload(eid){
  const emp=empById(eid); if(!emp) return; const d=payData(); savePaySaved(eid,d);
  if (!window.html2canvas || !window.jspdf){ try{ await ensurePdfLibs(); }catch(_e){} if(!window.html2canvas||!window.jspdf) return toast('The PDF tools did not load. Please refresh and try again.'); }
  try{
    await (document.fonts?.ready||Promise.resolve());
    const stage=document.getElementById('rpt-stage'); stage.innerHTML=payslipHTML(emp,d);
    const pdf=new window.jspdf.jsPDF({unit:'mm',format:'a4',compress:true});
    const pg=stage.querySelector('.rpt-page');
    const c=await window.html2canvas(pg,{scale:2,backgroundColor:'#ffffff',logging:false}); pdf.addImage(c.toDataURL('image/jpeg',.92),'JPEG',0,0,210,297);
    stage.innerHTML='';
    const blob=pdf.output('blob'), filename=`Payslip-${emp.name.replace(/\s+/g,'-')}-${(d.to||monthLabel(CUR)).replace(/[^0-9A-Za-z-]/g,'')}.pdf`;
    await dlReady;
    if (downloadsNS){ try{ await downloadsNS.save({filename,data:blob}); toast('Payslip saved'); }catch(err){ toast(err&&err.code==='declined'?'Download cancelled':'Downloads aren’t available in this view.'); } }
    else if (downloadsNS===undefined) pdf.save(filename);
    else toast('Downloads aren’t available in this view.');
    document.querySelector('.overlay.payprev')?.remove();
  }catch(err){ toast('Could not build the payslip. Try again.'); }
}

// ===== New Monthly Progress Report (finalized template) =====
function rptPunct(lateMin){
  if(lateMin<=0) return ['Excellent','#2e8a68','#e2f2eb'];
  if(lateMin<=5) return ['Needs improvement ('+lateMin+' min)','#b97c12','#fdf3c9'];
  return ['At risk ('+lateMin+' min late)','#d0393b','#fbe7e7'];
}
function rptChip(st){
  const s=String(st||'—'); let c='#3f5d73',b='#e6edf3';
  if(/complete|met|early|done|approv/i.test(s)){c='#2e8a68';b='#e2f2eb';}
  else if(/hold|pending|paused/i.test(s)){c='#b97c12';b='#fdf3c9';}
  else if(/late|risk|overdue|miss/i.test(s)){c='#d0393b';b='#fbe7e7';}
  else if(/progress/i.test(s)){c='#3f5d73';b='#e6edf3';}
  return '<span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:10px;font-weight:700;color:'+c+';background:'+b+';white-space:nowrap">'+esc(s)+'</span>';
}
function firstDow(ym, dow){ const n=daysIn(ym); for(let i=1;i<=n;i++){ const d=dateOf(ym,i); if(d.getDay()===dow) return d; } return dateOf(ym,1); }
function reportPages(emp, ym){
  const m=metrics(emp,ym), p=profileOf(emp);
  const PG=(((typeof PROGRESS!=='undefined'&&PROGRESS)||{})[emp.id]||{})[ym]||{};
  const issued=unlockDate(ym);
  const navy='#283544', mut='#6b7c8c', line='#e4e8ec', ink='#1e2834';
  const hhmm=t=>pad(Math.floor(t/60))+':'+pad(Math.round(t%60));
  const clk=t=>{const h=Math.floor(t/60)%24,mm=Math.round(t%60);return pad(((h+11)%12)+1)+':'+pad(mm)+' '+(h<12?'AM':'PM');};
  const dlabel=d=>DN[d.getDay()]+' '+pad(d.getDate())+' '+MN[d.getMonth()].slice(0,3);
  const schedR=d=>{const sh=shiftsFor(emp,d); if(sh===null)return 'Flexible'; if(!sh.length)return 'Off'; return sh.map(x=>clk(x[0])+' - '+clk(x[1])).join(', ');};
  const prepared=issued.getDate()+' '+MN[issued.getMonth()]+' '+issued.getFullYear();
  const ymLabel=monthLabel(ym);
  const position=PG.position||p.position||(emp.plan==='founder'?'Founder':'Team member');
  const pageCss='width:794px;min-height:1123px;background:#fff;color:'+ink+';font-family:var(--body),\'Segoe UI\',system-ui,sans-serif;position:relative;overflow:hidden;box-sizing:border-box;padding:0;margin:0 auto 16px;border:0;box-shadow:none';
  const serif='font-family:var(--display),Georgia,serif';
  const H=n=>'<div style="'+serif+';font-size:21px;color:'+navy+';margin:0 0 12px">'+n+'</div>';

  // ---- header band ----
  const mark='<img src="'+LOGO_WHITE+'" alt="" style="width:46px;height:46px;object-fit:contain;flex:none">';
  const band=(sub,right1,right2)=>'<div style="background:'+navy+';color:#fff;padding:26px 40px;display:flex;align-items:center;justify-content:space-between;gap:16px">'
    +'<div style="display:flex;align-items:center;gap:16px">'+mark+'<div><div style="'+serif+';font-size:28px;line-height:1.05">Monthly Progress Report</div><div style="font-size:10px;letter-spacing:3px;color:#9fb1c2;margin-top:4px">'+sub+'</div></div></div>'
    +'<div style="text-align:right;font-size:11.5px;color:#cdd8e2"><div>'+right1+'</div><div style="margin-top:3px">'+right2+'</div></div></div>';
  const foot=n=>'<div style="position:absolute;left:40px;right:40px;bottom:22px;display:flex;justify-content:space-between;font-size:9.5px;color:#9aa7b4;border-top:1px solid '+line+';padding-top:10px">'
    +'<span>Fitma™ · info.fitma@gmail.com · www.fitma.lk</span><span>Page '+n+' of 2</span></div>';

  // ---- page 1 ----
  const scoreCard=(lbl,val)=>{
    const v=(val===0||val)?val:'–'; const w=(typeof v==='number')?Math.max(0,Math.min(100,v*10)):0;
    return '<div style="flex:1;background:#f3f6f8;border:1px solid '+line+';border-radius:12px;padding:16px 18px">'
      +'<div style="font-size:10px;letter-spacing:1.5px;font-weight:700;color:'+mut+'">'+lbl+'</div>'
      +'<div style="'+serif+';font-size:30px;color:'+navy+';margin:6px 0 10px">'+v+' <span style="font-size:14px;color:'+mut+'">/ 10</span></div>'
      +'<div style="height:6px;background:#e3e9ee;border-radius:999px;overflow:hidden"><i style="display:block;height:100%;width:'+w+'%;background:'+navy+';border-radius:999px"></i></div></div>';
  };
  const projList=(PG.projects&&PG.projects.length)?PG.projects:
    (m.tasks||[]).map(t=>({project:t.project||t.title,assigned:t.assigned?fmtD(t.assigned):'-',deadline:t.due?fmtD(t.due):'-',submitted:t.done?fmtD(t.done):'-',status:(TASKST&&t.status&&TASKST[t.status]?String(TASKST[t.status][0]).replace(/<[^>]*>/g,''):(t.done?'Completed':'In progress'))}));
  const projRows=projList.length?projList.map((pr,i)=>'<tr style="background:'+(i%2?'#f6f8fa':'#fff')+'">'
    +'<td style="padding:11px 12px;vertical-align:top;max-width:230px">'+esc(pr.project||'—')+'</td>'
    +'<td style="padding:11px 12px;vertical-align:top;color:'+mut+'">'+esc(pr.assigned||'-')+'</td>'
    +'<td style="padding:11px 12px;vertical-align:top;color:'+mut+'">'+esc(pr.deadline||'-')+'</td>'
    +'<td style="padding:11px 12px;vertical-align:top">'+esc(pr.submitted||'-')+'</td>'
    +'<td style="padding:11px 12px;vertical-align:top">'+rptChip(pr.status)+'</td></tr>').join('')
    :'<tr><td colspan="5" style="padding:14px 12px;color:'+mut+'">No projects recorded for this month.</td></tr>';

  const p1='<div class="rpt-page" style="'+pageCss+'">'+band('&nbsp;&nbsp;'+ymLabel.toUpperCase()+' · FITMA TEAM','Prepared on <b style="color:#fff">'+prepared+'</b>','Confidential · for '+esc(p.name.split(' ')[0])+'')
    +'<div style="padding:22px 40px 80px">'
    +'<div style="display:flex;justify-content:space-between;font-size:12px;color:'+mut+';border-bottom:1px solid '+line+';padding-bottom:14px;margin-bottom:20px"><span>Review Period: <b style="color:'+ink+'">1 - '+daysIn(ym)+' '+ymLabel+'</b></span><span>Report Type: <b style="color:'+ink+'">Monthly Progress Report</b></span></div>'
    +H('Employee Profile')
    +'<div style="border:1px solid '+line+';border-radius:14px;padding:22px 24px;display:grid;grid-template-columns:1fr 1fr;gap:18px 24px;margin-bottom:24px">'
      +'<div><div style="font-size:10px;letter-spacing:1.5px;color:'+mut+';font-weight:700">EMPLOYEE NAME</div><div style="'+serif+';font-size:22px;color:'+navy+';margin-top:4px">'+esc(p.name)+'</div></div>'
      +'<div><div style="font-size:10px;letter-spacing:1.5px;color:'+mut+';font-weight:700">EMPLOYEE ID</div><div style="font-weight:700;margin-top:6px">'+emp.id+'</div></div>'
      +'<div><div style="font-size:10px;letter-spacing:1.5px;color:'+mut+';font-weight:700">POSITION</div><div style="font-weight:700;margin-top:6px">'+esc(position)+'</div></div>'
      +'<div><div style="font-size:10px;letter-spacing:1.5px;color:'+mut+';font-weight:700">WORK SCHEDULE</div><div style="margin-top:6px;line-height:1.5">'+(emp.plan==='founder'?'Flexible (founder)':'Mon - Thu: '+schedR(firstDow(ym,1))+'<br>Fri: '+schedR(firstDow(ym,5)))+'</div></div>'
    +'</div>'
    +H('Progress Score')
    +'<div style="display:flex;gap:16px;margin-bottom:16px">'+scoreCard('PROJECT MANAGEMENT',PG.pm)+scoreCard('TIME MANAGEMENT',PG.tm)+scoreCard('EAGER TO LEARN',PG.eager)+'</div>'
    +'<div style="background:#f3f6f8;border-radius:12px;padding:16px 18px;font-size:11.5px;line-height:1.7;color:'+mut+';margin-bottom:26px"><b style="color:'+ink+'">How we track the progress score.</b> We look at each person\'s work during the month using the Fitma Tick tracker and our WhatsApp discussions. <b style="color:'+ink+'">Project Management</b> covers meeting deadlines, completing tasks properly, how many revisions were needed, etc. <b style="color:'+ink+'">Time Management</b> covers starting on time, following the work schedule, using the tracker correctly, etc. <b style="color:'+ink+'">Eager to Learn</b> covers asking questions, applying feedback, taking on new tasks, etc.</div>'
    +H('Projects and Deadlines')
    +'<table style="width:100%;border-collapse:collapse;font-size:11.5px"><thead><tr style="background:'+navy+';color:#fff;text-align:left"><th style="padding:10px 12px;font-weight:700;border-radius:8px 0 0 0">Project</th><th style="padding:10px 12px;font-weight:700">Assigned</th><th style="padding:10px 12px;font-weight:700">Deadline</th><th style="padding:10px 12px;font-weight:700">Submitted</th><th style="padding:10px 12px;font-weight:700;border-radius:0 8px 0 0">Status</th></tr></thead><tbody>'+projRows+'</tbody></table>'
    +'</div>'+foot(1)+'</div>';

  // ---- page 2: daily attendance ----
  const rows=m.days.filter(x=>x.shifts&&x.shifts.length&&x.status!=='future'&&x.status!=='nodata'&&x.status!=='off');
  let leaveCount=0;
  const trows=rows.map((x,i)=>{
    const bg=i%2?'#f6f8fa':'#fff'; const sched=hhmm(x.shifts[0][0]); let startedAt='—',punc,note=x.reason||'';
    if(x.status==='leave'){ leaveCount++; punc=['Leave','#6b7c8c','#eef1f4']; }
    else { const first=(x.sessions||[]).filter(s=>s.kind==='shift').sort((a,b)=>a.s-b.s)[0];
      if(first&&!first.missed){ startedAt=hhmm(first.in); punc=rptPunct(first.late||0); }
      else { punc=['At risk (no start)','#d0393b','#fbe7e7']; } }
    return '<tr style="background:'+bg+'"><td style="padding:9px 12px">'+dlabel(x.d)+'</td><td style="padding:9px 12px;color:'+mut+'">'+sched+'</td><td style="padding:9px 12px;color:'+mut+'">'+startedAt+'</td><td style="padding:9px 12px"><span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:10px;font-weight:700;color:'+punc[1]+';background:'+punc[2]+'">'+esc(punc[0])+'</span></td><td style="padding:9px 12px;color:'+mut+'">'+esc(note)+'</td></tr>';
  }).join('')||'<tr><td colspan="5" style="padding:14px 12px;color:'+mut+'">No scheduled working days recorded in this period.</td></tr>';
  const leaveTxt=leaveCount?('Leave: '+leaveCount+' day'+(leaveCount>1?'s':'')+' in this period.'):'Leave: none taken in this period.';

  const p2='<div class="rpt-page" style="'+pageCss+'">'
    +'<div style="background:'+navy+';color:#fff;padding:18px 40px;display:flex;align-items:center;justify-content:space-between"><div style="display:flex;align-items:center;gap:14px">'+mark+'<div style="'+serif+';font-size:22px">Monthly Progress Report</div></div><div style="text-align:right;font-size:11.5px;color:#cdd8e2"><div><b style="color:#fff">'+esc(p.name)+'</b></div><div>'+ymLabel+'</div></div></div>'
    +'<div style="padding:22px 40px 80px">'+H('Daily Attendance Sheet')
    +'<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:'+navy+';color:#fff;text-align:left"><th style="padding:9px 12px;border-radius:8px 0 0 0">Date</th><th style="padding:9px 12px">Start Time</th><th style="padding:9px 12px">Started At</th><th style="padding:9px 12px">Punctuality</th><th style="padding:9px 12px;border-radius:0 8px 0 0">Notes</th></tr></thead><tbody>'+trows+'</tbody></table>'
    +'<p style="font-size:10px;color:'+mut+';line-height:1.6;margin-top:14px">"Started At" is the first recorded start of the day. Punctuality: Excellent = at or before the start time; Needs improvement = 1-5 minutes late; At risk = more than 5 minutes late. '+leaveTxt+'</p>'
    +'<p style="font-size:12px;line-height:1.6;margin-top:20px">Thank you for your effort this month. If you have any questions about this report, or need any support, please let us know.</p>'
    +'<p style="font-size:12px;margin-top:10px">Best regards, <b style="'+serif+';font-size:16px">The Fitma Team</b></p>'
    +'</div>'+foot(2)+'</div>';

  return p1+p2;
}

function renderPreview(){
  const {e,m}=S.preview, emp=empById(e);
  return `<div class="overlay" data-action="close-preview"><div class="modal" role="dialog" aria-label="Report preview" data-stop="1">
    <div class="modal-head"><div><span class="label">Report preview</span><h3>${esc(emp.name)} · ${monthLabel(m)}</h3></div><button class="btn sm" data-action="close-preview-btn">Close</button></div>
    <div class="modal-body"><div id="rp-fit"><div class="rp-scale" id="rp-scale">${reportPages(emp,m)}</div></div></div>
    <div class="modal-foot"><span class="hint">A4 · 2 pages</span><button class="btn primary" data-action="download" data-e="${e}" data-m="${m}">${icon('dl',15)} Download PDF</button></div></div></div>`;
}
function fitPreview(){ const box=document.getElementById('rp-fit'), sc=document.getElementById('rp-scale'); if(!box||!sc) return; const k=Math.min(1,box.clientWidth/794); sc.style.transform=`scale(${k})`; box.style.height=(sc.scrollHeight*k)+'px'; }
let downloadsNS; const dlReady=(async()=>{ try{ downloadsNS = window.claude?.use? await window.claude.use('downloads') : undefined; }catch(e){ downloadsNS=null; } })();
let _pdfLibsP;
function ensurePdfLibs(){
  if (window.jspdf && window.html2canvas) return Promise.resolve();
  if (_pdfLibsP) return _pdfLibsP;
  _pdfLibsP = new Promise(function(resolve,reject){
    if (typeof google==='undefined' || !google.script || !google.script.run) return reject(new Error('no server'));
    google.script.run.withSuccessHandler(function(b64){
      try{
        var clean=String(b64).replace(/[^A-Za-z0-9+/=]/g,'');
        var bin=atob(clean); var bytes=new Uint8Array(bin.length);
        for(var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
        var jj=new TextDecoder('utf-8').decode(bytes);
        var s=document.createElement('script'); s.textContent=jj; document.body.appendChild(s);
        if (window.jspdf && window.html2canvas) resolve(); else { _pdfLibsP=null; reject(new Error('libs missing')); }
      }catch(e){ _pdfLibsP=null; reject(e); }
    }).withFailureHandler(function(e){ _pdfLibsP=null; reject(e); }).getPdfLibs();
  });
  return _pdfLibsP;
}
async function downloadReport(eid, ym, btn){
  const emp=empById(eid);
  if (!isAdmin() && !isUnlocked(ym)) return toast(`This report opens on ${fmtD(unlockDate(ym))}.`);
  if (!window.html2canvas || !window.jspdf) { try{ await ensurePdfLibs(); }catch(_e){} if (!window.html2canvas || !window.jspdf) return toast('The PDF tools did not load. Please refresh and try again.'); }
  const old=btn?btn.innerHTML:''; if(btn){btn.disabled=true;btn.textContent='Preparing PDF…';}
  try{
    await (document.fonts?.ready||Promise.resolve());
    const stage=document.getElementById('rpt-stage'); stage.innerHTML=reportPages(emp,ym);
    const pdf=new window.jspdf.jsPDF({unit:'mm',format:'a4',compress:true});
    const pages=stage.querySelectorAll('.rpt-page');
    for(let i=0;i<pages.length;i++){ const c=await window.html2canvas(pages[i],{scale:2,backgroundColor:'#ffffff',logging:false}); if(i) pdf.addPage(); pdf.addImage(c.toDataURL('image/jpeg',.92),'JPEG',0,0,210,297); }
    stage.innerHTML='';
    const blob=pdf.output('blob'), filename=`Fitma-Report-${emp.name}-${emp.id}-${monthLabel(ym).replace(' ','-')}.pdf`;
    await dlReady;
    if (downloadsNS){ try{ await downloadsNS.save({filename,data:blob}); toast('Report saved'); }catch(err){ toast(err?.code==='declined'?'Download cancelled':err?.code==='rate_limited'?'A download is already waiting for your confirmation.':'Downloads aren’t available in this view.'); } }
    else if (downloadsNS===undefined) pdf.save(filename);
    else toast('Downloads aren’t available in this view.');
  }catch(err){ toast('Could not build the PDF. Try again.'); }
  finally{ if(btn){btn.disabled=false;btn.innerHTML=old;} }
}

// =========================================================================
//  EVENTS
// =========================================================================
let toastT; function toast(msg){ let t=document.querySelector('.toast'); if(!t){t=document.createElement('div');t.className='toast';t.setAttribute('role','status');document.body.appendChild(t);} t.textContent=msg; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true,3600); }
function render(){
  if (!S.month || !MONTHS.includes(S.month)) S.month = CUR;
  let html;
  try {
    if (!S.user) html = renderAuth();
    else if (S.mustChange || S.view==='password') html = renderChangePw();
    else html = renderApp();
    document.getElementById('app').innerHTML = html;
  } catch(err){
    try { document.getElementById('app').innerHTML = '<div style="padding:28px;max-width:760px;margin:0 auto;font:14px/1.6 system-ui;color:#1e2834"><h2 style="font-family:Georgia,serif">We hit a snag drawing this page</h2><p style="color:#b00">'+(err&&err.message||err)+'</p><pre style="white-space:pre-wrap;font-size:12px;color:#65778a;background:#f3f5f7;padding:12px;border-radius:8px;overflow:auto">'+String((err&&err.stack)||'').slice(0,700).replace(/</g,'&lt;')+'</pre></div>'; } catch(_e){}
    return;
  }
  if (S.preview) requestAnimationFrame(fitPreview);
  try { bindForms(); } catch(e){}
}
function demoSignIn(id){ S.user=id; S.chooser=null; S.view=null; S.viewing=null; S.projFilter='all'; render(); window.scrollTo(0,0); }
async function signOutNow(){ S.view=null; S.viewing=null; S.authMsg=''; S.mustChange=false;
  if (!DEMO){ try { await api('/logout', {}); } catch(e){} setToken(''); try{ localStorage.removeItem('fw:data'); }catch(_e){} ACT_FEED=null; }
  S.user=null; render(); }
setInterval(()=>{ const el=document.getElementById('live'); const e=subject(); if(el && e && S.view==='home') el.innerHTML=liveHTML(liveStatus(e)); }, 30000);

document.addEventListener('click', async ev=>{
  const el=ev.target.closest('[data-action]'); if(!el) return; const a=el.dataset.action;
  if ((a==='close-chooser'||a==='close-preview') && ev.target.closest('[data-stop]')) return;
  switch(a){
    case 'toggle-pw': { const inp=document.getElementById(el.dataset.target); if(inp){ const show=inp.type==='password'; inp.type=show?'text':'password'; el.classList.toggle('on',show); el.setAttribute('aria-label',show?'Hide password':'Show password'); try{inp.focus();}catch(_e){} } break; }
    case 'toggle-rail': S.railCollapsed=!S.railCollapsed; try{localStorage.setItem('fw:rail',S.railCollapsed?'1':'');}catch(e){} render(); break;
    case 'demo-pick': S.chooser='Demo'; render(); break;
    case 'close-chooser': S.chooser=null; render(); break;
    case 'signin': demoSignIn(el.dataset.id); break;
    case 'signout': signOutNow(); break;
    case 'forgot': showForgot(); break;
    case 'addmember': showAddMember(); break;
    case 'pay-emp': S.payEmp=el.dataset.e; render(); break;
    case 'pay-download': payDownload(el.dataset.e); break;
    case 'pay-preview': payPreview(el.dataset.e); break;
    case 'projcard': showProjDetail(el.dataset.k); break;
    case 'changepw': S.view='password'; render(); window.scrollTo(0,0); break;
    case 'nav': S.view=el.dataset.v; S.projFilter='all'; render(); window.scrollTo(0,0); break;
    case 'open-emp': S.viewing=el.dataset.e; S.view='eval'; S.projFilter='all'; render(); window.scrollTo(0,0); break;
    case 'back-team': S.viewing=null; S.view='pulse'; render(); break;
    case 'sort': { const k=el.dataset.k; S.sort = S.sort.k===k? {k,d:-S.sort.d} : {k,d:k==='name'?1:-1}; render(); break; }
    case 'selday': S.selDay=el.dataset.k; render(); break;
    case 'pfilter': S.projFilter=el.dataset.p; render(); break;
    case 'pemp': S.projEmp=el.dataset.e; S.projFilter='all'; render(); break;
    case 'revm': S.revMonth=el.dataset.m; render(); break;
    case 'preview': S.preview={e:el.dataset.e,m:el.dataset.m}; render(); break;
    case 'close-preview': case 'close-preview-btn': S.preview=null; render(); break;
    case 'download': downloadReport(el.dataset.e, el.dataset.m, el); break;
    case 'rm-photo': { const e=subject(); try { await removePhoto(e.id); render(); toast('Photo removed'); } catch(err){ toast(err.message||'Couldn’t remove the photo.'); } break; }
    case 'save-member': saveMemberRow(el.dataset.e, el); break;
    case 'resetpw': resetPw(el.dataset.e, el); break;
    case 'save-holidays': {
      const list = [...new Set(document.getElementById('holidays').value.split(/[\s,]+/).map(s=>s.trim()).filter(Boolean))];
      const bad = list.filter(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d)); if (bad.length) return toast(`Use YYYY-MM-DD dates. Check: ${bad.join(', ')}`);
      try { await saveHolidays(list.sort()); render(); toast('Holidays saved'); } catch(e){ toast(e.message||'Couldn’t save holidays.'); } break; }
    case 'shots-emp': loadShots(el.dataset.e); break;
    case 'save-downloads': saveDownloads(); break;
    case 'assigntask': showTaskEditor(el.dataset.e||''); break;
    case 'act-emp': S.actEmp=el.dataset.e; render(); break;
    case 'deltask': delTask(el.dataset.id); break;
    case 'sample-load': sampleRun({}, el, 'Loading sample month…'); break;
    case 'sample-clear': sampleRun({clear:true}, el, 'Clearing…'); break;
    case 'editproj': showProjEditor(el.dataset.k); break;
    case 'assignproj': showProjEditor(null, el.dataset.e); break;
    case 'eval-shots': loadShots(el.dataset.id); break;
  }
});
function showProjEditor(key, newEmpId){
  const p = key ? PROJECTS.find(x=>x.key===key) : null;
  const empId = p ? p.empId : newEmpId;
  const fld = (label,inner)=>`<label style="display:grid;gap:4px"><span class="muted small">${label}</span>${inner}</label>`;
  const inp = 'style="padding:9px 10px;border:1px solid var(--line);border-radius:8px;font-size:14px;width:100%;background:var(--surface)"';
  let o=document.querySelector('.overlay.proj'); if(o) o.remove();
  o=document.createElement('div'); o.className='overlay proj';
  o.innerHTML=`<div class="sheet" style="max-width:420px" data-stop="1">
    <div class="sheet-head"><span class="label">${p?'Edit project':'Assign project'}</span><h3>${p?esc(p.name):'New project'}</h3></div>
    <div style="padding:20px;display:grid;gap:12px">
      ${p?`<p class="muted small">Start ${fmtShort(p.start)} (from the tracker)</p>`
         :fld('Project name', `<input id="pe-name" type="text" placeholder="e.g. DMK | Summary Writing" ${inp}>`)+fld('Start date', `<input id="pe-start" type="date" ${inp}>`)}
      ${fld('Deadline', `<input id="pe-due" type="date" value="${p&&p.deadline?p.deadline:''}" ${inp}>`)}
      ${fld('Completed date', `<input id="pe-done" type="date" value="${p&&p.completed?p.completed:''}" ${inp}>`)}
      ${fld('Status', `<select id="pe-status" ${inp}>
        <option value="">Auto (from dates)</option>
        <option value="progress"${p&&p.status==='progress'?' selected':''}>In progress</option>
        <option value="done"${p&&p.status==='done'?' selected':''}>Completed</option>
        <option value="paused"${p&&p.status==='paused'?' selected':''}>Paused</option></select>`)}
      <div style="display:flex;gap:8px;margin-top:4px"><button class="btn" data-close style="flex:1">Cancel</button><button class="btn primary" id="pe-save" style="flex:1">Save</button></div>
    </div></div>`;
  o.addEventListener('click', ev=>{ if(ev.target.closest('[data-close]')||!ev.target.closest('[data-stop]')) o.remove(); });
  document.body.appendChild(o);
  o.querySelector('#pe-save').addEventListener('click', async ()=>{
    const v=id=>{ const el=o.querySelector(id); return el?el.value:''; };
    const deadline=v('#pe-due'), completed=v('#pe-done'), status=v('#pe-status');
    const btn=o.querySelector('#pe-save'); btn.disabled=true;
    try{
      if(p){ await api('/projectmeta',{key:p.key, deadline, completed, status}); }
      else { const nm=(v('#pe-name')||'').trim(); if(!nm){ btn.disabled=false; return toast('Enter a project name.'); }
        await api('/addproject',{empId, name:nm, start:v('#pe-start'), deadline, completed, status}); }
      o.remove(); await loadData().catch(()=>{}); render(); toast('Project saved');
    }catch(err){ btn.disabled=false; toast(err.message||'Couldn’t save the project.'); }
  });
}
async function loadShots(id){ S.shotEmp=id; S.shots=null; S.shotsLoading=true; render();
  try { const r = S.shotYm ? await api('/shotsby', { empId:id, ym:S.shotYm }) : await api('/shots', { empId:id }); S.shots = r.shots || []; }
  catch(err){ S.shots = []; if(!DEMO) toast(err.message||'Couldn\u2019t load screenshots.'); }
  S.shotsLoading=false; render(); }
async function saveDownloads(){ const win=(document.getElementById('dl-win').value||'').trim(), mac=(document.getElementById('dl-mac').value||'').trim();
  try { await api('/downloads',{win,mac}); SETTINGS.downloads={win,mac}; render(); toast('Download links saved'); }
  catch(err){ toast(err.message||'Couldn\u2019t save links.'); } }
async function sampleRun(opts, btn, busy){
  if (DEMO) return; S.busy=busy; render();
  try { await sampleData(opts); S.busy=''; render(); toast(opts.clear?'Sample data cleared':'Sample month loaded'); }
  catch(e){ S.busy=''; render(); toast(e.message||'Couldn’t update sample data.'); }
}
async function resetPw(id, btn){
  const e=empById(id); btn.disabled=true;
  try { const pw = await resetMemberPw(id);
    window.setTimeout(()=>{ toast(`New password for ${e.name}: ${pw}`); }, 0);
    showReset(e, pw);
  } catch(err){ btn.disabled=false; toast(err.message||'Couldn’t reset the password.'); }
}
function showReset(e, pw){
  let o=document.querySelector('.overlay.reset'); if(o) o.remove();
  o=document.createElement('div'); o.className='overlay reset'; o.innerHTML=`<div class="sheet" style="max-width:380px" data-stop="1">
    <div class="sheet-head"><span class="label">Password reset</span><h3>${esc(e.name)}</h3></div>
    <div style="padding:20px;display:grid;gap:12px">
      <p class="muted small">Share this starter password with ${esc(e.name)}. They'll set their own on next sign-in.</p>
      <div style="font-family:var(--display);font-size:22px;letter-spacing:1px;background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:12px;text-align:center">${esc(pw)}</div>
      <button class="btn primary" data-close>Done</button>
    </div></div>`;
  o.addEventListener('click', ev=>{ if(ev.target.closest('[data-close]')||!ev.target.closest('[data-stop]')) o.remove(); });
  document.body.appendChild(o);
}
function showForgot(){
  let o=document.querySelector('.overlay.forgot'); if(o) o.remove();
  o=document.createElement('div'); o.className='overlay forgot'; o.innerHTML=`<div class="sheet" style="max-width:400px" data-stop="1">
    <div class="sheet-head"><span class="label">Password help</span><h3>Reset your password</h3></div>
    <div style="padding:20px;display:grid;gap:12px">
      <p class="muted small">For your security, passwords are reset by your admin. Message your admin and they'll set a new password for you right away and share it with you. You can change it to your own once you're signed in.</p>
      <button class="btn primary" data-close>Got it</button>
    </div></div>`;
  o.addEventListener('click', ev=>{ if(ev.target.closest('[data-close]')||!ev.target.closest('[data-stop]')) o.remove(); });
  document.body.appendChild(o);
}
function showAddMember(){
  let o=document.querySelector('.overlay.addmem'); if(o) o.remove();
  const inp='class="fchip" style="width:100%;min-width:0"';
  o=document.createElement('div'); o.className='overlay addmem'; o.innerHTML=`<div class="sheet" style="max-width:470px" data-stop="1">
    <div class="sheet-head"><span class="label">Team &amp; access</span><h3>Add a team member</h3></div>
    <div style="padding:20px;display:grid;gap:12px">
      <p class="muted small">Creates their account and shows you a starter password to share with them. They set their own on first sign-in, and can use it for Fitma Tick too.</p>
      <div class="field"><label for="am-name">Full name</label><input id="am-name" type="text" ${inp}></div>
      <div class="field"><label for="am-email">Sign-in email</label><input id="am-email" type="email" placeholder="name@gmail.com" autocapitalize="off" autocorrect="off" spellcheck="false" ${inp}></div>
      <div class="field"><label for="am-pos">Position</label><input id="am-pos" type="text" placeholder="e.g. Intern" ${inp}></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field"><label for="am-plan">Schedule</label><select id="am-plan" ${inp}>${['std4','std3','founder','unset'].map(p=>`<option value="${p}">${PLAN_LABEL[p]}</option>`).join('')}</select></div>
        <div class="field"><label for="am-gen">Friday hours</label><select id="am-gen" ${inp}><option value="">Not set</option><option value="M">Men\u2019s</option><option value="F">Women\u2019s</option></select></div>
      </div>
      <p class="hint" id="am-msg"></p>
      <div style="display:flex;gap:8px"><button class="btn" data-close style="flex:1">Cancel</button><button class="btn primary" id="am-save" style="flex:1">Create account</button></div>
    </div></div>`;
  o.addEventListener('click', ev=>{ if(ev.target.closest('[data-close]')||!ev.target.closest('[data-stop]')) o.remove(); });
  document.body.appendChild(o);
  const msgEl=o.querySelector('#am-msg'); const say=(t,bad)=>{ if(msgEl){ msgEl.textContent=t; msgEl.className='hint'+(bad?' err':''); } };
  o.querySelector('#am-save').addEventListener('click', async ()=>{
    const g=id=>{ const el=o.querySelector(id); return el?(el.value||'').trim():''; };
    const name=g('#am-name'), email=g('#am-email').toLowerCase(), position=g('#am-pos'),
          plan=o.querySelector('#am-plan').value, gender=o.querySelector('#am-gen').value;
    if(!name) return say('Enter the person\u2019s name.', true);
    if(!/^\S+@\S+\.\S+$/.test(email)) return say('Enter a valid email address.', true);
    if(email===ADMIN.email) return say('That is the admin address. Use the member\u2019s own email.', true);
    if(TEAM.find(x=>accessEmail(x)===email)) return say('That email already has an account.', true);
    const btn=o.querySelector('#am-save'); btn.disabled=true; say('Creating\u2026');
    try{ const r=await api('/addmember',{name,email,plan,gender,position}); o.remove(); await loadData(); render(); if(r&&r.password){ showReset({name:name}, r.password); } else { toast(name+' added.'); } }
    catch(e){ btn.disabled=false; say(e.message||'Could not add the member.', true); }
  });
  try{ o.querySelector('#am-name').focus(); }catch(_e){}
}
async function saveMemberRow(id, btn){
  const e = empById(id); const email = document.getElementById('acc-'+id).value.trim().toLowerCase();
  const plan = document.getElementById('plan-'+id).value, gender = document.getElementById('gen-'+id).value;
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return toast('Enter a valid email address.');
  if (email === ADMIN.email) return toast('That is the admin address. Use the member’s own email.');
  const clash = TEAM.find(x=>x.id!==id && accessEmail(x)===email); if (email && clash) return toast(`That address is already registered for ${clash.name}.`);
  const upd = {}; if (plan!==e.plan) upd.plan=plan; if (gender!==(e.gender||'')) upd.gender=gender; if (email!==accessEmail(e)) upd.email=email;
  if (!Object.keys(upd).length) return toast('Nothing to save.');
  btn.disabled = true;
  try { await saveMemberAll(id, upd); fillGaps(); render(); toast(`Saved ${e.name}.`); }
  catch(err){ btn.disabled=false; toast(err.message || 'Couldn’t save. Try again.'); }
}
document.addEventListener('change', ev=>{ if(ev.target.id==='shots-ym'){ S.shotYm=ev.target.value||null; if(S.shotEmp) loadShots(S.shotEmp); return; } const id=ev.target.dataset.change; if(!id) return; S.month=ev.target.value; S.selDay=null; S.projFilter='all'; render(); });
document.addEventListener('input', ev=>{ if(ev.target.classList&&ev.target.classList.contains('pay-amt')) payNetUpdate(); });
document.addEventListener('keydown', ev=>{ if(ev.key==='Escape'){ if(S.preview||S.chooser){ S.preview=null; S.chooser=null; render(); } document.querySelector('.overlay.reset')?.remove(); document.querySelector('.overlay.forgot')?.remove(); document.querySelector('.overlay.addmem')?.remove(); document.querySelector('.overlay.payprev')?.remove(); document.querySelector('.overlay.projdetail')?.remove(); } });
window.addEventListener('resize', ()=>{ if(S.preview) fitPreview(); });

function bindForms(){
  const af=document.getElementById('auth-form');
  if (af) af.addEventListener('submit', async ev=>{ ev.preventDefault();
    if (DEMO) return;
    const msg=document.getElementById('auth-msg'); const say=(t,bad)=>{ if(msg){ msg.textContent=t; msg.className='hint'+(bad?' err':''); } };
    const email=(document.getElementById('f-email').value||'').trim().toLowerCase();
    const pass=document.getElementById('f-pass').value||'';
    if (!/^\S+@\S+\.\S+$/.test(email)) return say('Enter a valid email address.', true);
    if (!pass) return say('Enter your password.', true);
    const btn=af.querySelector('button[type=submit]'); btn.disabled=true;
    try { const r = await api('/login', { email, password:pass }); setToken(r.token); S.authMsg='';
      try{ if(window.PasswordCredential && navigator.credentials && navigator.credentials.store){ await navigator.credentials.store(new PasswordCredential({ id:email, password:pass, name:email })); } }catch(_){}
      S.mustChange = !!r.mustChange; await startSession(); }
    catch(e){ btn.disabled=false; say(e.message, true); }
  });
  const pwf=document.getElementById('pw-form');
  if (pwf) pwf.addEventListener('submit', async ev=>{ ev.preventDefault();
    const msg=document.getElementById('pw-msg'); const say=(t,bad)=>{ if(msg){ msg.textContent=t; msg.className='hint'+(bad?' err':''); } };
    const oldP=document.getElementById('pw-old').value||'', n1=document.getElementById('pw-new').value||'', n2=document.getElementById('pw-new2').value||'';
    if (n1.length<8) return say('Your new password needs at least 8 characters.', true);
    if (n1!==n2) return say('The two new passwords don’t match.', true);
    const btn=pwf.querySelector('button[type=submit]'); btn.disabled=true;
    try { await changePassword(oldP, n1); S.mustChange=false;
      try{ var _em=(S.user&&S.user.email)||(subject&&subject()&&subject().email)||''; if(_em && window.PasswordCredential && navigator.credentials && navigator.credentials.store){ await navigator.credentials.store(new PasswordCredential({ id:_em, password:n1, name:_em })); } }catch(_){}
      if (S.view==='password') S.view='profile';
      if (!S.user){ await startSession(); } else { await loadData().catch(()=>{}); render(); }
      toast('Password changed'); }
    catch(e){ btn.disabled=false; say(e.message, true); }
  });
  const pf=document.getElementById('profile-form');
  if (pf){ const emp=subject();
    pf.addEventListener('submit', async ev=>{ ev.preventDefault();
      const data = { name:document.getElementById('p-name').value.trim()||emp.name, location:document.getElementById('p-loc').value.trim(), position:document.getElementById('p-pos').value.trim(), wa:document.getElementById('p-wa').value.trim(), offEmail:document.getElementById('p-email').value.trim() };
      try { await saveProfile(emp.id, data); render(); toast('Profile saved'); } catch(e){ toast(e.message||'Couldn’t save your profile.'); } });
    const fp=document.getElementById('f-photo');
    if (fp) fp.addEventListener('change', ev=>{ const file=ev.target.files[0]; if(!file) return; if(!file.type.startsWith('image/')) return toast('Choose an image file (JPG or PNG).');
      const rd=new FileReader(); rd.onload=()=>{ const img=new Image(); img.onload=async ()=>{ const c=document.createElement('canvas'),sz=320; c.width=c.height=sz; const k=Math.max(sz/img.width,sz/img.height),w=img.width*k,h=img.height*k; c.getContext('2d').drawImage(img,(sz-w)/2,(sz-h)/2,w,h);
        try { await saveProfile(emp.id, { photo: c.toDataURL('image/jpeg',.82) }); render(); toast('Photo updated'); } catch(e){ toast(e.message||'Couldn’t save the photo.'); } }; img.src=rd.result; }; rd.readAsDataURL(file); });
  }
}

// ---------- start ----------
try{document.documentElement.setAttribute('data-theme','light');}catch(_e){}
try{S.railCollapsed=localStorage.getItem('fw:rail')==='1';}catch(_e){}
(async function boot(){
  if (DEMO){ await loadDemoData(); S.loading=false; window.__fw = { S, render, signIn:demoSignIn }; render(); return; }
  await startSession();
})();
