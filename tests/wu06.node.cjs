const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildDataIndex}=require('../dist-test/data/indexes.js');
const {DEFAULT_FILTERS}=require('../dist-test/domain/types.js');
const {selectCohort,selectFocusedFlowCohort,computeMetrics,deliveryBreakdown,stateDeliveryStats,topDirectedFlows}=require('../dist-test/domain/selectors.js');
function order(id,dest='SP',kind='early',days=4) {return {
  orderId:id,customerState:dest,purchaseDate:'2018-03-01',purchaseTimestamp:'2018-03-01T10:00:00',
  estimatedDeliveryDate:'2018-03-09', deliveredDate:kind==='unknown'?null:'2018-03-05',
  deliveredTimestamp:kind==='unknown'?null:'2018-03-05T10:00:00',
  status:kind==='unknown'?'canceled':'delivered',deliveryDays:kind==='unknown'?null:days,
  deliveryDayDelta:kind==='early'?-1:kind==='late'?1:0,deliveryClassification:kind,itemCount:1
};}
function item(id,n,origin,dest,price,freight){return {orderId:id,orderItemId:n,sellerId:`s${n}`,sellerState:origin,customerState:dest,category:'books',priceBRL:price,freightChargeBRL:freight};}
const orders=[order('A','SP','early',1),order('B','SP','on_time',2),order('C','RJ','late',6),order('D','RJ','unknown'),order('E','MG','on_time',8)];
const items=[
 item('A',1,'SP','SP',10,100),item('A',2,'SP','SP',20,0),
 item('B',1,'RJ','SP',200,2),item('C',1,'SP','RJ',300,3),
 item('D',1,'SP','RJ',null,null),item('E',1,'SP','MG',0,0),
];
const idx=buildDataIndex(orders,items);
const cohort=selectCohort(idx,DEFAULT_FILTERS);

test('WU-06 P95 reuses valid R-7 fractional durations, excludes unknown',()=>{
 const m=computeMetrics(cohort);
 assert.equal(m.distinctOrders,5); assert.equal(m.deliveredDurationCount,4);
 assert.equal(m.medianDeliveryDays,4);
 assert.ok(Math.abs(m.p95DeliveryDays-7.7)<1e-10);
});
test('WU-06 breakdown counts distinct orders and discloses non-eligible statuses',()=>{
 const b=deliveryBreakdown(cohort);
 assert.deepEqual(b,{early:1,onTime:2,late:1,unknown:1,eligible:4,totalOrders:5});
 assert.equal(deliveryBreakdown({eligibleOrders:[],eligibleItems:[],eligibleOrderIds:new Set()}).eligible,0);
 const focus=selectFocusedFlowCohort(cohort,{sellerState:'SP',customerState:'SP'});
 assert.deepEqual(deliveryBreakdown(focus),{early:1,onTime:0,late:0,unknown:0,eligible:1,totalOrders:1});
});
test('WU-06 origin state performance deduplicates same-state seller items per order',()=>{
 const stats=stateDeliveryStats(cohort,'origin');
 assert.equal(stats.get('SP').distinctOrders,4);
 assert.equal(stats.get('SP').onTimeDenominator,3);
 assert.equal(stats.get('SP').onTimeNumerator,2);
 assert.equal(stats.get('SP').onTimeRate,2/3);
 assert.equal(stats.get('SP').medianDeliveryDays,6);
 assert.equal(stats.get('RJ').distinctOrders,1);
 assert.equal(stats.get('RJ').onTimeRate,1);
});
test('WU-06 destination performance includes zero-item orders but excludes invalid denominator',()=>{
 const more=[...orders,{...order('Z','MG','unknown'),itemCount:0}];
 const index=buildDataIndex(more,items);
 const stats=stateDeliveryStats(selectCohort(index,DEFAULT_FILTERS),'destination');
 assert.equal(stats.get('SP').distinctOrders,2);
 assert.equal(stats.get('SP').onTimeRate,1);
 assert.equal(stats.get('RJ').onTimeDenominator,1);
 assert.equal(stats.get('RJ').distinctOrders,2);
 assert.equal(stats.get('MG').distinctOrders,2);
 assert.equal(stats.get('MG').onTimeDenominator,1);
 assert.equal(stats.get('MG').medianDeliveryDays,8);
});
test('WU-06 item, freight and value Sankey modes re-rank pairs independently',()=>{
 const base=topDirectedFlows(cohort,15,'items');
 assert.equal(base.mappableItemCount,6);
 assert.equal(base.links[0].sellerState,'SP');assert.equal(base.links[0].customerState,'RJ'); // tie breaks by destination UF
 assert.equal(base.links.find(link=>link.sellerState==='SP' && link.customerState==='SP').itemCount,2);
 assert.equal(base.mappableWeight,6);
 const freight=topDirectedFlows(cohort,2,'freight');
 assert.equal(freight.links[0].sellerState,'SP'); assert.equal(freight.links[0].customerState,'SP');
 assert.equal(freight.links[0].freightChargeBRL,100);
 assert.equal(freight.shownWeight,103);
 assert.equal(freight.mappableWeight,105);
 assert.equal(freight.coverage,103/105);
 assert.equal(freight.invalidWeightItems,1);
 const values=topDirectedFlows(cohort,2,'value');
 assert.equal(values.links[0].sellerState,'SP'); assert.equal(values.links[0].customerState,'RJ');
 assert.equal(values.links[0].weight,300);
 assert.equal(values.links[1].weight,200);
 assert.equal(values.mappableWeight,530);
 assert.equal(values.coverage,500/530);
 assert.equal(values.invalidWeightItems,1);
});
test('WU-06 monetary Sankey ignores zero-only and null-only pairs but preserves item counts',()=>{
 const value=topDirectedFlows(cohort,15,'value');
 assert.ok(!value.links.some(x=>x.customerState==='MG'));
 assert.equal(value.mappableItemCount,6);
 const itemsMode=topDirectedFlows(cohort,15,'items');
 assert.ok(itemsMode.links.some(x=>x.customerState==='MG'));
 const nullOnly=selectCohort(idx,{...DEFAULT_FILTERS,customerStates:['MG']});
 assert.equal(topDirectedFlows(nullOnly,15,'freight').links.length,0);
 assert.equal(topDirectedFlows(nullOnly,15,'freight').coverage,null);
});
test('WU-06 focused KPIs and Sankey overview remain independent after measure selection',()=>{
 const focus=selectFocusedFlowCohort(cohort,{sellerState:'SP',customerState:'RJ'});
 assert.equal(computeMetrics(focus).distinctOrders,2);
 assert.equal(deliveryBreakdown(focus).unknown,1);
 for(const measure of ['items','freight','value']) {
   assert.equal(topDirectedFlows(cohort,15,measure).mappableItemCount,6);
   assert.equal(computeMetrics(focus).distinctOrders,2);
 }
});
