function seedWebworkTime_run(){
  if(!db_().getSheetByName('TimeEntries')) ensureSheet_('TimeEntries',['date','empId','start','end','type','project','task','note','source']);
  var sh=db_().getSheetByName('TimeEntries');
  if(sh.getLastRow()>1) sh.getRange(2,1,sh.getLastRow()-1,9).clearContent();
  var txt=UrlFetchApp.fetch('https://raw.githubusercontent.com/infofitma-admin/fitma-tick/main/web/timeentries.tsv?cb='+Date.now()).getContentText();
  var lines=txt.split(/\r?\n/).filter(function(l){return l.indexOf('\t')>-1;});
  var rows=lines.map(function(l){var c=l.split('\t');return [c[0],c[1],c[2],c[3],c[4]||'',c[5]||'',c[6]||'',c[7]||'',c[8]||''];});
  if(rows.length) sh.getRange(2,1,rows.length,9).setValues(rows);
  SpreadsheetApp.flush();
  return 'SEEDED '+rows.length+' rows';
}
function clearTimeEntries_run(){
  var sh=db_().getSheetByName('TimeEntries');
  if(sh&&sh.getLastRow()>1){ sh.getRange(2,1,sh.getLastRow()-1,9).clearContent(); SpreadsheetApp.flush(); }
  return 'CLEARED';
}
