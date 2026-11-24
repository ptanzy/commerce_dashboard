const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDataIndex } = require('../dist-test/data/indexes.js');
const { selectCohort } = require('../dist-test/domain/selectors.js');
const { selectExplorerOrders, selectOrderDetail } = require('../dist-test/domain/orderExplorer.js');

const makeOrder = (id, itemCount) => ({
  orderId:id,customerState:'MG',purchaseDate:'2018-03-01',purchaseTimestamp:'2018-03-01T10:00:00',
  estimatedDeliveryDate:'2018-03-10',deliveredDate:'2018-03-09',deliveredTimestamp:'2018-03-09T10:00:00',
  status:'delivered',deliveryDays:8,deliveryDayDelta:-1,deliveryClassification:'early',itemCount,
});
const items = [
  {orderId:'multi',orderItemId:1,sellerId:'s1',sellerState:'SP',customerState:'MG',category:'books',priceBRL:100,freightChargeBRL:10},
  {orderId:'multi',orderItemId:2,sellerId:'s2',sellerState:'RJ',customerState:'MG',category:'health_beauty',priceBRL:200,freightChargeBRL:40},
];
const index=buildDataIndex([makeOrder('multi',2),makeOrder('zero',0)],items);
const unfiltered={purchaseDateFrom:null,purchaseDateTo:null,customerStates:[],sellerStates:[],categories:[],focusedFlow:null};

test('WU-04 explorer preserves zero-item orders with unavailable money',()=>{
  const rows=selectExplorerOrders(selectCohort(index,unfiltered));
  assert.equal(rows.length,2);
  const zero=rows.find(o=>o.orderId==='zero');
  assert.equal(zero.matchingItemCount,0);
  assert.equal(zero.matchingPriceBRL,null);
  assert.equal(zero.matchingFreightBRL,null);
});
test('WU-04 item filters produce distinct one-row orders with only matching-item money',()=>{
  const filters={...unfiltered,sellerStates:['RJ'],categories:['health_beauty']};
  const cohort=selectCohort(index,filters);
  assert.deepEqual(selectExplorerOrders(cohort).map(o=>[o.orderId,o.matchingPriceBRL,o.matchingFreightBRL]),[['multi',200,40]]);
  const details=selectOrderDetail(index,cohort,filters,'multi');
  assert.equal(details.fullItems.length,2);
  assert.equal(details.fullTotals.priceBRL,300);
  assert.equal(details.fullTotals.freightChargeBRL,50);
  assert.equal(details.matchingTotals.priceBRL,200);
  assert.equal(details.matchingTotals.freightChargeBRL,40);
  assert.deepEqual([...details.matchingItemIds],[2]);
});
test('WU-04 returns no detail when order is excluded by current filters',()=>{
  const filters={...unfiltered,sellerStates:['SP'],categories:['health_beauty']};
  const cohort=selectCohort(index,filters);
  assert.equal(selectOrderDetail(index,cohort,filters,'multi'),null);
});
test('WU-04 known zero BRL is distinct from missing financial data',()=>{
  const zeroItem={...items[0],priceBRL:0,freightChargeBRL:0};
  const localIndex=buildDataIndex([makeOrder('multi',1)],[zeroItem]);
  const cohort=selectCohort(localIndex,unfiltered);
  assert.equal(selectExplorerOrders(cohort)[0].matchingPriceBRL,0);
  assert.equal(selectExplorerOrders(cohort)[0].matchingFreightBRL,0);
});
