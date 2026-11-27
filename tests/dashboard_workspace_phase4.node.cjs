const test=require('node:test');
const assert=require('node:assert/strict');
const { defaultDashboardDefinition, emptyDashboardWorkspace, readDashboardDefinition, DASHBOARD_SECTION_IDS }=require('../dist-test/domain/dashboardWorkspace');
const { moveDashboardSection, shiftDashboardSection }=require('../dist-test/domain/dashboardSectionOrdering');
const { workspaceDraft, workspaceDraftDirty, createNamedDashboard, saveNamedDashboard, definitionById }=require('../dist-test/domain/dashboardWorkspaceManagement');
const { writeDashboardWorkspaceStorage, readDashboardWorkspaceStorage }=require('../dist-test/app/dashboardWorkspaceStorage');
const NOW='2026-11-26T00:00:00.000Z';
const store=()=>{let value=null;return {getItem:()=>value,setItem:(_k,v)=>{value=v}};};

test('WU-11 Phase 4 moves stable IDs without duplicates, including hidden sections',()=>{
  const original=defaultDashboardDefinition();
  const id='shippingSankey';
  const moved=moveDashboardSection(original.layout.sectionOrder,id,0);
  assert.equal(moved[0],id);
  assert.deepEqual(new Set(moved),new Set(DASHBOARD_SECTION_IDS));
  assert.deepEqual(original.layout.sectionOrder,DASHBOARD_SECTION_IDS);
  assert.deepEqual(moveDashboardSection(moved,id,100),moved);
  assert.deepEqual(moveDashboardSection(['kpis','kpis'],id,0),['kpis','kpis']);
  assert.deepEqual(shiftDashboardSection(moved,id,-1),moved);
  const next=shiftDashboardSection(moved,id,1);
  assert.equal(next[1],id);
  assert.deepEqual(moveDashboardSection(next,id,0),moved);
});

test('WU-11 Phase 4 serializes independent views and layout without changing focused filters',()=>{
  const full=defaultDashboardDefinition();
  const source=workspaceDraft(full,full.analysis.filters);
  source.layout.hiddenSections=['geographicDistribution','shippingSankey'];
  source.layout.sectionOrder=moveDashboardSection(source.layout.sectionOrder,'shippingSankey',0);
  source.analysis.views.geographic={mode:'destination',metric:'median'};
  source.analysis.views.sankey={measure:'value'};
  source.analysis.views.trends={measure:'onTime'};
  source.analysis.views.category={measure:'freight'};
  source.analysis.filters.focusedFlows=[{sellerState:'SP',customerState:'RJ'}];
  assert.equal(workspaceDraftDirty(full,source),true);
  const created=createNamedDashboard(emptyDashboardWorkspace(),source,'Routing','routing',NOW);
  assert.equal(created.ok,true);
  const storage=store();
  assert.deepEqual(writeDashboardWorkspaceStorage(storage,created.workspace),{ok:true});
  const loaded=readDashboardWorkspaceStorage(storage);
  assert.equal(loaded.status,'ready');
  const restored=definitionById(loaded.workspace,'routing');
  assert.deepEqual(restored.analysis.views,source.analysis.views);
  assert.deepEqual(restored.layout.sectionOrder,source.layout.sectionOrder);
  assert.deepEqual(restored.layout.hiddenSections,source.layout.hiddenSections);
  assert.deepEqual(restored.analysis.filters.focusedFlows,source.analysis.filters.focusedFlows);
  assert.deepEqual(definitionById(loaded.workspace,'full-dashboard').analysis.views,full.analysis.views);
  assert.equal(workspaceDraftDirty(restored,workspaceDraft(restored,restored.analysis.filters)),false);
});

test('WU-11 Phase 4 invalid preference values and layouts remain rejected by the original validator',()=>{
  const base=defaultDashboardDefinition();
  const candidate={...base,id:'sample',name:'Sample',updatedAt:NOW};
  assert.ok(readDashboardDefinition(candidate));
  assert.equal(readDashboardDefinition({...candidate,analysis:{...candidate.analysis,views:{...candidate.analysis.views,sankey:{measure:'javascript:alert(1)'}}}}),null);
  assert.equal(readDashboardDefinition({...candidate,layout:{...candidate.layout,sectionOrder:['kpis',...DASHBOARD_SECTION_IDS]}}),null);
});

test('WU-11 Phase 4 save captures new preferences, discard uses last saved independent values',()=>{
  const initial=createNamedDashboard(emptyDashboardWorkspace(),defaultDashboardDefinition(),'One','one',NOW);
  assert.equal(initial.ok,true);
  const source=initial.dashboard;
  const working=workspaceDraft(source,source.analysis.filters);
  working.analysis.views.sankey.measure='freight';
  working.layout.sectionOrder=shiftDashboardSection(working.layout.sectionOrder,'deliveryTrends',-1);
  assert.equal(workspaceDraftDirty(source,working),true);
  assert.equal(source.analysis.views.sankey.measure,'items');
  const saved=saveNamedDashboard(initial.workspace,working,NOW);
  assert.equal(saved.ok,true);
  assert.equal(saved.dashboard.analysis.views.sankey.measure,'freight');
  assert.equal(workspaceDraftDirty(saved.dashboard,working),false);
});
