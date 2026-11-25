const {test,afterEach} = require('node:test');
const assert=require('node:assert/strict');
const ops=require('../dist-test/observability/diagnostics.js');
afterEach(()=>ops.resetDiagnosticsForTests());

test('WU-08 structured log uses fixed codes and strips unapproved metadata',()=>{
  ops.recordEvent('error','CSV_EXPORT_FAILED','analytics',NaN);
  ops.recordEvent('info','DATASET_LOADED','app',3);
  const first=ops.getDiagnosticsSnapshot().events[0];
  assert.deepEqual(Object.keys(first).sort(),['area','code','level','timestamp','view']);
  assert.equal(ops.getDiagnosticsSnapshot().events[1].count,3);
  const json=ops.exportDiagnosticsJson();
  assert.match(json,/commerce-dashboard-diagnostics-v3/);
  assert.doesNotMatch(json,/orderId|errorMessage|stack|userAgent|url/i);
});

test('WU-08 event history is bounded to 200 entries and supports explicit clear',()=>{
  for(let i=0;i<250;i++)ops.recordEvent('debug','DATASET_LOAD_STARTED','app',i);
  const s=ops.getDiagnosticsSnapshot();
  assert.equal(s.events.length,200);
  assert.equal(s.events[0].count,50);
  ops.clearDiagnosticsEvents();
  assert.equal(ops.getDiagnosticsSnapshot().events.length,0);
});

test('WU-08 performance metrics reject invalid durations and use bounded rolling samples',()=>{
  ops.recordTiming('cohort_filter',-5);ops.recordTiming('cohort_filter',Infinity);ops.recordTiming('cohort_filter',NaN);
  for(let i=0;i<50;i++)ops.recordTiming('cohort_filter',i);
  const s=ops.getDiagnosticsSnapshot();
  assert.deepEqual(s.metrics.find(x=>x.name==='cohort_filter'),{
    name:'cohort_filter',count:40,lastMs:49,averageMs:29.5,maxMs:49,p95Ms:47,slowCount:0,
  });
});

test('WU-08 snapshot remains stable between events and notifies subscribers',()=>{
  let notified=0;
  const first=ops.getDiagnosticsSnapshot();
  const off=ops.subscribeDiagnostics(()=>{notified++;});
  assert.equal(ops.getDiagnosticsSnapshot(),first);
  ops.setHealth('dataset','ready');
  assert.equal(notified,1);
  assert.notEqual(first,ops.getDiagnosticsSnapshot());
  assert.equal(ops.getDiagnosticsSnapshot().health.dataset,'ready');
  off();ops.recordEvent('info','DATASET_LOADED','app');
  assert.equal(notified,1);
});

test('WU-08 browser global error handlers register and unsubscribe without reading error details',()=>{
  const handlers=new Map();
  const fake={addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:(name,fn)=>{if(handlers.get(name)===fn)handlers.delete(name)}};
  const uninstall=ops.installGlobalDiagnostics(fake);
  assert.equal(handlers.size,2);
  handlers.get('error')({message:'Sensitive row and order ID here!'});
  handlers.get('unhandledrejection')({reason:new Error('Secret')});
  const json=ops.exportDiagnosticsJson();
  assert.match(json,/UNHANDLED_ERROR/);
  assert.match(json,/UNHANDLED_REJECTION/);
  assert.doesNotMatch(json,/Sensitive row|Secret/);
  uninstall();assert.equal(handlers.size,0);
});

test('WU-08 untrusted runtime labels cannot enter diagnostic exports',()=>{
  // JS callers can bypass TypeScript types; runtime guards still reject unrecognized labels.
  ops.recordEvent('info','raw:secret-order-id','app');
  ops.recordEvent('info','DATASET_LOADED','https://example.invalid/secret');
  ops.recordTiming('secret-category-name',12.1);
  ops.setHealth('secret-id','ready');
  const dump=ops.exportDiagnosticsJson();
  assert.doesNotMatch(dump,/secret-order-id|example.invalid|secret-category-name|secret-id/);
  assert.equal(ops.getDiagnosticsSnapshot().events.length,0);
});


test('WU-08 session activity is anonymous, allowlisted, sequential and correlates recent errors',()=>{
  ops.recordUserAction('ORIGIN_SELECTION_CHANGED','dashboard');
  ops.recordUserAction('FLOW_SELECTION_CHANGED','sankey');
  ops.recordEvent('error','RENDER_FAILED','sankey');
  const snap=ops.getDiagnosticsSnapshot();
  assert.match(snap.session.id,/^s-[a-f0-9]{16}$/);
  assert.equal(snap.session.anonymous,true);
  assert.equal(snap.events[0].actionId,1);
  assert.equal(snap.events[1].actionId,2);
  assert.equal(snap.events[2].relatedAction,'FLOW_SELECTION_CHANGED');
  assert.equal(snap.events[2].relatedActionId,2);
  assert.equal(snap.events[2].area,'sankey');
  assert.match(ops.exportDiagnosticsJson(),/"session"/);
});

