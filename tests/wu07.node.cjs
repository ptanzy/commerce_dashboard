const test=require('node:test');
const assert=require('node:assert/strict');
const {buildDataIndex}=require('../dist-test/data/indexes.js');
const {DEFAULT_FILTERS}=require('../dist-test/domain/types.js');
const {filterReducer}=require('../dist-test/app/filterReducer.js');
const {selectCohort,selectFocusedFlowCohort,computeMetrics,topDirectedFlows}=require('../dist-test/domain/selectors.js');
const {selectOrderDetail}=require('../dist-test/domain/orderExplorer.js');
const {categoryLeaderboard,delayDistribution,previousPeriod}=require('../dist-test/domain/exploration.js');
const {exportCohortCsv}=require('../dist-test/domain/exportCsv.js');
const {readSavedViews,readFilterSnapshot}=require('../dist-test/domain/savedViews.js');
const f=(change={})=>({...DEFAULT_FILTERS,...change});
function order(id,date,dest='MG',className='early',delta=-2){return {orderId:id,customerState:dest,purchaseDate:date,purchaseTimestamp:date+'T09:00:00',estimatedDeliveryDate:'2018-03-20',deliveredDate:'2018-03-18',deliveredTimestamp:'2018-03-18T09:00:00',status:'delivered',deliveryDays:7,deliveryDayDelta:delta,deliveryClassification:className,itemCount:1};}
function item(id,n,from,to,cat,price,freight){return {orderId:id,orderItemId:n,sellerId:'s',sellerState:from,customerState:to,category:cat,priceBRL:price,freightChargeBRL:freight};}
const o=[order('multi','2018-03-11'),order('rjmg','2018-03-12'),order('spba','2018-03-12','BA','late',2),order('rjba','2018-03-13','BA','on_time',0),order('old','2018-03-09'),order('zero','2018-03-12')];
o[0].itemCount=2;o[5].itemCount=0;o[5].status='canceled';o[5].deliveryClassification='unknown';o[5].deliveryDays=null;o[5].deliveryDayDelta=null;
const items=[item('multi',1,'SP','MG','books',100,10),item('multi',2,'RJ','MG','furniture',200,20),item('rjmg',1,'RJ','MG','books',50,5),item('spba',1,'SP','BA','books',80,8),item('rjba',1,'RJ','BA','furniture',60,6),item('old',1,'SP','MG','books',90,9)];
const idx=buildDataIndex(o,items);
const focused=[{sellerState:'SP',customerState:'MG'},{sellerState:'RJ',customerState:'BA'}];

