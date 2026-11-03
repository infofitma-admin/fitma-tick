// ===== Fitma Workspace v2: speed, forgot-password, employees, progress, screenshots =====

// ---- password + email helpers ----
function newStarterPw_(){
  var UP='ABCDEFGHJKLMNPQRSTUVWXYZ', LO='abcdefghijkmnpqrstuvwxyz', DI='23456789', SY='#@%&';
  function pick(s){ return s.charAt(Math.floor(Math.random()*s.length)); }
  var out=pick(UP); for(var i=0;i<4;i++) out+=pick(LO); out+=pick(SY); for(var j=0;j<4;j++) out+=pick(DI);
  return out;
}
function mail_(to, subject, body){
  try { MailApp.sendEmail({ to:to, subject:subject, htmlBody:body.replace(/\n/g,'<br>') }); return true; } catch(e){ return false; }
}

// ---- forgot password (public) ----
function apiForgot_(body){
  var email=lc_(String(body.email||''));
  if(!email) return out_(400, { error:'Enter your email.' });
  var rows=readAll_('Auth'), idx=-1;
  for(var i=0;i<rows.length;i++) if(lc_(rows[i].email)===email){ idx=i; break; }
  if(idx>=0){
    var pw=newStarterPw_(), salt=Utilities.getUuid();
    updateCell_('Auth', idx, 'salt', salt);
    updateCell_('Auth', idx, 'hash', hashPw_(salt, pw));
    updateCell_('Auth', idx, 'mustChange', true);
    updateCell_('Auth', idx, 'updatedAt', new Date().toISOString());
    mail_(email, 'Your Fitma Workspace password reset',
      'Hello,\n\nYour Fitma Workspace password has been reset. Use this temporary password to sign in, then set your own:\n\nTemporary password: '+pw+'\n\nSign in at the Workspace link your admin shared. You will be asked to choose a new password on first login.\n\n— Fitma Team');
  }
  // always report success (don't reveal whether an account exists)
  return out_(200, { ok:true });
}

// ---- add a new employee (admin) ----
function apiAddMember_(body){
  var name=String(body.name||'').trim(), email=lc_(String(body.email||'')), plan=String(body.plan||'std4'),
      gender=String(body.gender||''), position=String(body.position||'');
  if(!name||!email) return out_(400, { error:'Name and email are required.' });
  var auth=readAll_('Auth');
  for(var i=0;i<auth.length;i++) if(lc_(auth[i].email)===email) return out_(400, { error:'That email already has an account.' });
  // next employee id
  var members=readAll_('Members'), maxId=266000;
  members.forEach(function(m){ var n=parseInt(m.id,10); if(!isNaN(n)&&n>maxId) maxId=n; });
  var id=String(maxId+1);
  appendRow_('Members', { id:id, name:name, gender:gender, plan:plan, email:email, active:true, deviceToken:'', createdAt:new Date().toISOString() });
  var pw=newStarterPw_(), salt=Utilities.getUuid();
  appendRow_('Auth', { email:email, empId:id, role:'member', salt:salt, hash:hashPw_(salt, pw), mustChange:true, updatedAt:new Date().toISOString() });
  if(position){ var pid=id; try{ var prof=profileById_(pid)||{}; prof.position=position; setProfile_(pid, prof); }catch(e){} }
  mail_(email, 'Welcome to Fitma Workspace',
    'Hello '+name+',\n\nAn account has been created for you on the Fitma Workspace.\n\nEmail: '+email+'\nTemporary password: '+pw+'\n\nYou will be asked to set your own password on first login. You can also use these to sign in to the Fitma Tick desktop app.\n\n— Fitma Team');
  return out_(200, { ok:true, id:id });
}
function setProfile_(id, data){
  var rows=readAll_('Profiles');
  for(var i=0;i<rows.length;i++) if(String(rows[i].id)===String(id)){ updateCell_('Profiles', i, 'json', JSON.stringify(data)); return; }
  appendRow_('Profiles', { id:String(id), json:JSON.stringify(data) });
}

// ---- progress scores + project statuses (admin) ----
function apiProgress_(body){
  ensureSheet_('Progress', ['empId','ym','data']);
  var empId=String(body.empId||''), ym=String(body.ym||''), data=JSON.stringify(body.data||{});
  if(!empId||!ym) return out_(400, { error:'empId and ym required.' });
  var rows=readAll_('Progress');
  for(var i=0;i<rows.length;i++) if(String(rows[i].empId)===empId && String(rows[i].ym)===ym){ updateCell_('Progress', i, 'data', data); return out_(200,{ok:true}); }
  appendRow_('Progress', { empId:empId, ym:ym, data:data });
  return out_(200, { ok:true });
}
function progressAll_(who){
  if(!db_().getSheetByName('Progress')) return {};
  var rows=readAll_('Progress'), out={};
  rows.forEach(function(r){
    if(who.role!=='admin' && String(r.empId)!==String(who.empId)) return;
    var o=out[r.empId]||(out[r.empId]={});
    try{ o[r.ym]=JSON.parse(r.data||'{}'); }catch(e){ o[r.ym]={}; }
  });
  return out;
}

