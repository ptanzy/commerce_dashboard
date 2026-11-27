'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sellerPerformance}=require('../dist-test/domain/sellerPerformance');
const {selectCohort}=require('../dist-test/domain/selectors');
const {buildDataIndex}=require('../dist-test/data/indexes');
const {DEFAULT_FILTERS}=require('../dist-test/domain/types');
const basic={customerState:'MG',purchaseDate:'2018-01-01',purchaseTimestamp:'2018-01-01T10:00:00',
  approvedTimestamp:'2018-01-01T12:00:00',carrierHandoffTimestamp:'2018-01-03T12:00:00',
  deliveredTimestamp:'2018-01-05T10:00:00',estimatedDeliveryDate:'2018-01-06',deliveredDate:'2018-01-05',
  status:'delivered',deliveryDays:4,deliveryDayDelta:-1,deliveryClassification:'early',itemCount:1};
const makeOrder=(orderId,rest={})=>({orderId,...basic,...rest});
const makeItem=(orderId,orderItemId,sellerId,rest={})=>({orderId,orderItemId,sellerId,sellerState:'SP',customerState:'MG',
  category:'books',priceBRL:100,freightChargeBRL:10,...rest});
const orderData=[makeOrder('multi',{itemCount:2}),makeOrder('solo-a'),makeOrder('solo-b',{deliveryDays:8,deliveredDate:'2018-01-09',deliveredTimestamp:'2018-01-09T10:00:00',deliveryClassification:'late',deliveryDayDelta:3}),
  makeOrder('noitem',{itemCount:0,status:'canceled',deliveredTimestamp:null,deliveryDays:null,deliveredDate:null,deliveryDayDelta:null,deliveryClassification:'unknown'})];
const itemData=[makeItem('multi',1,'seller-a'),makeItem('multi',2,'seller-b',{sellerState:'RJ',category:'beauty',priceBRL:200,freightChargeBRL:25}),
  makeItem('solo-a',1,'seller-a',{priceBRL:0,freightChargeBRL:null}),makeItem('solo-b',1,'seller-b',{sellerState:'RJ',category:'books'})];
const index=buildDataIndex(orderData,itemData);
const cohort=selectCohort(index,DEFAULT_FILTERS);
const row=(result,id)=>result.rows.find(x=>x.sellerId===id);

