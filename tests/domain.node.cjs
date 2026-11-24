// Executable fallback checks where Vitest cannot be installed (same source files).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildDataIndex}=require('../dist-test/data/indexes.js');
const {DEFAULT_FILTERS}=require('../dist-test/domain/types.js');
const {selectCohort,computeMetrics,quantileR7,matchingOrderAmounts,topDirectedFlows,originStateOrderCounts,destinationStateOrderCounts,monthlyTrendContext,monthDateRange,categoryLabel}=require('../dist-test/domain/selectors.js');
function order(id, override={}){return {
 orderId:id, customerState:'MG',purchaseDate:'2018-03-05',purchaseTimestamp:'2018-03-05T10:00:00',
 estimatedDeliveryDate:'2018-03-10',deliveredDate:'2018-03-10',deliveredTimestamp:'2018-03-10T21:00:00',
 status:'delivered', deliveryDays:5.458333333333333,deliveryDayDelta:0,deliveryClassification:'on_time',itemCount:1,...override
};}
function item(orderId, orderItemId,sellerState,category,priceBRL,freightChargeBRL,customerState='MG'){
 return {orderId,orderItemId,sellerId:`seller-${sellerState}`,sellerState,customerState,category,priceBRL,freightChargeBRL};
}
function fixture(){const orders=[
 order('mixed',{itemCount:3}),
 order('early',{customerState:'SP',deliveryClassification:'early',deliveryDayDelta:-2,deliveryDays:2,itemCount:1}),
 order('late',{customerState:'RJ',deliveryClassification:'late',deliveryDayDelta:2,deliveryDays:7,itemCount:1}),
 order('bad',{customerState:'SP',deliveryClassification:'unknown',deliveryDayDelta:null,deliveryDays:null,itemCount:1}),
 order('no_items',{status:'canceled',deliveredDate:null,deliveredTimestamp:null,deliveryDays:null,deliveryDayDelta:null,deliveryClassification:'unknown',itemCount:0}),
 order('missing_actual',{status:'delivered',deliveredDate:null,deliveredTimestamp:null,deliveryDays:null,deliveryDayDelta:null,deliveryClassification:'unknown',itemCount:0}),
 order('zero_price',{customerState:'SP',itemCount:1}),
 order('invalid_money',{customerState:'SP',itemCount:1}),
 order('month2',{purchaseDate:'2018-04-01',purchaseTimestamp:'2018-04-01T00:00:00',itemCount:1}),
 order('without_purchase',{purchaseDate:null,purchaseTimestamp:null,itemCount:1})
 ];const items=[
 item('mixed',1,'SP','electronics',100,10),item('mixed',2,'RJ','furniture',200,20),item('mixed',3,'SP','electronics',50,5),
 item('early',1,'SP','electronics',10,0,'SP'),item('late',1,'RJ','furniture',30,3,'RJ'),
 item('bad',1,'SP','electronics',40,1,'SP'),item('zero_price',1,'SP','electronics',0,0,'SP'),
 item('invalid_money',1,'SP','electronics',null,null,'SP'),item('month2',1,'RJ','electronics',10,2),
 item('without_purchase',1,'SP','electronics',10,1)
 ];return buildDataIndex(orders,items);}
function c(index, filters={}){return selectCohort(index,{...DEFAULT_FILTERS,...filters});}