test('WU-08 rejects untrusted activity codes, raw inputs and does not retain error messages',()=>{
  ops.recordUserAction('SAVED_VIEW_CREATED','dashboard','SENSITIVE SAVED VIEW');
  ops.recordUserAction('ORDER_ID=private','orders');
  ops.recordEvent('error','CSV_EXPORT_FAILED','analytics',-2);
  const json=ops.exportDiagnosticsJson();
  assert.doesNotMatch(json,/SENSITIVE SAVED VIEW|ORDER_ID=private/);
  assert.equal(ops.getDiagnosticsSnapshot().events.length,2);
  assert.equal(ops.getDiagnosticsSnapshot().events.at(-1).relatedAction,'SAVED_VIEW_CREATED');
  ops.clearDiagnosticsEvents();
  ops.recordEvent('error','CSV_EXPORT_FAILED','analytics');
  assert.equal(ops.getDiagnosticsSnapshot().events[0].relatedAction,undefined);
});

test('WU-08 bounded session activity keeps only the last 200 events and no identity',()=>{
  for(let i=0;i<250;i++) ops.recordUserAction('ORIGIN_SELECTION_CHANGED','dashboard');
  const snap=ops.getDiagnosticsSnapshot();
  assert.equal(snap.events.length,200);
  assert.equal(snap.events[0].actionId,51);
  assert.equal(snap.events[199].actionId,250);
  assert.equal(Object.keys(snap.session).sort().join(','),'anonymous,id,startedAt');
});

test('WU-08 anonymous session and allowlisted activity survive a same-tab reload',()=>{
  const originalWindow=global.window;
  const stored=new Map();
  global.window={sessionStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)}};
  const modulePath=require.resolve('../dist-test/observability/diagnostics.js');
  try {
    delete require.cache[modulePath];
    const first=require(modulePath);
    first.recordUserAction('DATE_RANGE_CHANGED','dashboard');
    first.recordEvent('error','RENDER_FAILED','dashboard');
    const firstSnapshot=first.getDiagnosticsSnapshot();
    assert.equal(firstSnapshot.events.length,2);
    assert.equal(stored.size,1);
    delete require.cache[modulePath];
    const loaded=require(modulePath);
    assert.equal(loaded.getDiagnosticsSnapshot().session.id,firstSnapshot.session.id);
    assert.equal(loaded.getDiagnosticsSnapshot().events.length,2);
    assert.equal(loaded.getDiagnosticsSnapshot().events.at(-1).relatedAction,'DATE_RANGE_CHANGED');
    loaded.clearDiagnosticsEvents();
    assert.equal(JSON.parse([...stored.values()][0]).events.length,0);
  } finally {delete require.cache[modulePath];if(originalWindow===undefined)delete global.window;else global.window=originalWindow;}
});

test('WU-08 cannot be made to export injected browser session values',()=>{
  const originalWindow=global.window;
  const key='commerce-dashboard-anonymous-diagnostics-v1';
  const injected={session:{id:'s-0123456789abcdef',startedAt:new Date().toISOString(),anonymous:true},
    events:[{kind:'action',timestamp:new Date().toISOString(),level:'info',code:'RAW PRIVATE CUSTOMER',area:'app',actionId:4},
      {timestamp:new Date().toISOString(),level:'error',code:'RENDER_FAILED',area:'sankey',message:'private-foobar-customer-id'}]};
  const stored=new Map([[key,JSON.stringify(injected)]]);
  global.window={sessionStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)}};
  const modulePath=require.resolve('../dist-test/observability/diagnostics.js');
  try {
    delete require.cache[modulePath];
    const loaded=require(modulePath);
    assert.equal(loaded.getDiagnosticsSnapshot().events.length,1);
    const exported=loaded.exportDiagnosticsJson();
    assert.doesNotMatch(exported,/RAW PRIVATE CUSTOMER|private-foobar-customer-id/);
    assert.match(exported,/RENDER_FAILED/);
  } finally {delete require.cache[modulePath];if(originalWindow===undefined)delete global.window;else global.window=originalWindow;}
});


test('WU-08 diagnostic snapshots contain aggregate state and stay sanitized after reload',()=>{
  const safe={origins:2,destinations:3,categories:1,focusedFlows:4,dateFiltered:true,eligibleOrders:12};
  ops.updateDashboardState({...safe,customerName:'SHOULD_NOT_EXPORT',orderId:'SECRET-ID'});
  ops.recordUserAction('FLOW_SELECTION_CHANGED','sankey');
  ops.recordEvent('fatal','RENDER_FAILED','sankey');
  const snap=ops.getDiagnosticsSnapshot();
  assert.deepEqual(snap.events.at(-1).state,safe);
  assert.equal(ops.captureStateSnapshot(),true);
  assert.equal(snap.events.length,2);
  const exported=ops.exportDiagnosticsJson();
  assert.doesNotMatch(exported,/SHOULD_NOT_EXPORT|SECRET-ID/);
  assert.match(exported,/STATE_SNAPSHOT_CAPTURED/);
  ops.updateDashboardState({...safe,origins:NaN});
  assert.equal(ops.getDiagnosticsSnapshot().currentState.origins,2);
});