// ---- lazy activity feed (admin) ----
function apiActivityFeed_(who){
  return out_(200, { events: recentEvents_(who), activity: recentActivity_(who) });
}

// ---- screenshots by month (admin) ----
function apiShotsBy_(body){
  var empId=String(body.empId||''), ym=String(body.ym||'');
  if(!db_().getSheetByName('Screens')) return out_(200,{ shots:[] });
  var rows=readAll_('Screens'), out=[];
  rows.forEach(function(r){
    if(String(r.empId)!==empId) return;
    var ts=String(r.ts||''); if(ym && ts.indexOf(ym)!==0 && isoToKey_(ts).indexOf(ym)!==0) return;
    out.push({ ts:r.ts, activity:Number(r.activity)||0, thumb:r.thumb||'', fileId:r.fileId||'' });
  });
  out.sort(function(a,b){ return a.ts<b.ts?1:-1; });
  if(out.length>120) out=out.slice(0,120);
  return out_(200, { shots: out });
}

// ---- one-time: seed October 2026 progress scores + project statuses ----
function seedOctProgress_run(){
  ensureSheet_('Progress', ['empId','ym','data']);
  var ym='2026-10';
  var P={
    '266001':{pm:8,tm:4,eager:9,position:'Senior Administrative Executive',
      highlights:['You were present every single working day this month.','You built the website homepage, FAQs, About, Contact and four service pages in about ten days, and the designs looked great.','You picked up SEO keyword and FAQ research quickly and adapted well to a brand-new project.'],
      projects:[
        {project:'DMK | Prepare Google NotebookLM for Thailand Semicon Education Curriculum', assigned:'1 Oct', deadline:'-', submitted:'Research in progress (12 MIT modules reviewed by 15 Oct); put on hold 19 Oct', status:'On hold'},
        {project:'DMK | Landing Pages Design (company website)', assigned:'19 Oct', deadline:'-', submitted:'Homepage, FAQs, About, Contact and 4 service pages (by 28 Oct)', status:'In progress'}]},
    '266005':{pm:8,tm:10,eager:9,position:'Intern',
      highlights:['You started on time every single working day.','You completed all the social media designs in your very first week.','You met your research deadline and chose to put in extra time to finish your work. That effort really stands out.'],
      projects:[
        {project:'PPP | Content Design (carousels, posts, stories, highlight covers)', assigned:'19 Oct', deadline:'-', submitted:'Posts and stories by 22 Oct; covers 26 Oct', status:'Completed'},
        {project:'LT | Arch Logo (reference research)', assigned:'23 Oct', deadline:'-', submitted:'References shared 23, 26 and 27 Oct', status:'Completed'},
        {project:'DMK | DZ Logo Design Work', assigned:'27 Oct', deadline:'-', submitted:'Worked on 27 Oct', status:'In progress'},
        {project:'PPP | Content Research (sustainable financial planning)', assigned:'28 Oct', deadline:'30 Oct', submitted:'30 Oct, 08:48 PM; feedback given 1 Nov', status:'Met deadline'}]},
    '266006':{pm:6,tm:10,eager:7,position:'Intern',
      highlights:['You started on time every day and joined early whenever we asked.','Your daily updates kept everyone informed about your work.','You built a clear structure for the Google Ads research document.'],
      projects:[
        {project:'DMK | YouTube Summary Writing 04', assigned:'21 Oct', deadline:'23 Oct', submitted:'First version before the deadline; final version 26 Oct after revisions', status:'Final 1 working day late'},
        {project:'DMK | Revision Works | How to use Google Ads in Websites', assigned:'26 Oct', deadline:'-', submitted:'31 Oct, 01:28 PM', status:'Completed'}]},
    '266007':{pm:8,tm:10,eager:9,position:'Intern',
      highlights:['Every summary was submitted on or before its deadline, and two of them were a day early.','Your writing improved quickly with feedback, and your revised summary was approved.','You ask thoughtful questions and always keep the team informed.'],
      projects:[
        {project:'DMK | YouTube Summary Writing 01', assigned:'22 Oct', deadline:'26 Oct', submitted:'26 Oct, 09:47 AM (deadline day)', status:'Met deadline'},
        {project:'DMK | YouTube Summary Writing 02', assigned:'26 Oct', deadline:'29 Oct', submitted:'28 Oct; revised and approved 29 Oct', status:'1 day early'},
        {project:'DMK | YouTube Summary Writing 03', assigned:'28 Oct', deadline:'31 Oct', submitted:'30 Oct, 04:09 PM', status:'1 day early'},
        {project:'DMK | YouTube Summary Writing 04', assigned:'30 Oct', deadline:'3 Nov', submitted:'-', status:'In progress'}]}
  };
  var res=[];
  for(var id in P){
    var data=JSON.stringify(P[id]);
    var rows=readAll_('Progress'), done=false;
    for(var i=0;i<rows.length;i++) if(String(rows[i].empId)===id && String(rows[i].ym)===ym){ updateCell_('Progress', i, 'data', data); done=true; break; }
    if(!done) appendRow_('Progress', { empId:id, ym:ym, data:data });
    res.push(id);
  }
  Logger.log('SEEDED progress for '+res.join(','));
  return 'OK '+res.length;
}