test('Seller associations are per distinct order; multi-seller order outcomes may appear twice',()=>{
  const result=sellerPerformance(cohort,index.items);
  assert.equal(result.totalSellers,2);
  assert.equal(result.matchedItems,4);
  assert.equal(result.orderCountsMayOverlap,true);
  assert.equal(row(result,'seller-a').distinctOrders,2);
  assert.equal(row(result,'seller-b').distinctOrders,2);
  assert.equal(row(result,'seller-a').multiSellerOrders,1);
  assert.equal(row(result,'seller-b').multiSellerOrders,1);
  assert.equal(row(result,'seller-a').singleSellerOrders,1);
  assert.equal(row(result,'seller-b').singleSellerOrders,1);
});
test('Seller amounts use matched items only; zero price does not create invalid ratios',()=>{
 const result=sellerPerformance(cohort,index.items);
 assert.equal(row(result,'seller-a').matchedItemValueBRL,100);
 assert.equal(row(result,'seller-a').matchedFreightChargeBRL,10);
 assert.equal(row(result,'seller-a').freightToItemValueRatio,.1);
 assert.equal(row(result,'seller-a').missingFreightItems,1);
 assert.equal(row(result,'seller-b').matchedItemValueBRL,300);
 assert.equal(row(result,'seller-b').matchedFreightChargeBRL,35);
});
test('Order-level punctuality is not attributed causally, and late outcomes use only eligible orders',()=>{
 const result=sellerPerformance(cohort,index.items);
 assert.equal(row(result,'seller-a').onTimeNumerator,2);
 assert.equal(row(result,'seller-a').onTimeDenominator,2);
 assert.equal(row(result,'seller-b').onTimeNumerator,1);
 assert.equal(row(result,'seller-b').onTimeDenominator,2);
 assert.equal(row(result,'seller-b').onTimeRate,.5);
});
test('Seller-specific handoff durations use qualifying single-seller orders only',()=>{
 const result=sellerPerformance(cohort,index.items);
 assert.equal(result.handoffFieldsExported,true);
 assert.equal(row(result,'seller-a').handoffEligibleOrders,1);
 assert.equal(row(result,'seller-b').handoffEligibleOrders,1);
 assert.equal(row(result,'seller-a').medianHandoffDays,2);
 assert.equal(row(result,'seller-b').medianHandoffDays,2);
});
test('Item filters retain same-item semantics while multi-seller status uses full unfiltered item index',()=>{
 const filters={...DEFAULT_FILTERS,sellerStates:['SP'],categories:['books']};
 const filtered=selectCohort(index,filters);
 const result=sellerPerformance(filtered,index.items);
 assert.equal(result.totalSellers,1);
 assert.equal(row(result,'seller-a').distinctOrders,2);
 assert.equal(row(result,'seller-a').multiSellerOrders,1);
 assert.equal(result.matchedItems,2);
 assert.equal(row(result,'seller-a').topCategories[0].category,'books');
});
test('Legacy data cannot fabricate seller handoff timing',()=>{
 const legacy=orderData.map(({approvedTimestamp,carrierHandoffTimestamp,...rest})=>rest);
 const i=buildDataIndex(legacy,itemData);
 const result=sellerPerformance(selectCohort(i,DEFAULT_FILTERS),i.items);
 assert.equal(result.handoffFieldsExported,false);
 assert.equal(result.rows.every(r=>r.handoffEligibleOrders===0 && r.medianHandoffDays===null),true);
});
test('Invalid and inverted handoff timestamps never produce negative durations',()=>{
 const invalid=orderData.map(o=>o.orderId==='solo-a'?{...o,carrierHandoffTimestamp:'2017-12-30T00:00:00'}:o.orderId==='solo-b'?{...o,approvedTimestamp:'2018-02-30T13:00:00'}:o);
 const i=buildDataIndex(invalid,itemData);
 const result=sellerPerformance(selectCohort(i,DEFAULT_FILTERS),i.items);
 assert.equal(row(result,'seller-a').handoffEligibleOrders,0);
 assert.equal(row(result,'seller-b').handoffEligibleOrders,0);
});
test('Zero-item orders and absent seller IDs do not create spurious seller rows or invented financial amounts',()=>{
 const changed=[...itemData,makeItem('solo-a',2,'',{priceBRL:null,freightChargeBRL:null})];
 const i=buildDataIndex(orderData,changed);
 const result=sellerPerformance(selectCohort(i,DEFAULT_FILTERS),i.items);
 assert.equal(result.totalSellers,2);
 assert.equal(result.itemsWithoutSeller,1);
 const missing=buildDataIndex([makeOrder('only')],[makeItem('only',1,'seller-c',{priceBRL:0,freightChargeBRL:null})]);
 const r=sellerPerformance(selectCohort(missing,DEFAULT_FILTERS),missing.items).rows[0];
 assert.equal(r.freightToItemValueRatio,null);
 assert.equal(r.matchedFreightChargeBRL,null);
});
test('Seller ranking, category/destination breakdown and empty cohorts are deterministic',()=>{
 const result=sellerPerformance(cohort,index.items);
 assert.deepEqual(result.rows.map(r=>r.sellerId),['seller-a','seller-b']);
 assert.equal(row(result,'seller-b').topCategories[0].category,'beauty');
 assert.equal(row(result,'seller-b').topDestinationStates[0].state,'MG');
 const empty=sellerPerformance({eligibleOrders:[],eligibleItems:[],eligibleOrderIds:new Set()},index.items);
 assert.equal(empty.rows.length,0);
 assert.equal(empty.handoffFieldsExported,false);
});