test('WU-08 operation traces correlate recent actions, compute P95, and warn about slow operations',()=>{
  ops.recordUserAction('FLOW_SELECTION_CHANGED','sankey');
  for(let i=1;i<=40;i++)ops.recordTiming('sankey_aggregation',i*20);
  const snap=ops.getDiagnosticsSnapshot();
  const metric=snap.metrics.find(x=>x.name==='sankey_aggregation');
  assert.equal(metric.p95Ms,760);
  assert.equal(metric.slowCount,15);
  assert.equal(snap.traces.length,40);
  assert.equal(snap.traces.at(-1).relatedActionId,1);
  assert.equal(snap.traces.at(-1).slow,true);
  assert.equal(snap.events.filter(e=>e.code==='OPERATION_SLOW').length,15);
  for(let i=0;i<120;i++)ops.recordTiming('cohort_filter',1);
  assert.equal(ops.getDiagnosticsSnapshot().traces.length,80);
});

test('WU-08 snapshots retain allowlisted chart choices as they were at failure time',()=>{
  ops.setDiagnosticView('sankeyMeasure','freight');
  ops.recordEvent('error','RENDER_FAILED','sankey');
  ops.setDiagnosticView('sankeyMeasure','items');
  assert.equal(ops.getDiagnosticsSnapshot().events[0].view.sankeyMeasure,'freight');
  assert.equal(ops.getDiagnosticsSnapshot().views.sankeyMeasure,'items');
  ops.setDatasetMetadata({schemaVersion:2,processingVersion:'wu01-duckdb-1',orderCount:99441,itemCount:112650});
  ops.setRuntimeEnvironment({browser:'Edge',os:'Windows'});
  assert.equal(ops.getDiagnosticsSnapshot().datasetInfo.processingVersion,'wu01-duckdb-1');
  assert.equal(ops.getDiagnosticsSnapshot().environment.browser,'Edge');
  ops.setDatasetMetadata({schemaVersion:2,processingVersion:'private/CUSTOMER_NAME',orderCount:1,itemCount:1});
  ops.setRuntimeEnvironment({browser:'raw AGENT',os:'Windows'});
  const dump=ops.exportDiagnosticsJson();
  assert.doesNotMatch(dump,/private\/CUSTOMER_NAME|raw AGENT/);
});

test('WU-08 browser health checks are non-destructive and record explicit statuses',()=>{
  const originalWindow=global.window;
  const data=new Map([['existing','important']]);
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  global.window={localStorage:storage,sessionStorage:storage};
  try {
    ops.setHealth('dataset','ready');ops.setHealth('geography','ready');
    const checks=ops.runDiagnosticsHealthChecks();
    assert.equal(checks.length,4);
    assert.equal(checks.every(c=>c.status==='pass'),true);
    assert.equal(ops.getDiagnosticsSnapshot().health.browser_storage,'ready');
    assert.equal(data.get('existing'),'important');
    assert.equal([...data.keys()].filter(k=>k.startsWith('__commerce_diagnostics_probe_')).length,0);
    assert.match(ops.exportDiagnosticsJson(),/HEALTH_CHECK_RAN/);
  }finally{if(originalWindow===undefined)delete global.window;else global.window=originalWindow;}
});

test('WU-08 health checks detect denied storage without recording browser exceptions',()=>{
  const originalWindow=global.window;
  global.window={sessionStorage:{setItem:()=>{throw Error('PRIVATE STORAGE MESSAGE');}},
    localStorage:{setItem:()=>{throw Error('PRIVATE STORAGE MESSAGE');}}};
  try {
    const results=ops.runDiagnosticsHealthChecks();
    assert.equal(results.filter(r=>r.status==='fail').length,2);
    assert.equal(ops.getDiagnosticsSnapshot().health.browser_storage,'degraded');
    assert.doesNotMatch(ops.exportDiagnosticsJson(),/PRIVATE STORAGE MESSAGE/);
  }finally{if(originalWindow===undefined)delete global.window;else global.window=originalWindow;}
});

test('WU-08 build and view metadata enforce fixed value allowlists',()=>{
  ops.setBuildInfo({version:'0.6.0',commit:'0123456789ab',builtAt:'2026-11-24T01:20:30.000Z',mode:'production'});
  ops.setDiagnosticView('sankeyMeasure','freight');
  assert.equal(ops.getDiagnosticsSnapshot().build.commit,'0123456789ab');
  assert.equal(ops.getDiagnosticsSnapshot().views.sankeyMeasure,'freight');
  ops.setBuildInfo({version:'secret',commit:'~/private/credentials',builtAt:'SECRET',mode:'other'});
  ops.setDiagnosticView('sankeyMeasure','SECRET-PRODUCT');
  const dump=ops.exportDiagnosticsJson();
  assert.doesNotMatch(dump,/SECRET-PRODUCT|credentials/);
  assert.equal(ops.getDiagnosticsSnapshot().views.sankeyMeasure,'freight');
});