test('WU-07 OR of exact pair selections preserves item grain and deduplicates orders',()=>{
 const context=selectCohort(idx,DEFAULT_FILTERS);
 const one=selectFocusedFlowCohort(context,focused);
 assert.deepEqual(one.eligibleOrders.map(x=>x.orderId),['multi','rjba','old']);
 assert.deepEqual(one.eligibleItems.map(x=>`${x.orderId}:${x.orderItemId}`),['multi:1','rjba:1','old:1']);
 assert.equal(computeMetrics(one).itemPriceBRL,250);
 assert.ok(!one.eligibleItems.some(x=>x.sellerState==='SP'&&x.customerState==='BA'));
 assert.equal(selectFocusedFlowCohort(context,[]),context);
 const detail=selectOrderDetail(idx,one,f({focusedFlows:focused}),'multi');
 assert.deepEqual([...detail.matchingItemIds],[1]);
 assert.equal(detail.fullTotals.priceBRL,300);
});
test('WU-07 multi-flow reducer add/remove and plain-click replacement',()=>{
 let s=filterReducer(DEFAULT_FILTERS,{type:'focus_flow',sellerState:'SP',customerState:'MG'});
 s=filterReducer(s,{type:'toggle_flow_focus',sellerState:'RJ',customerState:'BA'});
 assert.deepEqual(s.focusedFlows,focused);
 assert.deepEqual(filterReducer(s,{type:'focus_flow',sellerState:'RJ',customerState:'MG'}).focusedFlows,[{sellerState:'RJ',customerState:'MG'}]);
 s=filterReducer(s,{type:'toggle_flow_focus',sellerState:'SP',customerState:'MG'});
 assert.deepEqual(s.focusedFlows,[{sellerState:'RJ',customerState:'BA'}]);
 assert.deepEqual(filterReducer(s,{type:'toggle_flow_focus',sellerState:'RJ',customerState:'BA'}).focusedFlows,[]);
});
test('WU-07 narrowing global selection only removes incompatible focused pairs',()=>{
 let state=f({sellerStates:['SP','RJ'],customerStates:['MG','BA'],focusedFlows:focused});
 state=filterReducer(state,{type:'toggle_value',dimension:'sellerStates',value:'RJ'});
 assert.deepEqual(state.focusedFlows,[focused[0]]);
 assert.deepEqual(filterReducer(state,{type:'clear_dimension',dimension:'sellerStates'}).focusedFlows,[focused[0]]);
});
test('WU-07 pin selected non-top-15 links when Sankey measure reranks pairs',()=>{
 const c=selectCohort(idx,DEFAULT_FILTERS);
 const normal=topDirectedFlows(c,1,'freight');
 const pinned=topDirectedFlows(c,1,'freight',[{sellerState:'RJ',customerState:'BA'},{sellerState:'SP',customerState:'MG'}]);
 assert.equal(normal.links.length,1);
 assert.ok(pinned.links.some(l=>l.sellerState==='RJ'&&l.customerState==='BA'));
 assert.ok(pinned.links.some(l=>l.sellerState==='SP'&&l.customerState==='MG'));
 assert.ok(pinned.coverage<=1);
 const again=topDirectedFlows(c,1,'freight',[{sellerState:'RJ',customerState:'BA'},{sellerState:'RJ',customerState:'BA'}]);
 assert.equal(new Set(again.links.map(l=>l.sellerState+'-'+l.customerState)).size,again.links.length);
});
test('WU-07 category leaderboard uses distinct orders and correctly scoped item money',()=>{
 const c=selectCohort(idx,DEFAULT_FILTERS);
 const rows=categoryLeaderboard(c,'orders');
 const books=rows.find(x=>x.category==='books');
 assert.equal(books.distinctOrders,4);
 assert.equal(books.itemValueBRL,320);
 const furniture=rows.find(x=>x.category==='furniture');
 assert.equal(furniture.distinctOrders,2);
 assert.equal(furniture.itemValueBRL,260);
 assert.equal(categoryLeaderboard(selectFocusedFlowCohort(c,focused)).find(x=>x.category==='furniture').itemValueBRL,60);
});
test('WU-07 category rates null when undelivered and do not invent amounts',()=>{
 const badOrder={...order('null','2018-03-12'),status:'canceled',deliveryClassification:'unknown'};
 const c=selectCohort(buildDataIndex([badOrder],[item('null',1,'SP','MG','weird',null,null)]),DEFAULT_FILTERS);
 const [rank]=categoryLeaderboard(c,'freight');
 assert.equal(rank.freightBRL,null);
 assert.equal(rank.itemValueBRL,null);
 assert.equal(rank.onTimeRate,null);
});
test('WU-07 delay distribution uses calendar-day delta and explicitly excludes unknown',()=>{
 const d=delayDistribution(selectCohort(idx,DEFAULT_FILTERS));
 assert.equal(d.observed,5);assert.equal(d.withoutDelta,1);
 assert.equal(d.buckets.find(b=>b.id==='early1').count,3);
 assert.equal(d.buckets.find(b=>b.id==='on-time').count,1);
 assert.equal(d.buckets.find(b=>b.id==='late3').count,1);
 assert.equal(d.buckets.reduce((n,b)=>n+b.count,0),d.observed);
});
test('WU-07 previous equal-length period honors date filters, focused pairs, and available history',()=>{
 const c=previousPeriod(idx,f({purchaseDateFrom:'2018-03-11',purchaseDateTo:'2018-03-12',focusedFlows:[{sellerState:'SP',customerState:'MG'}]}));
 assert.equal(c.days,2);assert.equal(c.previousFrom,'2018-03-09');assert.equal(c.previousTo,'2018-03-10');
 assert.equal(c.previousMetrics.distinctOrders,1);
 assert.equal(previousPeriod(idx,f({purchaseDateFrom:'2018-03-09',purchaseDateTo:'2018-03-10'})),null);
 assert.equal(previousPeriod(idx,f({purchaseDateFrom:'2018-03-12',purchaseDateTo:null})),null);
});
test('WU-07 CSV preserves missing amounts, exact focused cohort, and safe spreadsheet text',()=>{
 const c=selectFocusedFlowCohort(selectCohort(idx,DEFAULT_FILTERS),focused);
 const csv=exportCohortCsv(c);
 assert.ok(csv.startsWith('\ufefforder_id,purchase_date'));
 assert.equal(csv.trim().split('\r\n').length,4);
 assert.ok(csv.includes('"multi"'));
 assert.ok(!csv.includes('"spba"'));
 const injection=selectCohort(buildDataIndex([order('=2+3','2018-03-12')],[]),DEFAULT_FILTERS);
 assert.ok(exportCohortCsv(injection).includes('"\'=2+3"'));
 assert.ok(exportCohortCsv(injection).includes('"=2+3"')===false);
});
test('WU-07 saved view validation sanitizes duplicates, tampered state and incomplete snapshots',()=>{
 const data={...DEFAULT_FILTERS,sellerStates:['SP','SP'],customerStates:['MG'],categories:['books'],focusedFlows:focused};
 const normalized=readFilterSnapshot(data);
 assert.deepEqual(normalized.sellerStates,['SP']);
 assert.deepEqual(normalized.focusedFlows,[focused[0]]); // RJ flow violates seller selection
 const views=readSavedViews([{id:'one',name:'  My view  ',filters:data},{id:'one',name:'duplicate',filters:data},{id:'bad',name:'Invalid',filters:{}}]);
 assert.equal(views.length,1);assert.equal(views[0].name,'My view');
 assert.equal(readFilterSnapshot({...data,sellerStates:['bad state']}),null);
 assert.equal(readFilterSnapshot({...data,purchaseDateFrom:'2018-02-31'}),null);
});
