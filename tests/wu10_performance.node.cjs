'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildDataIndex } = require('../dist-test/data/indexes.js');
const { DEFAULT_FILTERS } = require('../dist-test/domain/types.js');
const { selectCohort, computeMetrics, quantileR7 } = require('../dist-test/domain/selectors.js');

// Independent straightforward reference. Confirm optimizations preserve exact input ordering,
// empty-group behavior, AND-on-same-item conditions, and null-date exclusion.
function reference(index, filters) {
  const orders=index.orders.filter(o=>o.purchaseDate!==null &&
    (filters.purchaseDateFrom===null || o.purchaseDate>=filters.purchaseDateFrom) &&
    (filters.purchaseDateTo===null || o.purchaseDate<=filters.purchaseDateTo) &&
    (!filters.customerStates.length || (o.customerState!==null && filters.customerStates.includes(o.customerState))));
  const ids=new Set(orders.map(o=>o.orderId));
  const items=index.items.filter(i=>ids.has(i.orderId) &&
    (!filters.sellerStates.length || (i.sellerState!==null && filters.sellerStates.includes(i.sellerState))) &&
    (!filters.categories.length || filters.categories.includes(i.category)));
  const filtered=!!(filters.sellerStates.length || filters.categories.length);
  const eligibleIds=filtered?new Set(items.map(i=>i.orderId)):ids;
  return {eligibleOrders:filtered?orders.filter(o=>eligibleIds.has(o.orderId)):orders,
    eligibleItems:items,eligibleOrderIds:eligibleIds};
}
function random(seed) { let s=seed; return ()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/2**32); }
const r=random(20261125), states=[null,'SP','RJ','MG','BA'], categories=['home','pets','tech'];
const orders=[],items=[];
for(let i=0;i<750;i++) {
  const date=r()<0.08?null:`2018-0${1+Math.floor(r()*4)}-15`;
  const orderId=`o${i}`;
  orders.push({orderId,purchaseDate:date,customerState:states[Math.floor(r()*states.length)],
    status:'delivered',purchaseTimestamp:'2018-01-01T00:00:00', deliveredTimestamp:'2018-01-02T00:00:00',
    deliveryDays:r()*8,estimatedDeliveryDate:'2018-01-04',deliveredDate:'2018-01-02',deliveryClassification:'on_time'});
  const itemCount=Math.floor(r()*4);
  for(let j=0;j<itemCount;j++)items.push({orderId,orderItemId:j+1,sellerState:states[Math.floor(r()*states.length)],
    customerState:orders[i].customerState,category:categories[Math.floor(r()*categories.length)],priceBRL:r()*200,freightChargeBRL:r()*20});
}
const index=buildDataIndex(orders,items);
test('WU-10 optimized cohort matches independent reference across 200 combinations',()=>{
  for(let n=0;n<200;n++) {
    const choose=values=>values.filter(()=>r()<0.45);
    const f={...DEFAULT_FILTERS,
      purchaseDateFrom:r()<0.6?'2018-02-01':null,
      purchaseDateTo:r()<0.6?'2018-03-30':null,
      customerStates:choose(['SP','RJ','MG','BA']),sellerStates:choose(['SP','RJ','MG','BA']),categories:choose(categories)};
    const expected=reference(index,f),actual=selectCohort(index,f);
    assert.deepEqual(actual.eligibleOrders,expected.eligibleOrders);
    assert.deepEqual(actual.eligibleItems,expected.eligibleItems);
    assert.deepEqual([...actual.eligibleOrderIds], [...expected.eligibleOrderIds]);
    assert.deepEqual(computeMetrics(actual),computeMetrics(expected));
  }
});
test('WU-10 two-percentile metrics preserve R-7 for even and odd cohorts',()=>{
  for(let n=1;n<=100;n++) {
    const values=Array.from({length:n},()=>r()*100);
    const c={eligibleOrders:values.map((deliveryDays,i)=>({orderId:String(i),status:'delivered',purchaseTimestamp:'2018-01-01',deliveredTimestamp:'2018-01-03',deliveryDays,estimatedDeliveryDate:'2018-01-04',deliveredDate:'2018-01-03',deliveryClassification:'early'})),eligibleItems:[],eligibleOrderIds:new Set()};
    const m=computeMetrics(c);
    assert.equal(m.medianDeliveryDays,quantileR7(values,0.5));
    assert.equal(m.p95DeliveryDays,quantileR7(values,0.95));
  }
});
