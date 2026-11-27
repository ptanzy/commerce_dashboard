const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DASHBOARD_SECTIONS, DASHBOARD_SECTION_IDS, DASHBOARD_SCHEMA_VERSION,
  FULL_DASHBOARD_ID, DASHBOARD_LIMIT, DASHBOARD_STORAGE_KEY, DASHBOARD_STORAGE_MAX_CHARS,
  defaultDashboardDefinition, emptyDashboardWorkspace, readDashboardDefinition,
  readDashboardWorkspace, visibleDashboardSections,
} = require('../dist-test/domain/dashboardWorkspace');
const { readDashboardWorkspaceStorage, writeDashboardWorkspaceStorage } = require('../dist-test/app/dashboardWorkspaceStorage');
const { SAVED_VIEWS_KEY } = require('../dist-test/domain/savedViews');

function saved(id='executive-1',name='Executive View') {
  return {...defaultDashboardDefinition(),id,name,updatedAt:'2026-11-25T21:30:00.000Z'};
}
function withDashboard(d=saved()) {
  return {schemaVersion:DASHBOARD_SCHEMA_VERSION,activeDashboardId:d.id,dashboards:[d]};
}
function fakeStorage(initial={}) {
  const data = new Map(Object.entries(initial));
  return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
}

test('WU-11 section registry represents actual eight independent analytical regions',()=>{
  assert.deepEqual(DASHBOARD_SECTION_IDS,[
    'kpis','periodComparison','geographicDistribution','deliveryTrends','shippingSankey',
    'categoryLeaderboard','delayDistribution','orderExplorer',
  ]);
  assert.equal(new Set(DASHBOARD_SECTIONS.map(s=>s.id)).size,8);
  assert.ok(DASHBOARD_SECTIONS.every(s=>s.label));
});
test('WU-11 built-in full dashboard is protected, unhidden and structurally independent',()=>{
  const first=defaultDashboardDefinition(); const second=defaultDashboardDefinition();
  assert.equal(first.id,FULL_DASHBOARD_ID);
  assert.deepEqual(visibleDashboardSections(first),DASHBOARD_SECTION_IDS);
  assert.equal(readDashboardDefinition(first),null); // built-in cannot be imported as a saved custom dashboard
  first.layout.hiddenSections.push('kpis');first.analysis.filters.focusedFlows.push({sellerState:'SP',customerState:'MG'});
  assert.deepEqual(second.layout.hiddenSections,[]);
  assert.deepEqual(second.analysis.filters.focusedFlows,[]);
  assert.deepEqual(emptyDashboardWorkspace().dashboards,[]);
  assert.equal(emptyDashboardWorkspace().activeDashboardId,FULL_DASHBOARD_ID);
});
test('WU-11 validates complete dashboard and returns cloned state',()=>{
  const input=saved();
  input.layout.sectionOrder.reverse();
  input.layout.hiddenSections=['periodComparison','geographicDistribution'];
  input.analysis.views.geographic={mode:'destination',metric:'median'};
  input.analysis.views.sankey={measure:'freight'};
  input.analysis.views.trends={measure:'onTime'};
  input.analysis.views.category={measure:'value'};
  input.analysis.filters.sellerStates=['SP'];
  input.analysis.filters.focusedFlows=[{sellerState:'RJ',customerState:'MG'},{sellerState:'SP',customerState:'MG'}];
  const parsed=readDashboardDefinition(input);
  assert.ok(parsed);
  assert.deepEqual(visibleDashboardSections(parsed),input.layout.sectionOrder.filter(x=>!input.layout.hiddenSections.includes(x)));
  assert.deepEqual(parsed.analysis.filters.focusedFlows,[{sellerState:'SP',customerState:'MG'}]);
  input.layout.hiddenSections.push('kpis');
  input.analysis.views.geographic.metric='orders';
  assert.equal(parsed.analysis.views.geographic.metric,'median');
  assert.deepEqual(parsed.layout.hiddenSections,['periodComparison','geographicDistribution']);
});
test('WU-11 malformed or executable section schema is not accepted',()=>{
  const entry=saved();
  for(const input of [
    {...entry,layout:{...entry.layout,sectionOrder:['kpis']}},
    {...entry,layout:{...entry.layout,sectionOrder:[...entry.layout.sectionOrder.slice(0,-1),'kpis']}},
    {...entry,layout:{...entry.layout,hiddenSections:['script']}},
    {...entry,layout:{...entry.layout,hiddenSections:['kpis','kpis']}},
    {...entry,analysis:{...entry.analysis,views:{...entry.analysis.views,sankey:{measure:'custom-js'}}}},
    {...entry,extra:{html:'<script>alert(1)</script>'}},
    {...entry,id:'full-dashboard'},
    {...entry,id:'path/../../bad'},
    {...entry,name:'hello\u202Eevil'},
    {...entry,name:' '.repeat(4)},
    {...entry,updatedAt:'2026-02-31T00:00:00.000Z'},
    {...entry,schemaVersion:2},
  ]) assert.equal(readDashboardDefinition(input),null);
});
test('WU-11 reuses WU-07 filter validation and exact directed pair semantics',()=>{
  const entry=saved();
  const filters={...entry.analysis.filters,sellerStates:['SP'],customerStates:['MG'],categories:['electronics'],focusedFlows:[
    {sellerState:'SP',customerState:'MG'}, {sellerState:'SP',customerState:'MG'},
    {sellerState:'SP',customerState:'RJ'}, {sellerState:'RJ',customerState:'MG'},
  ]};
  entry.analysis.filters=filters;
  const got=readDashboardDefinition(entry);
  assert.deepEqual(got.analysis.filters.focusedFlows,[{sellerState:'SP',customerState:'MG'}]);
  assert.deepEqual(got.analysis.filters.categories,['electronics']);
  assert.equal(readDashboardDefinition({...entry,analysis:{...entry.analysis,filters:{...filters,purchaseDateFrom:'2018-99-99'}}}),null);
});
test('WU-11 container skips damaged entries and duplicate names or IDs, retains valid dashboards',()=>{
  const a=saved('alpha','First');const b=saved('bravo','Second');
  const result=readDashboardWorkspace({schemaVersion:1,activeDashboardId:'bravo',dashboards:[a,{...a,id:'other',name:'FIRST'},b,saved('alpha','Third'),{bad:true}]});
  assert.equal(result.dashboards.length,2);
  assert.equal(result.activeDashboardId,'bravo');
  assert.deepEqual(result.dashboards.map(d=>d.name),['First','Second']);
  assert.equal(readDashboardWorkspace({...result,activeDashboardId:'nonexistent'}).activeDashboardId,FULL_DASHBOARD_ID);
});
test('WU-11 unknown versions and overlimit containers fall back without interpreting content',()=>{
  const base=withDashboard();
  assert.deepEqual(readDashboardWorkspace({...base,schemaVersion:99}),emptyDashboardWorkspace());
  assert.deepEqual(readDashboardWorkspace({...base,dashboards:Array.from({length:DASHBOARD_LIMIT+1},(_,i)=>saved('id-'+i,'View '+i))}),emptyDashboardWorkspace());
  assert.deepEqual(readDashboardWorkspace({...base,script:'no'}),emptyDashboardWorkspace());
});
test('WU-11 local-only storage round-trips a custom dashboard without touching saved filter views',()=>{
  const store=fakeStorage({[SAVED_VIEWS_KEY]:'[{"legacy":"untouched"}]'});
  assert.equal(readDashboardWorkspaceStorage(store).status,'empty');
  const snapshot=withDashboard();
  const out=writeDashboardWorkspaceStorage(store,snapshot);
  assert.deepEqual(out,{ok:true});
  assert.equal(store.data.get(SAVED_VIEWS_KEY),'[{"legacy":"untouched"}]');
  assert.deepEqual(readDashboardWorkspaceStorage(store),{status:'ready',workspace:readDashboardWorkspace(snapshot)});
  assert.equal(JSON.stringify(readDashboardWorkspaceStorage(store)).includes('orderId'),false);
});
test('WU-11 local storage read failures do not erase or overwrite stored content',()=>{
  const storage=fakeStorage({[DASHBOARD_STORAGE_KEY]:'{broken json'});
  assert.equal(readDashboardWorkspaceStorage(storage).status,'invalid');
  assert.equal(storage.data.get(DASHBOARD_STORAGE_KEY),'{broken json');
  storage.data.set(DASHBOARD_STORAGE_KEY,JSON.stringify({...withDashboard(),schemaVersion:25}));
  assert.equal(readDashboardWorkspaceStorage(storage).status,'unsupported-version');
  assert.match(storage.data.get(DASHBOARD_STORAGE_KEY),/"schemaVersion":25/);
  storage.data.set(DASHBOARD_STORAGE_KEY,'x'.repeat(DASHBOARD_STORAGE_MAX_CHARS+1));
  assert.equal(readDashboardWorkspaceStorage(storage).status,'oversize');
  assert.equal(storage.data.get(DASHBOARD_STORAGE_KEY).length,DASHBOARD_STORAGE_MAX_CHARS+1);
  assert.equal(readDashboardWorkspaceStorage({getItem:()=>{throw Error('denied')}}).status,'unavailable');
});
test('WU-11 write reports quota denial and rejects truncated or invalid snapshot without modifying storage',()=>{
  let writes=0;
  const snapshot=withDashboard();
  const store={getItem:()=>null,setItem:()=>{writes++;}};
  assert.deepEqual(writeDashboardWorkspaceStorage(store,{...snapshot,activeDashboardId:'missing'}),{ok:false,reason:'invalid'});
  assert.deepEqual(writeDashboardWorkspaceStorage(store,{...snapshot,dashboards:[saved('one','Duplicated'),saved('two','Duplicated')]}),{ok:false,reason:'invalid'});
  assert.equal(writes,0);
  assert.deepEqual(writeDashboardWorkspaceStorage({getItem:()=>null,setItem:()=>{throw Error('quota')}},snapshot),{ok:false,reason:'unavailable'});
});
test('WU-11 storage does not contain dataset rows or a shadow copy of the full dashboard',()=>{
  const store=fakeStorage();
  writeDashboardWorkspaceStorage(store,withDashboard());
  const raw=store.data.get(DASHBOARD_STORAGE_KEY);
  assert.ok(raw.length<10_000);
  assert.ok(!raw.includes('Full Dashboard'));
  assert.ok(!raw.includes('orderId'));
  assert.ok(!raw.includes('items.json'));
});

const {groupDashboardSections} = require('../dist-test/domain/dashboardSectionLayout');
test('WU-11 Phase 2 groups adjacent visualizations without reordering sections',()=>{
  assert.deepEqual(groupDashboardSections(DASHBOARD_SECTION_IDS),[
    {group:'kpis',sections:['kpis']},
    {group:'comparison',sections:['periodComparison']},
    {group:'charts',sections:['geographicDistribution','deliveryTrends','shippingSankey']},
    {group:'advanced',sections:['categoryLeaderboard','delayDistribution']},
    {group:'orders',sections:['orderExplorer']},
  ]);
  assert.deepEqual(groupDashboardSections(['shippingSankey','orderExplorer','geographicDistribution','kpis']),[
    {group:'charts',sections:['shippingSankey']},
    {group:'orders',sections:['orderExplorer']},
    {group:'charts',sections:['geographicDistribution']},
    {group:'kpis',sections:['kpis']},
  ]);
  assert.deepEqual(groupDashboardSections([]),[]);
});
