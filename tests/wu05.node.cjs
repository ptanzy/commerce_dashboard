const test=require('node:test');
const assert=require('node:assert/strict');
const {buildDataIndex}=require('../dist-test/data/indexes.js');
const {DEFAULT_FILTERS}=require('../dist-test/domain/types.js');
const {selectCohort,selectFocusedFlowCohort,computeMetrics,topDirectedFlows,monthlyTrendContext}=require('../dist-test/domain/selectors.js');
const {selectOrderDetail,selectExplorerOrders}=require('../dist-test/domain/orderExplorer.js');
const {filterReducer}=require('../dist-test/app/filterReducer.js');

const order=(id,destination,month='2018-03')=>({
  orderId:id,customerState:destination,purchaseDate:`${month}-01`,purchaseTimestamp:`${month}-01T09:00:00`,
  estimatedDeliveryDate:`${month}-15`,deliveredDate:`${month}-10`,deliveredTimestamp:`${month}-10T09:00:00`,
  status:'delivered',deliveryDays:9,deliveryDayDelta:-5,deliveryClassification:'early',itemCount:1,
});
const item=(id,n,origin,dest,category,price,freight)=>({orderId:id,orderItemId:n,sellerId:'seller',sellerState:origin,customerState:dest,category,priceBRL:price,freightChargeBRL:freight});
const orders=[order('multi','MG'),order('rj-mg','MG'),order('sp-ba','BA','2018-04'),order('rj-ba','BA'),order('other','SP'),order('zero','MG')];
orders[0].itemCount=2;orders[5].itemCount=0;
const items=[
 item('multi',1,'SP','MG','books',100,10),item('multi',2,'RJ','MG','furniture',200,40),
 item('rj-mg',1,'RJ','MG','books',50,5),item('sp-ba',1,'SP','BA','books',80,8),
 item('rj-ba',1,'RJ','BA','furniture',60,6),item('other',1,'SP','SP','furniture',90,9),
];
const index=buildDataIndex(orders,items);
const f=(v={})=>({...DEFAULT_FILTERS,...v});

// Core semantics: OR inside each group; AND across groups; category/seller on same item.
test('WU-05 multi-select OR within dimension and AND across groups at the same-item grain',()=>{
  const group=selectCohort(index,f({sellerStates:['SP','RJ'],customerStates:['MG','BA'],categories:['books']}));
  assert.deepEqual(group.eligibleOrders.map(x=>x.orderId),['multi','rj-mg','sp-ba']);
  assert.deepEqual(group.eligibleItems.map(x=>`${x.orderId}:${x.orderItemId}`),['multi:1','rj-mg:1','sp-ba:1']);
  const mismatched=selectCohort(index,f({sellerStates:['SP'],categories:['furniture'],customerStates:['MG']}));
  assert.equal(mismatched.eligibleOrders.length,0); // multi has SP books and RJ furniture
});
test('WU-05 focus acts as a distinct directed item-pair constraint without mutating context',()=>{
  const context=selectCohort(index,f({customerStates:['MG','BA'],sellerStates:['SP','RJ']}));
  const allFlows=topDirectedFlows(context,15);
  assert.ok(allFlows.links.some(x=>x.sellerState==='SP'&&x.customerState==='MG'));
  const focus=selectFocusedFlowCohort(context,{sellerState:'SP',customerState:'MG'});
  assert.deepEqual(focus.eligibleOrders.map(x=>x.orderId),['multi']);
  assert.deepEqual(focus.eligibleItems.map(x=>x.orderItemId),[1]);
  assert.equal(computeMetrics(focus).freightChargeBRL,10);
  assert.equal(computeMetrics(context).distinctOrders,4);
  assert.equal(topDirectedFlows(context,15).links.length,allFlows.links.length);
  const details=selectOrderDetail(index,focus,f({customerStates:['MG','BA'],sellerStates:['SP','RJ'],focusedFlow:{sellerState:'SP',customerState:'MG'}}),'multi');
  assert.deepEqual([...details.matchingItemIds],[1]);
  assert.equal(details.matchingTotals.priceBRL,100);
  assert.equal(details.fullTotals.priceBRL,300);
  assert.deepEqual(selectExplorerOrders(focus).map(x=>x.orderId),['multi']);
});
test('WU-05 flow focus toggles without overwriting global selection groups',()=>{
  const state=f({sellerStates:['RJ','SP'],customerStates:['BA','MG'],categories:['books']});
  const focused=filterReducer(state,{type:'focus_flow',sellerState:'SP',customerState:'MG'});
  assert.deepEqual(focused.sellerStates,state.sellerStates);
  assert.deepEqual(focused.customerStates,state.customerStates);
  assert.deepEqual(focused.categories,state.categories);
  assert.deepEqual(focused.focusedFlow,{sellerState:'SP',customerState:'MG'});
  assert.equal(filterReducer(focused,{type:'focus_flow',sellerState:'SP',customerState:'MG'}).focusedFlow,null);
  assert.equal(filterReducer(focused,{type:'clear_flow_focus'}).focusedFlow,null);
});
test('WU-05 group toggles, chip-equivalent removals, and incompatible focus reconciliation',()=>{
  const first=filterReducer(DEFAULT_FILTERS,{type:'toggle_value',dimension:'sellerStates',value:'SP'});
  const both=filterReducer(first,{type:'toggle_value',dimension:'sellerStates',value:'RJ'});
  assert.deepEqual(both.sellerStates,['RJ','SP']);
  assert.deepEqual(filterReducer(both,{type:'toggle_value',dimension:'sellerStates',value:'RJ'}).sellerStates,['SP']);
  const focus=filterReducer(both,{type:'focus_flow',sellerState:'SP',customerState:'MG'});
  const removed=filterReducer(focus,{type:'toggle_value',dimension:'sellerStates',value:'SP'});
  assert.equal(removed.focusedFlow,null);
  assert.deepEqual(removed.sellerStates,['RJ']);
  assert.deepEqual(filterReducer(both,{type:'clear_dimension',dimension:'sellerStates'}).sellerStates,[]);
  assert.deepEqual(filterReducer(both,{type:'clear_all'}),DEFAULT_FILTERS);
});
test('WU-05 focused monthly trend preserves full-history context and contextual comparison',()=>{
  const filters=f({customerStates:['MG','BA'],sellerStates:['SP','RJ'],purchaseDateFrom:'2018-04-01',purchaseDateTo:'2018-04-30'});
  const overview=monthlyTrendContext(index,filters);
  const focus=monthlyTrendContext(index,filters,30,{sellerState:'SP',customerState:'MG'});
  assert.deepEqual(overview.map(x=>x.month),['2018-03','2018-04']);
  assert.deepEqual(focus.map(x=>x.month),['2018-03','2018-04']);
  assert.deepEqual(overview.map(x=>x.selected),[false,true]);
  assert.deepEqual(focus.map(x=>x.distinctOrders),[1,0]);
  assert.ok(overview[0].distinctOrders>focus[0].distinctOrders);
});
test('WU-05 no selections means all data, including zero-item orders; focused zero cohort is empty',()=>{
  const all=selectCohort(index,DEFAULT_FILTERS);
  assert.equal(all.eligibleOrders.length,6);
  const impossible=selectFocusedFlowCohort(all,{sellerState:'AL',customerState:'XX'});
  assert.equal(impossible.eligibleOrders.length,0);
  assert.equal(computeMetrics(impossible).onTimeRate,null);
});
