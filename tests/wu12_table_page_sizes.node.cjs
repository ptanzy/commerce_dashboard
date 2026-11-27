const test=require('node:test');
const assert=require('node:assert/strict');
const {
  defaultDashboardTablePageSizes, readDashboardTablePageSizes, TABLE_PAGE_SIZE_OPTIONS
}=require('../dist-test/domain/dashboardTablePreferences');
const {defaultDashboardDefinition,readDashboardDefinition,readDashboardWorkspace,DASHBOARD_STORAGE_KEY}=require('../dist-test/domain/dashboardWorkspace');
const {workspaceDraft,workspaceDraftDirty,createNamedDashboard,saveNamedDashboard}=require('../dist-test/domain/dashboardWorkspaceManagement');
const {readDashboardWorkspaceStorage}=require('../dist-test/app/dashboardWorkspaceStorage');
const NOW='2026-11-27T18:00:00.000Z';
function named(id='a') { return {...defaultDashboardDefinition(),id,name:'Report '+id,updatedAt:NOW}; }

test('Page sizes are 10 by default and restricted to 10,25,50,100',()=>{
  assert.deepEqual(TABLE_PAGE_SIZE_OPTIONS,[10,25,50,100]);
  const defaults=defaultDashboardTablePageSizes();
  assert.deepEqual(Object.values(defaults),[10,10,10,10]);
  assert.deepEqual(readDashboardTablePageSizes(defaults),defaults);
  for(const invalid of [0,1,11,26,500,Infinity,'25',null]){
    assert.equal(readDashboardTablePageSizes({...defaults,orderExplorer:invalid}),null);
  }
  assert.equal(readDashboardTablePageSizes({...defaults,evil:10}),null);
  assert.equal(readDashboardTablePageSizes({orderExplorer:25}),null);
});

test('Pre-pagination saved dashboards migrate in memory without storage writes',()=>{
  const entry=named();delete entry.analysis.tablePageSizes;
  const serialized=JSON.stringify({schemaVersion:1,activeDashboardId:'a',dashboards:[entry]});
  let writes=0;
  const storage={getItem:k=>k===DASHBOARD_STORAGE_KEY?serialized:null,setItem:()=>writes++};
  const result=readDashboardWorkspaceStorage(storage);
  assert.equal(result.status,'ready');
  assert.deepEqual(result.workspace.dashboards[0].analysis.tablePageSizes,defaultDashboardTablePageSizes());
  assert.equal(writes,0);
});

test('Saves four independent sizes and restores them unchanged, with no panel-layout changes',()=>{
  const workspace={schemaVersion:1,activeDashboardId:'full-dashboard',dashboards:[]};
  const source=defaultDashboardDefinition();
  const created=createNamedDashboard(workspace,source,'My report','a',NOW);
  assert.equal(created.ok,true);
  const draft=workspaceDraft(created.dashboard,created.dashboard.analysis.filters);
  draft.analysis.tablePageSizes={orderExplorer:25,shippingCorridorScorecard:50,sellerPerformance:100,customerExperience:10};
  assert.equal(workspaceDraftDirty(created.dashboard,draft),true);
  const saved=saveNamedDashboard(created.workspace,draft,NOW);
  assert.equal(saved.ok,true);
  assert.deepEqual(readDashboardWorkspace(saved.workspace).dashboards[0].analysis.tablePageSizes,draft.analysis.tablePageSizes);
  assert.deepEqual(saved.dashboard.layout,source.layout);
  assert.deepEqual(created.dashboard.analysis.tablePageSizes,defaultDashboardTablePageSizes());
  assert.equal(workspaceDraftDirty(saved.dashboard,workspaceDraft(saved.dashboard,saved.dashboard.analysis.filters)),false);
});

test('Malformed or tampered sizes invalidate a dashboard without altering other saved entries',()=>{
  const ok=named('okay'); const bad=named('bad');
  bad.analysis.tablePageSizes.orderExplorer=10000;
  assert.equal(readDashboardDefinition(bad),null);
  const parsed=readDashboardWorkspace({schemaVersion:1,activeDashboardId:'okay',dashboards:[ok,bad]});
  assert.deepEqual(parsed.dashboards.map(d=>d.id),['okay']);
  assert.equal(parsed.activeDashboardId,'okay');
});
