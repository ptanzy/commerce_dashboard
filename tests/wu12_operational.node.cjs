'use strict';
/** Standalone Node regression tests for the new operational domain selectors.
 * Run after `npx tsc -p tsconfig.node-tests.json` (or `npm run test:node`).
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildDataIndex}=require('../dist-test/data/indexes.js');
const {selectCohort}=require('../dist-test/domain/selectors.js');
const {shippingCorridorScorecard,fulfillmentLifecycle}=require('../dist-test/domain/operationalPerformance.js');
const {DEFAULT_FILTERS}=require('../dist-test/domain/types.js');

const order=(id,options={})=>({
  orderId:id,customerState:'MG',purchaseDate:'2018-01-01',purchaseTimestamp:'2018-01-01T00:00:00',
  estimatedDeliveryDate:'2018-01-11',deliveredDate:'2018-01-11',deliveredTimestamp:'2018-01-11T00:00:00',
  status:'delivered',deliveryDays:10,deliveryDayDelta:0,deliveryClassification:'on_time',itemCount:1,...options,
});
const item=(id,ordinal,seller='SP',price=100,freight=20,category='x')=>({
  orderId:id,orderItemId:ordinal,sellerId:`seller${ordinal}`,sellerState:seller,customerState:'MG',category,
  priceBRL:price,freightChargeBRL:freight,
});
const cohort=(orders,items,filters=DEFAULT_FILTERS)=>selectCohort(buildDataIndex(orders,items),filters);

test('multi-item and multi-origin orders have distinct corridor counts and matched financial values',()=>{
  const result=shippingCorridorScorecard(cohort([order('A',{itemCount:3})],[item('A',1),item('A',2),item('A',3,'RJ')]));
  assert.equal(result.totalCorridors,2);
  const sp=result.rows.find(r=>r.sellerState==='SP');
  assert.equal(sp.distinctOrders,1);assert.equal(sp.matchedItems,2);assert.equal(sp.itemPriceBRL,200);
});
test('strict same-item AND matching cannot include unrelated seller/category combinations',()=>{
  const c=cohort([order('A',{itemCount:2}),order('B')],
    [item('A',1,'SP',100,20,'x'),item('A',2,'RJ',100,20,'y'),item('B',1,'SP',100,20,'y')],
    {...DEFAULT_FILTERS,sellerStates:['SP'],categories:['y']});
  assert.equal(c.eligibleOrders.length,1);assert.equal(c.eligibleOrders[0].orderId,'B');
});
test('non-delivered orders are counted without fabricating on-time eligibility',()=>{
  const c=cohort([order('A'),order('B',{status:'canceled',deliveryDays:null,deliveredDate:null,deliveredTimestamp:null,deliveryClassification:'unknown'})],
    [item('A',1),item('B',1)]);
  const row=shippingCorridorScorecard(c).rows[0];
  assert.equal(row.distinctOrders,2);assert.equal(row.onTimeDenominator,1);
});
test('financial nulls and zero-price sums do not turn into a freight ratio',()=>{
  const result=shippingCorridorScorecard(cohort([order('A')],[item('A',1,'SP',0,25)]));
  assert.equal(result.rows[0].freightToPriceRatio,null);
});
test('legacy exports transparently mark non-exported stages',()=>{
  const summary=fulfillmentLifecycle(cohort([order('A')],[item('A',1)]));
  assert.equal(summary.stages[0].milestoneFieldsExported,false);
  assert.equal(summary.stages[0].medianDays,null);
  assert.equal(summary.stages[3].medianDays,10);
});
test('new timestamps create nonnegative stage summaries without a timezone conversion',()=>{
  const o=order('A',{approvedTimestamp:'2018-01-02T00:00:00',carrierHandoffTimestamp:'2018-01-05T00:00:00'});
  assert.deepEqual(fulfillmentLifecycle(cohort([o],[item('A',1)])).stages.map(s=>s.medianDays),[1,3,6,10]);
});
test('inverted handoff timestamps are excluded, not converted to negative durations',()=>{
  const o=order('A',{approvedTimestamp:'2018-01-06T00:00:00',carrierHandoffTimestamp:'2018-01-05T00:00:00'});
  assert.equal(fulfillmentLifecycle(cohort([o],[item('A',1)])).stages[1].invalidSequenceOrders,1);
});
test('zero-item orders remain in lifecycle while shipping corridors have zero links',()=>{
  const c=cohort([order('A',{itemCount:0})],[]);
  assert.equal(shippingCorridorScorecard(c).totalCorridors,0);
  assert.equal(fulfillmentLifecycle(c).cohortOrders,1);
});