test('default cohort retains zero-item orders but excludes invalid purchase dates',()=>{
 const idx=fixture(), group=c(idx);assert.equal(group.eligibleOrders.length,9);assert.equal(group.eligibleItems.length,9);
 assert.ok(group.eligibleOrderIds.has('no_items'));assert.ok(!group.eligibleOrderIds.has('without_purchase'));
});
test('seller and category must match the SAME item; never explode order counts',()=>{
 const idx=fixture();const group=c(idx,{sellerStates:['SP'],categories:['furniture']});
 assert.equal(group.eligibleOrders.length,0);assert.equal(group.eligibleItems.length,0);
 const electronics=c(idx,{sellerStates:['SP'],categories:['electronics']});
 assert.equal(electronics.eligibleItems.length,6);assert.equal(electronics.eligibleOrders.length,5);
 assert.equal(electronics.eligibleOrders.filter(o=>o.orderId==='mixed').length,1);
 assert.ok(!electronics.eligibleOrderIds.has('no_items'));
});
test('category filtering restricts matching money; order-level KPIs remain distinct',()=>{
 const idx=fixture(), group=c(idx,{categories:['furniture']}), metrics=computeMetrics(group);
 assert.equal(metrics.distinctOrders,2);
 assert.equal(metrics.itemPriceBRL,230);assert.equal(metrics.freightChargeBRL,23);
 assert.equal(metrics.freightToPriceRatio,0.1);
 const amounts=matchingOrderAmounts(group);
 assert.deepEqual(amounts.get('mixed'),{matchedItemCount:1,priceBRL:200,freightChargeBRL:20});
});
test('a no-item order keeps null money and zero count',()=>{
 const amounts=matchingOrderAmounts(c(fixture()));
 assert.deepEqual(amounts.get('no_items'),{matchedItemCount:0,priceBRL:null,freightChargeBRL:null});
});
test('unknown/negative delivery and missing actual excluded, early and on-time counted',()=>{
 const metrics=computeMetrics(c(fixture()));
 assert.equal(metrics.distinctOrders,9);
 assert.equal(metrics.deliveredDurationCount,6);
 assert.equal(metrics.onTimeDenominator,6);
 assert.equal(metrics.onTimeNumerator,5);
 assert.equal(metrics.onTimeRate,5/6);
 assert.equal(metrics.invalidPriceItems,1);
 assert.equal(metrics.invalidFreightItems,1);
});
test('empty cohort and zero price render undefined ratios as null',()=>{
 const metrics=computeMetrics(c(fixture(),{customerStates:['XX']}));
 assert.equal(metrics.distinctOrders,0);assert.equal(metrics.onTimeRate,null);assert.equal(metrics.medianDeliveryDays,null);assert.equal(metrics.freightToPriceRatio,null);
 const zeros=computeMetrics(c(fixture(),{customerStates:['SP'],categories:['electronics'],sellerStates:['SP']}));
 assert.ok(zeros.itemPriceBRL>=0);
});
test('R-7 interpolation and fractional days',()=>{
 assert.equal(quantileR7([],0.5),null);
 assert.equal(quantileR7([1,2,3,4],0.5),2.5);
 assert.equal(quantileR7([1,2,3,4],0.95),3.8499999999999996);
 assert.equal(quantileR7([0,1],0.25),0.25);
 assert.throws(()=>quantileR7([1],1.1));
});
test('Sankey keeps same-state links, counts item contributions, and coverage',()=>{
 const idx=fixture();const group=c(idx);const flows=topDirectedFlows(group,2);
 assert.equal(flows.links.length,2);
 assert.equal(flows.mappableItemCount,9);
 assert.equal(flows.shownItemCount,6);
 assert.equal(flows.coverage,6/9);
 const same=topDirectedFlows(group,15).links.find(l=>l.sellerState==='SP' && l.customerState==='SP');
 assert.ok(same);assert.equal(same.source,'origin:SP');assert.equal(same.target,'dest:SP');
 assert.equal(same.itemCount,4);
});
test('origin states deduplicate each order only within each state',()=>{
 const group=c(fixture());const origin=originStateOrderCounts(group);const dest=destinationStateOrderCounts(group);
 assert.equal(origin.get('SP'),5);assert.equal(origin.get('RJ'),3);
 assert.equal(dest.get('MG'),4);assert.equal(dest.get('SP'),4);assert.equal(dest.get('RJ'),1);
});
test('trend retains context months and allows switching months after date filter',()=>{
 const idx=fixture();const f={...DEFAULT_FILTERS,...monthDateRange('2018-03')};
 const filters={...DEFAULT_FILTERS,purchaseDateFrom:f.from,purchaseDateTo:f.to};
 const values=monthlyTrendContext(idx,filters);
 assert.deepEqual(values.map(v=>v.month),['2018-03','2018-04']);
 assert.equal(values[0].selected,true);assert.equal(values[1].selected,false);
 assert.equal(values[0].distinctOrders,8);assert.equal(values[1].distinctOrders,1);
 assert.deepEqual(monthDateRange('2024-02'),{from:'2024-02-01',to:'2024-02-29'});
});
test('category labels do not mutate filter keys',()=>{
 assert.equal(categoryLabel('health_beauty'),'Health Beauty');
 assert.equal(categoryLabel('untranslated:pc_gamer'),'Untranslated: Pc Gamer');
 assert.equal(categoryLabel('unknown'),'Unknown');
});

test('manifest validator rejects corrupt counts and maintains a stable item index',()=>{
 const {validateDataset}=require('../dist-test/data/validate.js');
 const idx=fixture();
 const manifest={schemaVersion:2,sourceName:'Olist Brazilian E-Commerce',processingVersion:'wu01-duckdb-1',orderCount:idx.orders.length,itemCount:idx.items.length};
 const result=validateDataset(idx.orders,idx.items,manifest);
 assert.equal(result.index.itemsByOrderId.get('mixed').length,3);
 assert.throws(()=>validateDataset(idx.orders,idx.items,{...manifest,orderCount:10_000}),/order count mismatch/);
 assert.throws(()=>validateDataset(idx.orders,idx.items.map(x=>({...x,priceBRL:-10})),manifest),/invalid item amount/);
});
