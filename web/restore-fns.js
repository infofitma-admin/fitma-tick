// ===== restored backend functions (addmember, progress, activity, screenshots, tasks, projects) =====
function newStarterPw_(){
  var UP='ABCDEFGHJKLMNPQRSTUVWXYZ', LO='abcdefghijkmnpqrstuvwxyz', DI='23456789', SY='#@%&';
  function pick(s){ return s.charAt(Math.floor(Math.random()*s.length)); }
  var out=pick(UP); for(var i=0;i<4;i++) out+=pick(LO); out+=pick(SY); for(var j=0;j<4;j++) out+=pick(DI);
  return out;
}
function mail_(to, subject, body){
  try { MailApp.sendEmail({ to:to, subject:subject, htmlBody:body.replace(/\n/g,'<br>') }); return true; } catch(e){ return false; }
}
function ensureSheet_(name, headers){
  var ss=db_(); var sh=ss.getSheetByName(name);
  if(!sh){ sh=ss.insertSheet(name); sh.getRange(1,1,1,headers.length).setValues([headers]); return sh; }
  var lastCol=sh.getLastColumn()||0;
  var head=lastCol?sh.getRange(1,1,1,lastCol).getValues()[0]:[];
  var add=headers.filter(function(h){ return head.indexOf(h)<0; });
  if(add.length) sh.getRange(1,head.length+1,1,add.length).setValues([add]);
  return sh;
}
function apiAddMember_(body){
  var name=String(body.name||'').trim(), email=lc_(String(body.email||'')), plan=String(body.plan||'std4'),
      gender=String(body.gender||''), position=String(body.position||'');
  if(!name||!email) return out_(400, { error:'Name and email are required.' });
  var auth=readAll_('Auth');
  for(var i=0;i<auth.length;i++) if(lc_(auth[i].email)===email) return out_(400, { error:'That email already has an account.' });
  var members=readAll_('Members'), maxId=266000;
  members.forEach(function(m){ var n=parseInt(m.id,10); if(!isNaN(n)&&n>maxId) maxId=n; });
  var id=String(maxId+1);
  appendRow_('Members', { id:id, name:name, gender:gender, plan:plan, email:email, active:true, deviceToken:'', createdAt:new Date().toISOString() });
  var pw=newStarterPw_(), salt=Utilities.getUuid();
  appendRow_('Auth', { email:email, empId:id, role:'member', salt:salt, hash:hashPw_(salt, pw), mustChange:true, updatedAt:new Date().toISOString() });
  if(position){ try{ var prof=profileById_(id)||{}; prof.position=position; saveProfile_(id, prof); }catch(e){} }
  mail_(email, 'Welcome to Fitma Workspace',
    'Hello '+name+',\n\nAn account has been created for you on the Fitma Workspace.\n\nEmail: '+email+'\nTemporary password: '+pw+'\n\nYou will be asked to set your own password on first login. You can also use these to sign in to the Fitma Tick desktop app.\n\n-- Fitma Team');
  return out_(200, { ok:true, id:id });
}
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
function recentEvents_(who){
  if(!db_().getSheetByName('WorkEvents')) return [];
  var rows=readAll_('WorkEvents');
  if(who.role!=='admin') rows=rows.filter(function(r){ return String(r.empId)===String(who.empId); });
  var cut=Date.now()-4*864e5;
  rows=rows.filter(function(r){ var t=Date.parse(r.ts); return !t||t>=cut; });
  if(rows.length>4000) rows=rows.slice(rows.length-4000);
  return rows.map(function(r){ return { ts:r.ts, empId:String(r.empId), type:r.type, project:r.project||'' }; });
}
function recentActivity_(who){
  if(!db_().getSheetByName('Activity')) return [];
  var rows=readAll_('Activity');
  if(who.role!=='admin') rows=rows.filter(function(r){ return String(r.empId)===String(who.empId); });
  var cut=Date.now()-3*864e5;
  rows=rows.filter(function(r){ var t=Date.parse(r.ts); return !t||t>=cut; });
  if(rows.length>5000) rows=rows.slice(rows.length-5000);
  return rows.map(function(r){ return { ts:r.ts, empId:String(r.empId), app:r.app||'', title:r.title||'', url:r.url||'', host:r.host||'', ai:(r.ai===true||r.ai==='TRUE'||r.ai==='true'), project:r.project||'' }; });
}
function apiActivityFeed_(who){
  return out_(200, { events: recentEvents_(who), activity: recentActivity_(who) });
}
function apiShotsBy_(body){
  var empId=String(body.empId||''), ym=String(body.ym||'');
  if(!db_().getSheetByName('Screens')) return out_(200,{ shots:[] });
  var rows=readAll_('Screens'), out=[];
  rows.forEach(function(r){
    if(String(r.empId)!==empId) return;
    var ts=String(r.ts||''); if(ym && ts.indexOf(ym)!==0 && isoToKey_(ts).indexOf(ym)!==0) return;
    var url='';
    try{ url='data:image/jpeg;base64,'+Utilities.base64Encode(DriveApp.getFileById(r.fileId).getBlob().getBytes()); }catch(e){}
    out.push({ ts:r.ts, activity:Number(r.activity)||0, url:url });
  });
  out.sort(function(a,b){ return a.ts<b.ts?1:-1; });
  if(out.length>60) out=out.slice(0,60);
  return out_(200, { shots: out });
}
function workEvents_(body){
  var m=memberByDevice_(body.deviceToken); if(!m) return out_(401, { error:'Unknown device. Sign in to Fitma Tick again.' });
  ensureSheet_('WorkEvents', ['ts','empId','type','project']);
  var rows=(body.events||[]).map(function(e){ return { ts:String(e.ts||new Date().toISOString()), empId:m.id, type:String(e.type||''), project:String(e.project||'') }; });
  if(rows.length) bulkAppend_('WorkEvents', rows);
  return out_(200, { ok:true, received:rows.length });
}
function activity_(body){
  var m=memberByDevice_(body.deviceToken); if(!m) return out_(401, { error:'Unknown device. Sign in to Fitma Tick again.' });
  ensureSheet_('Activity', ['ts','empId','app','title','url','host','ai','project']);
  var rows=(body.items||[]).map(function(a){ return { ts:String(a.ts||new Date().toISOString()), empId:m.id, app:String(a.app||'').slice(0,120), title:String(a.title||'').slice(0,300), url:String(a.url||'').slice(0,500), host:String(a.host||'').slice(0,120), ai:(a.ai===true||a.ai==='true'||a.ai==='TRUE'), project:String(a.project||'') }; });
  if(rows.length) bulkAppend_('Activity', rows);
  return out_(200, { ok:true, received:rows.length });
}
function apiTask_(body){
  ensureSheet_('Tasks', ['id','empId','project','title','assigned','due','done','started','desc']);
  var id=String(body.id||('T'+Date.now()+Math.floor(Math.random()*1000)));
  var rec={ id:id, empId:String(body.empId||''), project:String(body.topic||body.project||''), title:String(body.title||body.task||'Task'), assigned:String(body.assigned||''), due:String(body.due||''), done:String(body.done||''), started:'', desc:String(body.desc||body.description||'') };
  var rows=readAll_('Tasks'); var idx=-1;
  for(var i=0;i<rows.length;i++) if(String(rows[i].id)===id){ idx=i; break; }
  if(idx<0){ appendRow_('Tasks', rec); }
  else { ['empId','project','title','assigned','due','done','desc'].forEach(function(c){ updateCell_('Tasks', idx, c, rec[c]); }); }
  return out_(200, { ok:true, id:id });
}
function apiTaskDel_(body){
  var id=String(body.id||''); if(!id) return out_(400, { error:'No task id.' });
  var rows=readAll_('Tasks');
  for(var i=0;i<rows.length;i++) if(String(rows[i].id)===id){ deleteRow_('Tasks', i); return out_(200, { ok:true }); }
  return out_(200, { ok:true });
}
function projectsAll_(who){
  if(!db_().getSheetByName('Projects')) return [];
  var rows=readAll_('Projects'), out=[];
  rows.forEach(function(r){
    if(who.role!=='admin' && String(r.empId)!==String(who.empId)) return;
    out.push({ key:String(r.key||r.name), empId:String(r.empId||''), name:String(r.name||''), start:String(r.start||''), deadline:String(r.deadline||''), completed:String(r.completed||''), status:String(r.status||'') });
  });
  return out;
}
function apiAddProject_(body){
  ensureSheet_('Projects', ['key','empId','name','start','deadline','completed','status']);
  var key='P'+Date.now()+Math.floor(Math.random()*1000);
  appendRow_('Projects', { key:key, empId:String(body.empId||''), name:String(body.name||'').slice(0,160), start:String(body.start||''), deadline:String(body.deadline||''), completed:String(body.completed||''), status:String(body.status||'') });
  return out_(200, { ok:true, key:key });
}
function apiProjectMeta_(body){
  ensureSheet_('Projects', ['key','empId','name','start','deadline','completed','status']);
  var key=String(body.key||''), rows=readAll_('Projects');
  for(var i=0;i<rows.length;i++) if(String(rows[i].key)===key){
    if('deadline' in body) updateCell_('Projects', i, 'deadline', String(body.deadline||''));
    if('completed' in body) updateCell_('Projects', i, 'completed', String(body.completed||''));
    if('status' in body) updateCell_('Projects', i, 'status', String(body.status||''));
    return out_(200, { ok:true });
  }
  return out_(400, { error:'Unknown project.' });
}
