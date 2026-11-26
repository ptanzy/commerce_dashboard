const test=require('node:test');
const assert=require('node:assert/strict');
const investigation=require('../dist-test/observability/investigation.js');
const ops=require('../dist-test/observability/diagnostics.js');
const grace=investigation.RECOVERY_CONFIRMATION_MS;
const start=Date.parse('2026-11-25T12:00:00.000Z');
const at=(ms)=>new Date(start+ms).toISOString();
const err=(ms,code='GEOGRAPHY_LOAD_FAILED',area='map')=>({timestamp:at(ms),code,area,level:'error'});
const ok=(ms,code='GEOGRAPHY_LOADED',area='map')=>({timestamp:at(ms),code,area,level:'info'});
const cases=(events,now)=>investigation.listIncidentCases({...ops.getDiagnosticsSnapshot(),events},start+now);
const active=(rows)=>rows.filter(x=>x.status!=='recovered');
const history=(rows)=>rows.filter(x=>x.status==='recovered');
test('explicit success starts grace; 59,999 stays active and 60,000 archives',()=>{
  const events=[err(0),ok(1000)];
  assert.equal(active(cases(events,1000+grace-1)).length,1);
  assert.equal(cases(events,1000+grace-1)[0].status,'recovery-observed');
  assert.equal(active(cases(events,1000+grace)).length,0);
  assert.equal(history(cases(events,1000+grace))[0].archivedAt,at(1000+grace));
});
test('silence or unrelated success does not archive an error',()=>{
  assert.equal(cases([err(0)],grace*30)[0].status,'unresolved');
  assert.equal(cases([err(0),ok(1000,'DATASET_LOADED','app')],grace*30)[0].status,'unresolved');
});
test('matching error inside grace resets recovery and counts once',()=>{
  const rows=cases([err(0),ok(1000),err(2000)],grace*3);
  assert.equal(rows.length,1);assert.equal(rows[0].occurrences,2);
  assert.equal(rows[0].status,'unresolved');
});
test('a later recurrence has its own active case while archived evidence stays available',()=>{
  const events=[err(0),ok(1000),err(1000+grace+1)];
  const rows=cases(events,1000+grace+2);
  assert.equal(active(rows).length,1);assert.equal(history(rows).length,1);
  assert.equal(active(rows)[0].id,'GEOGRAPHY_LOAD_FAILED:map');
  assert.equal(active(rows)[0].occurrences,1);assert.equal(history(rows)[0].occurrences,1);
  assert.notEqual(active(rows)[0].id,history(rows)[0].id);
  const past=investigation.investigateIncident({...ops.getDiagnosticsSnapshot(),events},history(rows)[0].id);
  // investigateIncident uses the actual wall clock; the synthetic episode is already archived.
  assert.ok(past);assert.equal(past.conclusion,'root-cause-unconfirmed');
});
test('stale success cannot mark a newer failure as recovered',()=>{
  const rows=cases([err(4000),ok(2000)],grace*4);
  assert.equal(rows[0].status,'unresolved');
});
test('mixed issues archive independently and latest active selection remains available',()=>{
  const rows=cases([err(0),err(500,'DATASET_LOAD_FAILED','app'),ok(1000)],1000+grace);
  assert.equal(active(rows).length,1);assert.equal(active(rows)[0].code,'DATASET_LOAD_FAILED');
  assert.equal(history(rows).length,1);
});
test('event history yields bounded, allowlisted cases',()=>{
  const events=[];
  for(let i=0;i<40;i++){events.push(err(i*70000));events.push(ok(i*70000+1));}
  const rows=cases(events,40*70000);
  assert.ok(rows.length<=12);
  assert.ok(rows.every(x=>!x.id.includes('PRIVATE')&&x.code==='GEOGRAPHY_LOAD_FAILED'));
});
