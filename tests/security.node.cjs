/** WU-09: deterministic adversarial tests; synthetic data only. */
const test=require('node:test');
const assert=require('node:assert/strict');
const {exportCohortCsv}=require('../dist-test/domain/exportCsv.js');
const {readFilterSnapshot,readSavedViews}=require('../dist-test/domain/savedViews.js');
const {DEFAULT_FILTERS}=require('../dist-test/domain/types.js');
const ops=require('../dist-test/observability/diagnostics.js');
const {listIncidentCases,investigateIncident,incidentReportBundle}=require('../dist-test/observability/investigation.js');

function exportWithId(id){
  const order={orderId:id,purchaseDate:'2018-01-01',customerState:'SP',status:'delivered',
    deliveryClassification:'on_time',deliveryDays:4,itemCount:0};
  return exportCohortCsv({eligibleOrders:[order],eligibleItems:[],eligibleOrderIds:new Set([id])});
}

test('WU-09 spreadsheet export neutralizes formulas after whitespace, BOM, and bidi controls',()=>{
  for (const payload of ['=1+2','+SUM(1,2)','-1+2','@SUM(1,2)','  =1+2',
    '\t=1+2','\r\n=1+2','\uFEFF=1+2','\u202E=1+2','\u2066=1+2']) {
    const csv=exportWithId(payload);
    const idCell=csv.split('\r\n')[1].split(',')[0];
    assert.ok(idCell.startsWith('"\''),`No text marker for ${JSON.stringify(payload)}`);
    assert.ok(!/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2060-\u2069]/u.test(idCell));
    assert.equal(csv.split('\r\n').length,3,'Payload cannot add records');
  }
});

test('WU-09 CSV quotes cannot escape cells or create extra records',()=>{
  const payload='"\r\n=HYPERLINK("evil")';
  const csv=exportWithId(payload);
  assert.ok(csv.includes('"""  =HYPERLINK(""evil"")"'));
  assert.equal(csv.split('\r\n').length,3);
  assert.ok(csv.startsWith('\ufefforder_id,'));
});

test('WU-09 numeric values stay numeric even with negative numbers',()=>{
  const csv=exportCohortCsv({eligibleOrders:[{
    orderId:'safe',purchaseDate:'2018-01-01',customerState:'SP',status:'delivered',deliveryClassification:'early',
    deliveryDays:-2,itemCount:0}],eligibleItems:[],eligibleOrderIds:new Set(['safe'])});
  assert.ok(csv.includes('"-2"'));
  assert.ok(!csv.includes('"\'-2"'));
});

test('WU-09 tampered saved views reject unsafe controls, disguised names, malformed filters',()=>{
  const base={...DEFAULT_FILTERS,customerStates:['RJ'],sellerStates:['SP'],categories:['books'],focusedFlows:[]};
  assert.equal(readFilterSnapshot({...base,categories:['books\u202E=1+1']}),null);
  assert.equal(readFilterSnapshot({...base,categories:['books\u0000']}),null);
  assert.equal(readFilterSnapshot({...base,sellerStates:['sp']}),null);
  assert.equal(readFilterSnapshot({...base,focusedFlows:[{sellerState:'../../',customerState:'RJ'}]}),null);
  const views=readSavedViews([
    {id:'safe',name:'Analysis',filters:base},
    {id:'trick',name:'Spoof \u202E attack',filters:base},
    {id:'bad',name:'X\u0000Y',filters:base},
  ]);
  assert.equal(views.length,1);
  assert.equal(views[0].id,'safe');
});

test('WU-09 payload with __proto__ cannot pollute application objects',()=>{
  const raw=JSON.parse('{"__proto__":{"polluted":true},"sellerStates":[],"customerStates":[],"categories":[],"focusedFlows":[],"purchaseDateFrom":null,"purchaseDateTo":null}');
  const result=readFilterSnapshot(raw);
  assert.deepEqual(result.sellerStates,[]);
  assert.equal(({}).polluted,undefined);
});

test('WU-09 investigation JSON never exports arbitrary error text or raw secret fields',()=>{
  ops.resetDiagnosticsForTests();
  ops.recordUserAction('FLOW_SELECTION_CHANGED','sankey');
  ops.recordEvent('error','RENDER_FAILED','sankey');
  const issue=listIncidentCases(ops.getDiagnosticsSnapshot())[0];
  const report=investigateIncident(ops.getDiagnosticsSnapshot(),issue.id);
  const json=incidentReportBundle(report,ops.getDiagnosticsSnapshot());
  assert.equal(JSON.parse(json).report.conclusion,'root-cause-unconfirmed');
  assert.doesNotMatch(json,/password|rawOrderId|customerName|errorMessage|stackTrace/i);
  ops.resetDiagnosticsForTests();
});

// Reproducible property-style fuzz corpus: no external dependency or randomness in CI.
test('WU-09 seeded adversarial CSV corpus cannot create formulas or extra rows',()=>{
  let seed=0x1d5e4a7;
  const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0);
  const prefixes=['',' ','  ','\t','\r\n','\u202e','\u200b','\u2060','\uFEFF','\u0000'];
  const formulas=['=1+2','+SUM(1,2)','-1+2','@SUM(1,2)'];
  for(let i=0;i<300;i++){
    const input=prefixes[rnd()%prefixes.length]+formulas[rnd()%formulas.length]+
      Array.from({length:rnd()%5},()=>['\"',',','\n','\r','X','\u202D'][rnd()%6]).join('');
    const csv=exportWithId(input);
    const cell=csv.split('\r\n')[1].split(',')[0];
    assert.ok(cell.startsWith('"\''), `Unprotected text cell at corpus entry ${i}`);
    assert.equal(csv.split('\r\n').length,3,`Extra row at corpus entry ${i}`);
  }
});
