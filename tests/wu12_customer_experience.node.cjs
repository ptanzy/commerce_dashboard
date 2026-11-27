'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {customerExperience}=require('../dist-test/domain/customerExperience');
const {buildDataIndex}=require('../dist-test/data/indexes');
const {validateDataset}=require('../dist-test/data/validate');
const {selectCohort,selectFocusedFlowCohort}=require('../dist-test/domain/selectors');
const {DEFAULT_FILTERS}=require('../dist-test/domain/types');
const order=(orderId,reviewScoreCounts,extras={})=>({orderId,customerState:'MG',purchaseDate:'2018-01-02',purchaseTimestamp:'2018-01-02T10:00:00',
  estimatedDeliveryDate:'2018-01-06',deliveredDate:'2018-01-05',deliveredTimestamp:'2018-01-05T10:00:00',status:'delivered',deliveryDays:3,deliveryDayDelta:-1,
  deliveryClassification:'early',itemCount:1,...(reviewScoreCounts?{reviewScoreCounts}:{}),...extras});
const item=(orderId,orderItemId,sellerState='SP',category='books',sellerId='seller1')=>({orderId,orderItemId,sellerState,customerState:'MG',category,sellerId,priceBRL:20,freightChargeBRL:5});
const orders=[order('multiple',[1,0,0,0,1],{itemCount:3}),order('late',[0,1,0,0,0],{deliveryClassification:'late',deliveryDayDelta:2}),
  order('unreviewed',null),order('zero',[0,0,1,0,0],{itemCount:0,status:'canceled',deliveryClassification:'unknown',deliveryDays:null,deliveredDate:null,deliveredTimestamp:null})];
const items=[item('multiple',1),item('multiple',2),item('multiple',3,'RJ','furniture','seller2'),item('late',1,'SP','books','seller1'),item('unreviewed',1,'RJ','books','seller2')];
const index=buildDataIndex(orders,items);
const data=customerExperience(selectCohort(index,DEFAULT_FILTERS));
const by=(arr,id)=>arr.find(r=>r.id===id);
const metadata=(orders,items)=>({schemaVersion:2,sourceName:'Olist Brazilian E-Commerce',processingVersion:'oe4-test',orderCount:orders.length,itemCount:items.length,
  reviewsAvailable:true,reviewCount:4,reviewedOrderCount:3});
test('OE-4 review histogram counts reviews, cohort counts distinct reviewed orders',()=>{
 assert.equal(data.eligibleOrders,4);
 assert.equal(data.reviewedOrders,3);
 assert.equal(data.reviewCount,4);
 assert.deepEqual(data.scoreCounts,[1,1,1,0,1]);
 assert.equal(data.meanReviewScore,2.75);
 assert.equal(data.meanOrderScore,8/3);
 assert.equal(data.coverageRate,.75);
});
test('OE-4 delivery outcome groups exclude unknown from on-time denominator but retain reviewed canceled order',()=>{
 assert.equal(by(data.byOutcome,'early').reviewedOrders,1);
 assert.equal(by(data.byOutcome,'early').meanOrderRating,3);
 assert.equal(by(data.byOutcome,'late').onTimeRateAmongReviewed,0);
 assert.equal(by(data.byOutcome,'unknown').reviewedOrders,1);
 assert.equal(by(data.byOutcome,'unknown').onTimeEligibleReviewedOrders,0);
});
test('OE-4 category and corridor segment counts dedupe multi-item orders',()=>{
 assert.equal(by(data.byCategory,'books').reviewedOrders,2);
 assert.equal(by(data.byCategory,'books').associatedOrders,3);
 assert.equal(by(data.byCorridor,'SP → MG').reviewedOrders,2);
 assert.equal(by(data.byCorridor,'RJ → MG').reviewedOrders,1);
 assert.equal(by(data.bySeller,'seller1').reviewedOrders,2);
 assert.equal(by(data.bySeller,'seller2').reviewedOrders,1);
});
test('OE-4 same-item AND filters and directed flow focus cannot resurrect unrelated item matches',()=>{
 const f={...DEFAULT_FILTERS,sellerStates:['RJ'],categories:['books']};
 const c=selectCohort(index,f);
 assert.equal(c.eligibleOrders.length,1);
 assert.equal(c.eligibleOrders[0].orderId,'unreviewed');
 assert.equal(customerExperience(c).reviewedOrders,0);
 const focused=selectFocusedFlowCohort(selectCohort(index,DEFAULT_FILTERS),[{sellerState:'RJ',customerState:'MG'}]);
 assert.equal(customerExperience(focused).reviewedOrders,1);
});
test('OE-4 empty cohorts and legacy orders do not invent scores',()=>{
 const empty=customerExperience({eligibleOrders:[],eligibleItems:[],eligibleOrderIds:new Set()});
 assert.equal(empty.meanReviewScore,null);assert.equal(empty.coverageRate,null);
 const legacy=orders.map(({reviewScoreCounts,...rest})=>rest);
 const result=customerExperience(selectCohort(buildDataIndex(legacy,items),DEFAULT_FILTERS));
 assert.equal(result.reviewCount,0);assert.equal(result.meanOrderScore,null);
});
test('OE-4 runtime validation rejects incorrect score shapes and mismatched counts',()=>{
 assert.doesNotThrow(()=>validateDataset(orders,items,metadata(orders,items)));
 assert.throws(()=>validateDataset([{...orders[0],reviewScoreCounts:[1,2,3]},...orders.slice(1)],items,metadata(orders,items)),/review score counts/);
 assert.throws(()=>validateDataset([{...orders[0],reviewScoreCounts:[1,0,0,-1,1]},...orders.slice(1)],items,metadata(orders,items)),/review score counts/);
 assert.throws(()=>validateDataset(orders,items,{...metadata(orders,items),reviewCount:99}),/review count mismatch/);
 assert.throws(()=>validateDataset(orders,items,{...metadata(orders,items),reviewsAvailable:false}),/review scores without review source/);
});
test('OE-4 reviewed zero-item orders remain in customer experience without inventing sellers or corridors',()=>{
 assert.equal(data.reviewedOrders,3);
 assert.equal(data.bySeller.reduce((sum,r)=>sum+r.reviewedOrders,0)>=2,true);
 assert.equal(data.byCategory.some(r=>r.id==='unknown'),false);
});
