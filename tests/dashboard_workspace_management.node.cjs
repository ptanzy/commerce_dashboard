const test=require('node:test');
const assert=require('node:assert/strict');
const {defaultDashboardDefinition,emptyDashboardWorkspace,FULL_DASHBOARD_ID,readDashboardDefinition}=require('../dist-test/domain/dashboardWorkspace');
const {createNamedDashboard,saveNamedDashboard,removeNamedDashboard,renameNamedDashboard,workspaceDraft,workspaceDraftDirty,definitionById,uniqueDashboardName}=require('../dist-test/domain/dashboardWorkspaceManagement');
const {writeDashboardWorkspaceStorage,readDashboardWorkspaceStorage}=require('../dist-test/app/dashboardWorkspaceStorage');
const NOW='2026-11-26T00:00:00.000Z';
const fresh=()=>emptyDashboardWorkspace();
const source=()=>defaultDashboardDefinition();
const created=(w=fresh(),base=source(),name='Logistics',id='logistics')=>createNamedDashboard(w,base,name,id,NOW);
function fakeStorage(){let value=null;return {getItem:()=>value,setItem:(_k,v)=>{value=v}};}
test('WU-11 Phase 3 create clones draft filters and hidden Sankey without editing protected default',()=>{
  const base=source();base.layout.hiddenSections=['shippingSankey'];base.layout.filterPanelVisible=false;
  base.analysis.filters.focusedFlows=[{sellerState:'SP',customerState:'RJ'}];
  const out=created(fresh(),base);
  assert.equal(out.ok,true);
  assert.equal(out.workspace.activeDashboardId,'logistics');
  assert.equal(out.dashboard.layout.filterPanelVisible,false);
  assert.deepEqual(out.dashboard.analysis.filters.focusedFlows,[{sellerState:'SP',customerState:'RJ'}]);
  base.analysis.filters.focusedFlows[0].sellerState='MG';
  assert.equal(out.dashboard.analysis.filters.focusedFlows[0].sellerState,'SP');
  assert.deepEqual(definitionById(out.workspace,FULL_DASHBOARD_ID).layout.hiddenSections,[]);
});
test('WU-11 Phase 3 save and reload persistent layout, date/filter context, and focused pairs',()=>{
  const w=created().workspace;
  const draft=workspaceDraft(w.dashboards[0],{
    ...w.dashboards[0].analysis.filters, sellerStates:['SP'], focusedFlows:[{sellerState:'SP',customerState:'RJ'}],
  },false);
  draft.layout.hiddenSections=['shippingSankey','deliveryTrends'];
  assert.equal(workspaceDraftDirty(w.dashboards[0],draft),true);
  const saved=saveNamedDashboard(w,draft,NOW);
  assert.equal(saved.ok,true);
  const storage=fakeStorage();
  assert.deepEqual(writeDashboardWorkspaceStorage(storage,saved.workspace),{ok:true});
  const read=readDashboardWorkspaceStorage(storage);
  assert.equal(read.status,'ready');
  assert.equal(read.workspace.dashboards[0].layout.filterPanelVisible,false);
  assert.deepEqual(read.workspace.dashboards[0].analysis.filters.focusedFlows,[{sellerState:'SP',customerState:'RJ'}]);
  assert.equal(workspaceDraftDirty(read.workspace.dashboards[0],read.workspace.dashboards[0]),false);
});
test('WU-11 Phase 3 saved dashboard rename does not accidentally commit unsaved changes',()=>{
  const w=created().workspace;
  const pending=workspaceDraft(w.dashboards[0],w.dashboards[0].analysis.filters);
  pending.layout.hiddenSections=['kpis'];
  const renamed=renameNamedDashboard(w,'logistics','Routing',NOW);
  assert.equal(renamed.ok,true);
  assert.deepEqual(renamed.dashboard.layout.hiddenSections,[]);
  assert.deepEqual(pending.layout.hiddenSections,['kpis']);
  assert.equal(renameNamedDashboard(w,FULL_DASHBOARD_ID,'changed',NOW).ok,false);
  assert.equal(renameNamedDashboard(w,'missing','changed',NOW).ok,false);
});
test('WU-11 Phase 3 rejects duplicate names, bad IDs and 21st dashboard',()=>{
  const w=created().workspace;
  assert.equal(created(w,source(),'LOGISTICS','new').reason,'duplicate-name');
  assert.equal(created(w,source(),'Full Dashboard','new').reason,'duplicate-name');
  assert.equal(created(w,source(),'Unsafe\u202E','new').reason,'invalid-name');
  assert.equal(created(w,source(),'Different','logistics').reason,'invalid');
  let many=w;
  for(let i=1;i<20;i++)many=created(many,source(),`Dashboard ${i}`,`id-${i}`).workspace;
  assert.equal(many.dashboards.length,20);
  assert.equal(created(many,source(),'Overflow','overflow').reason,'limit-reached');
});
test('WU-11 Phase 3 deletion protects built-in and returns to full dashboard',()=>{
  const w=created().workspace;
  assert.equal(removeNamedDashboard(w,FULL_DASHBOARD_ID).reason,'protected');
  const gone=removeNamedDashboard(w,'logistics');
  assert.equal(gone.ok,true);
  assert.equal(gone.workspace.activeDashboardId,FULL_DASHBOARD_ID);
  assert.equal(gone.workspace.dashboards.length,0);
  assert.equal(w.dashboards.length,1);
});
test('WU-11 Phase 3 legacy Phase 1 layout defaults full filter controls to visible',()=>{
  const d=created().dashboard;
  delete d.layout.filterPanelVisible;
  assert.equal(readDashboardDefinition(d).layout.filterPanelVisible,true);
  const invalid={...created().dashboard,layout:{...created().dashboard.layout,filterPanelVisible:'false'}};
  assert.equal(readDashboardDefinition(invalid),null);
});
test('WU-11 Phase 3 duplicate names use bounded case-insensitive suffixes',()=>{
  const w=created().workspace;
  assert.equal(uniqueDashboardName(w,'logistics'),'logistics (2)');
  assert.equal(uniqueDashboardName(w,'Full Dashboard'),'Full Dashboard (2)');
});
