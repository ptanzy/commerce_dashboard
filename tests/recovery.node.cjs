const {test,afterEach} = require('node:test');
const assert = require('node:assert/strict');
const ops = require('../dist-test/observability/diagnostics.js');
const recovery = require('../dist-test/observability/recovery.js');
afterEach(()=>{recovery.resetRecoveryForTests();ops.resetDiagnosticsForTests();});

function current(code,area) {
  ops.recordEvent('error',code,area);
  return recovery.deriveRecoveryIssues(ops.getDiagnosticsSnapshot())[0];
}

test('WU-08 recovery recognizes known problems, never treats an empty result as a fault',()=>{
  let issues=recovery.deriveRecoveryIssues(ops.getDiagnosticsSnapshot());
  assert.equal(issues.length,0);
  ops.updateDashboardState({origins:4,destinations:4,categories:3,focusedFlows:0,eligibleOrders:0,dateFiltered:true});
  assert.equal(recovery.deriveRecoveryIssues(ops.getDiagnosticsSnapshot()).length,0);
  const issue=current('DATASET_LOAD_FAILED','app');
  assert.equal(issue.kind,'dataset');assert.equal(issue.target,'dataset');
  assert.match(issue.nextStep,/regenerate/);
  assert.doesNotMatch(JSON.stringify(issue),/orderId|stack|customerId/i);
  ops.recordEvent('info','DATASET_LOADED','app');
  assert.equal(recovery.deriveRecoveryIssues(ops.getDiagnosticsSnapshot()).length,0);
});

test('WU-08 retry verifies success, logs safe outcome and resolves only the relevant incident',async()=>{
  const issue=current('RENDER_FAILED','sankey');
  const unsub=recovery.registerRecoveryHandler('sankey','retry',()=>true);
  const outcome=await recovery.runRecovery(issue,'retry');
  assert.equal(outcome,'verified');
  assert.equal(ops.getDiagnosticsSnapshot().recoveryAttempts.at(-1).outcome,'verified');
  assert.equal(recovery.deriveRecoveryIssues(ops.getDiagnosticsSnapshot()).length,0);
  assert.match(ops.exportDiagnosticsJson(),/RECOVERY_VERIFIED/);
  unsub();
  assert.equal(recovery.isRecoveryAvailable('sankey','retry'),false);
});

test('WU-08 isolate is reversible, does not alter aggregate dashboard state, and is not logged as a repair',async()=>{
  ops.updateDashboardState({origins:2,destinations:1,categories:1,focusedFlows:2,dateFiltered:false,eligibleOrders:12});
  const issue=current('RENDER_FAILED','sankey');
  recovery.registerRecoveryHandler('sankey','isolate',()=>true);
  recovery.registerRecoveryHandler('sankey','restore',()=>true);
  assert.equal(await recovery.runRecovery(issue,'isolate'),'isolated');
  assert.equal(recovery.isSectionIsolated('sankey'),true);
  assert.equal(recovery.deriveRecoveryIssues(ops.getDiagnosticsSnapshot()).length,1);
  assert.equal(ops.getDiagnosticsSnapshot().currentState.eligibleOrders,12);
  assert.equal(ops.getDiagnosticsSnapshot().currentState.focusedFlows,2);
  assert.equal(await recovery.runRecovery(issue,'restore'),'verified');
  assert.equal(recovery.isSectionIsolated('sankey'),false);
});

test('WU-08 failures are logged and repeat retries are bounded to two attempts',async()=>{
  const issue=current('CSV_EXPORT_FAILED','analytics');
  recovery.registerRecoveryHandler('csv','retry',()=>false);
  assert.equal(await recovery.runRecovery(issue,'retry'),'failed');
  assert.equal(await recovery.runRecovery(issue,'retry'),'failed');
  assert.equal(await recovery.runRecovery(issue,'retry'),'limit');
  assert.equal(recovery.getRecoverySnapshot().attempts.filter(a=>a.outcome==='failed').length,2);
  assert.equal(ops.getDiagnosticsSnapshot().events.at(-1).code,'RECOVERY_LIMIT_REACHED');
});

test('WU-08 rejects unauthorized/unregistered recovery commands',async()=>{
  const issue=current('UNHANDLED_REJECTION','app');
  assert.equal(issue.target,null);
  assert.equal(await recovery.runRecovery(issue,'isolate'),'unavailable');
  const stale={...issue,detectedAt:'2020-01-01T00:00:00.000Z'};
  assert.equal(await recovery.runRecovery(stale,'retry'),'unavailable');
  assert.equal(recovery.getRecoverySnapshot().attempts.length,0);
});

test('WU-08 storage check reports observations only and never deletes existing preferences',async()=>{
  const data=new Map([['saved-views','keep-this']]);
  const originalWindow=global.window;
  global.window={sessionStorage:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)},
    localStorage:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}};
  try{
    const issue=current('STORAGE_WRITE_FAILED','app');
    assert.equal(await recovery.runRecovery(issue,'check_storage'),'checked');
    assert.equal(data.get('saved-views'),'keep-this');
    assert.equal(recovery.deriveRecoveryIssues(ops.getDiagnosticsSnapshot()).length,1);
    assert.equal(ops.getDiagnosticsSnapshot().recoveryAttempts.at(-1).outcome,'checked');
  }finally{global.window=originalWindow;}
});

test('WU-08 health verification requires a fresh pending transition and detects failure',async()=>{
  ops.setHealth('dataset','ready');
  const p=recovery.retryAndVerifyHealth('dataset',()=>{
    ops.setHealth('dataset','pending');ops.setHealth('dataset','ready');
  },500);
  assert.equal(await p,true);
  const q=recovery.retryAndVerifyHealth('dataset',()=>{
    ops.setHealth('dataset','pending');ops.setHealth('dataset','degraded');
  },500);
  assert.equal(await q,false);
});

test('WU-08 transient fetch retries exactly once for network and 503, never 404 or aborted calls',async()=>{
  const ctrl=new AbortController();
  let n=0;
  const response=await recovery.fetchWithTransientRetry('/asset',ctrl.signal,async()=>{
    n++;if(n===1)throw new TypeError('Network down: private-data');return {ok:true,status:200};
  },'app',0);
  assert.equal(response.status,200);assert.equal(n,2);
  n=0;
  const fail=await recovery.fetchWithTransientRetry('/asset',ctrl.signal,async()=>{n++;return {ok:false,status:404};},'app',0);
  assert.equal(fail.status,404);assert.equal(n,1);
  n=0;
  await recovery.fetchWithTransientRetry('/asset',ctrl.signal,async()=>{n++;return {ok:false,status:503};},'map',0);
  assert.equal(n,2);
  assert.equal(ops.getDiagnosticsSnapshot().events.filter(e=>e.code==='RECOVERY_AUTO_RETRY').length,2);
  assert.doesNotMatch(ops.exportDiagnosticsJson(),/private-data/);
  const aborted=new AbortController();aborted.abort();
  await assert.rejects(()=>recovery.fetchWithTransientRetry('/asset',aborted.signal,async()=>{throw Error('should not run');}),/aborted/i);
});

test('WU-08 recovery handler exceptions are sanitized and never exported',async()=>{
  const issue=current('RENDER_FAILED','orders');
  recovery.registerRecoveryHandler('orders','retry',()=>{throw new Error('OrderID secret!');});
  assert.equal(await recovery.runRecovery(issue,'retry'),'failed');
  assert.doesNotMatch(ops.exportDiagnosticsJson(),/OrderID secret/);
});
