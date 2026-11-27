'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {defaultDashboardDefinition,readDashboardDefinition,readDashboardWorkspace,
  DASHBOARD_SECTION_IDS,LEGACY_DASHBOARD_SECTION_IDS,OPERATIONAL_DASHBOARD_SECTION_IDS,SELLER_DASHBOARD_SECTION_IDS,TEN_SECTION_IDS,
  ELEVEN_SECTION_IDS,CUSTOMER_EXPERIENCE_SECTION_IDS,DASHBOARD_STORAGE_KEY}=require('../dist-test/domain/dashboardWorkspace');
const {readDashboardWorkspaceStorage,writeDashboardWorkspaceStorage}=require('../dist-test/app/dashboardWorkspaceStorage');
const {shiftDashboardSection}=require('../dist-test/domain/dashboardSectionOrdering');
const TODAY='2026-11-27T12:00:00.000Z';
const make=(id='existing')=>({...defaultDashboardDefinition(),id,name:'Legacy',updatedAt:TODAY});
function legacy(){
 const d=make();
 d.layout.sectionOrder=[...LEGACY_DASHBOARD_SECTION_IDS].reverse();
 d.layout.hiddenSections=['kpis','shippingSankey'];
 d.layout.filterPanelVisible=false;
 d.analysis.filters.sellerStates=['SP'];
 d.analysis.views.trends={measure:'onTime'};
 return d;
}
test('OE-2 legacy eight-section definition is migrated without changing old order, visibility, or saved analysis',()=>{
 const input=legacy();
 const got=readDashboardDefinition(input);
 assert.ok(got);
 assert.deepEqual(got.layout.sectionOrder.slice(0,8),input.layout.sectionOrder);
 assert.deepEqual(got.layout.sectionOrder.slice(8),[...OPERATIONAL_DASHBOARD_SECTION_IDS,...SELLER_DASHBOARD_SECTION_IDS,...CUSTOMER_EXPERIENCE_SECTION_IDS]);
 assert.deepEqual(got.layout.hiddenSections,['kpis','shippingSankey',...OPERATIONAL_DASHBOARD_SECTION_IDS,...SELLER_DASHBOARD_SECTION_IDS,...CUSTOMER_EXPERIENCE_SECTION_IDS]);
 assert.equal(got.layout.filterPanelVisible,false);
 assert.deepEqual(got.analysis.filters.sellerStates,['SP']);
 assert.deepEqual(got.analysis.views.trends,{measure:'onTime'});
 assert.equal(input.layout.sectionOrder.length,8);
});
test('OE-4 full dashboard defaults to twelve visible sections and supports moving new panels',()=>{
 const full=defaultDashboardDefinition();
 assert.deepEqual(full.layout.sectionOrder,DASHBOARD_SECTION_IDS);
 assert.deepEqual(full.layout.hiddenSections,[]);
 const moved=shiftDashboardSection(full.layout.sectionOrder,'shippingCorridorScorecard',-1);
 assert.equal(moved.indexOf('shippingCorridorScorecard'),8);
});
test('OE-2 historical localStorage migrates in memory but remains untouched until explicit Save',()=>{
 const historical={schemaVersion:1,activeDashboardId:'existing',dashboards:[legacy()]};
 const oldValue=JSON.stringify(historical);
 const data=new Map([[DASHBOARD_STORAGE_KEY,oldValue]]);
 const store={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const result=readDashboardWorkspaceStorage(store);
 assert.equal(result.status,'ready');
 assert.equal(result.workspace.activeDashboardId,'existing');
 assert.equal(data.get(DASHBOARD_STORAGE_KEY),oldValue);
 assert.equal(result.workspace.dashboards[0].layout.sectionOrder.length,12);
 assert.deepEqual(writeDashboardWorkspaceStorage(store,result.workspace),{ok:true});
 assert.equal(JSON.parse(data.get(DASHBOARD_STORAGE_KEY)).dashboards[0].layout.sectionOrder.length,12);
});
test('OE-2 corrupt or partial new layouts are rejected, not silently padded',()=>{
 const base=make();
 assert.equal(readDashboardDefinition({...base,layout:{...base.layout,sectionOrder:DASHBOARD_SECTION_IDS.slice(0,9)}}),null);
 assert.equal(readDashboardDefinition({...base,layout:{...base.layout,sectionOrder:[...LEGACY_DASHBOARD_SECTION_IDS,'shippingCorridorScorecard']}}),null);
 assert.equal(readDashboardDefinition({...base,layout:{...base.layout,hiddenSections:['shippingCorridorScorecard','shippingCorridorScorecard']}}),null);
 assert.equal(readDashboardDefinition({...base,layout:{...base.layout,sectionOrder:[...DASHBOARD_SECTION_IDS.slice(0,9),'kpis']}}),null);
});
test('OE-2 migrates only valid entries and preserves active ID and unrelated dashboard records',()=>{
 const v1=legacy(),v2=make('new');v2.name='Expanded';
 const restored=readDashboardWorkspace({schemaVersion:1,activeDashboardId:'existing',dashboards:[v1,v2]});
 assert.equal(restored.activeDashboardId,'existing');
 assert.equal(restored.dashboards.length,2);
 assert.deepEqual(restored.dashboards[1].layout.hiddenSections,[]);
});

test('OE-3 saved ten-section custom layouts append seller hidden without rewriting storage until Save',()=>{
 const ten=make('ten');ten.layout.sectionOrder=[...TEN_SECTION_IDS].reverse();
 ten.layout.hiddenSections=['deliveryTrends'];ten.analysis.filters.categories=['books'];
 const before=JSON.stringify({schemaVersion:1,activeDashboardId:'ten',dashboards:[ten]});
 const data=new Map([[DASHBOARD_STORAGE_KEY,before]]);
 const store={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const result=readDashboardWorkspaceStorage(store);
 assert.equal(result.status,'ready');
 assert.equal(result.workspace.activeDashboardId,'ten');
 const migrated=result.workspace.dashboards[0];
 assert.deepEqual(migrated.layout.sectionOrder.slice(0,10),ten.layout.sectionOrder);
 assert.equal(migrated.layout.sectionOrder[10],'sellerPerformance');
 assert.deepEqual(migrated.layout.hiddenSections,['deliveryTrends','sellerPerformance','customerExperience']);
 assert.deepEqual(migrated.analysis.filters.categories,['books']);
 assert.equal(data.get(DASHBOARD_STORAGE_KEY),before);
 assert.deepEqual(writeDashboardWorkspaceStorage(store,result.workspace),{ok:true});
 assert.equal(JSON.parse(data.get(DASHBOARD_STORAGE_KEY)).dashboards[0].layout.sectionOrder.length,12);
});
test('OE-3 rejects partial eleven-section layouts and duplicated seller section IDs',()=>{
 const base=make();
 assert.equal(readDashboardDefinition({...base,layout:{...base.layout,sectionOrder:DASHBOARD_SECTION_IDS.slice(1)}}),null);
 assert.equal(readDashboardDefinition({...base,layout:{...base.layout,sectionOrder:[...TEN_SECTION_IDS,'shippingCorridorScorecard']}}),null);
 assert.equal(readDashboardDefinition({...base,layout:{...base.layout,hiddenSections:['sellerPerformance','sellerPerformance']}}),null);
});
test('OE-4 saved eleven-section layouts append customer experience hidden, preserve filters and do not write until Save',()=>{
 const eleven=make('prior-eleven');
 eleven.layout.sectionOrder=[...ELEVEN_SECTION_IDS].reverse();
 eleven.layout.hiddenSections=['shippingSankey'];
 eleven.analysis.filters.customerStates=['MG'];
 const original=JSON.stringify({schemaVersion:1,activeDashboardId:'prior-eleven',dashboards:[eleven]});
 const data=new Map([[DASHBOARD_STORAGE_KEY,original]]);
 const store={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const read=readDashboardWorkspaceStorage(store);
 assert.equal(read.status,'ready');
 const upgraded=read.workspace.dashboards[0];
 assert.deepEqual(upgraded.layout.sectionOrder.slice(0,11),eleven.layout.sectionOrder);
 assert.equal(upgraded.layout.sectionOrder[11],'customerExperience');
 assert.deepEqual(upgraded.layout.hiddenSections,['shippingSankey','customerExperience']);
 assert.deepEqual(upgraded.analysis.filters.customerStates,['MG']);
 assert.equal(data.get(DASHBOARD_STORAGE_KEY),original);
 assert.deepEqual(writeDashboardWorkspaceStorage(store,read.workspace),{ok:true});
 assert.equal(JSON.parse(data.get(DASHBOARD_STORAGE_KEY)).dashboards[0].layout.sectionOrder.length,12);
});
test('OE-4 rejects damaged twelve-section layouts and unknown IDs',()=>{
 const full=make('twelve');
 assert.equal(readDashboardDefinition({...full,layout:{...full.layout,sectionOrder:ELEVEN_SECTION_IDS.slice(1)}}),null);
 assert.equal(readDashboardDefinition({...full,layout:{...full.layout,sectionOrder:[...ELEVEN_SECTION_IDS,'notReal']}}),null);
 assert.equal(readDashboardDefinition({...full,layout:{...full.layout,hiddenSections:['customerExperience','customerExperience']}}),null);
});
