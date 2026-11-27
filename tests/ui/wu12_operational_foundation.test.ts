import {describe,it,expect} from 'vitest';
import {buildDataIndex} from '../../src/data/indexes';
import {selectCohort,selectFocusedFlowCohort} from '../../src/domain/selectors';
import {shippingCorridorScorecard,fulfillmentLifecycle} from '../../src/domain/operationalPerformance';
import type {ItemFact,OrderFact,Filters} from '../../src/domain/types';
import {DEFAULT_FILTERS} from '../../src/domain/types';

const order=(orderId:string,delta=0,extra:Partial<OrderFact>={}):OrderFact=>({
  orderId,customerState:'MG',purchaseDate:'2018-01-01',purchaseTimestamp:'2018-01-01T00:00:00',
  estimatedDeliveryDate:'2018-01-11',deliveredDate:'2018-01-11',deliveredTimestamp:'2018-01-11T00:00:00',
  status:'delivered',deliveryDays:10,deliveryDayDelta:delta,
  deliveryClassification:delta>0?'late':delta<0?'early':'on_time',itemCount:1,...extra
});
const item=(id:string,ordinal:number,sellerState:string|null='SP',category='cat',price:number|null=100,freight:number|null=20):ItemFact=>({
  orderId:id,orderItemId:ordinal,sellerId:`seller-${ordinal}`,sellerState,customerState:'MG',category,priceBRL:price,freightChargeBRL:freight,
});
const make=(orders:OrderFact[],items:ItemFact[],filters:Filters=DEFAULT_FILTERS)=>
  selectCohort(buildDataIndex(orders,items),filters);

describe('operational expansion foundation',()=>{
  it('deduplicates orders within corridors without collapsing matched item money',()=>{
    const orders=[order('A',0,{itemCount:3})];
    const items=[item('A',1),item('A',2),item('A',3,'RJ')];
    const score=shippingCorridorScorecard(make(orders,items));
    expect(score.totalCorridors).toBe(2);
    expect(score.rows.find(r=>r.sellerState==='SP')).toMatchObject({distinctOrders:1,matchedItems:2,itemPriceBRL:200,freightChargeBRL:40,onTimeDenominator:1});
    expect(score.rows.find(r=>r.sellerState==='RJ')).toMatchObject({distinctOrders:1,matchedItems:1});
    expect(score.orderCountsCanOverlap).toBe(true);
  });
  it('honors AND seller/category matching on the exact item',()=>{
    const c=make([order('A',0,{itemCount:2}),order('B')],[item('A',1,'SP','cat'),item('A',2,'RJ','other'),item('B',1,'SP','other')],{
      ...DEFAULT_FILTERS,sellerStates:['SP'],categories:['other'],
    });
    expect(c.eligibleOrders).toHaveLength(1);
    expect(c.eligibleItems[0].orderId).toBe('B');
    expect(shippingCorridorScorecard(c).rows[0].distinctOrders).toBe(1);
  });
  it('preserves directed pairs, including intra-state, and accounts for unmappable items',()=>{
    const c=make([order('A',0,{customerState:'SP',itemCount:2})],
      [{...item('A',1,'SP'),customerState:'SP'},item('A',2,null)]);
    const result=shippingCorridorScorecard(c);
    expect(result.rows[0]).toMatchObject({sellerState:'SP',customerState:'SP'});
    expect(result.mappableItems).toBe(1);
    expect(result.unmappableItems).toBe(1);
  });
  it('excludes unknown delivery outcomes from denominators, not the order count',()=>{
    const c=make([order('A'),order('B',0,{status:'canceled',deliveryDays:null,deliveredTimestamp:null,deliveredDate:null,deliveryClassification:'unknown'})],[item('A',1),item('B',1)]);
    expect(shippingCorridorScorecard(c).rows[0]).toMatchObject({distinctOrders:2,onTimeDenominator:1,onTimeNumerator:1,deliveredDurationCount:1});
  });
  it('retains null when a corridor has no valid money and respects positive-denominator ratios',()=>{
    const c=make([order('A'),order('B')],[item('A',1,'SP','cat',null,10),item('B',1,'RJ','cat',0,5)]);
    const [r1,r2]=shippingCorridorScorecard(c,{sort:'freightRatio'}).rows;
    expect(r1.freightToPriceRatio).toBeNull();expect(r2.freightToPriceRatio).toBeNull();
    expect(r1.itemPriceBRL===null||r2.itemPriceBRL===null).toBe(true);
  });
  it('sorts deterministically, with nulls last even for ascending',()=>{
    const c=make([order('A'),order('B',1,{deliveryClassification:'late'})],[item('A',1,'SP'),item('B',1,'RJ')]);
    expect(shippingCorridorScorecard(c,{sort:'onTime',order:'asc'}).rows[0].sellerState).toBe('RJ');
    expect(shippingCorridorScorecard(c,{sort:'onTime',order:'desc'}).rows[0].sellerState).toBe('SP');
  });
  it('does not apply focused flows to an overview cohort unless explicitly requested',()=>{
    const index=buildDataIndex([order('A'),order('B')],[item('A',1,'SP'),item('B',1,'RJ')]);
    const context=selectCohort(index,DEFAULT_FILTERS);
    const detail=selectFocusedFlowCohort(context,[{sellerState:'SP',customerState:'MG'}]);
    expect(shippingCorridorScorecard(context).totalCorridors).toBe(2);
    expect(shippingCorridorScorecard(detail).totalCorridors).toBe(1);
  });
  it('handles legacy exports without inventing approval or carrier stages',()=>{
    const data=fulfillmentLifecycle(make([order('A')],[item('A',1)]));
    expect(data.stages[0]).toMatchObject({eligibleOrders:0,milestoneFieldsExported:false,medianDays:null});
    expect(data.stages[1].eligibleOrders).toBe(0);
    expect(data.stages[3]).toMatchObject({eligibleOrders:1,medianDays:10});
    expect(data.promiseEligibleOrders).toBe(1);
  });
  it('calculates stage-by-stage durations using source-naive arithmetic, not timezone conversions',()=>{
    const o={...order('A',1,{deliveryDayDelta:1}), approvedTimestamp:'2018-01-02T00:00:00',carrierHandoffTimestamp:'2018-01-05T00:00:00'};
    const life=fulfillmentLifecycle(make([o],[item('A',1)]));
    expect(life.stages.map(s=>s.medianDays)).toEqual([1,3,6,10]);
    expect(life.stages.every(s=>s.milestoneFieldsExported)).toBe(true);
    expect(life.medianDaysPastPromise).toBe(1);
  });
  it('rejects out-of-sequence and malformed stages without treating missing as zero',()=>{
    const o={...order('A'),approvedTimestamp:'2018-01-06T00:00:00',carrierHandoffTimestamp:'2018-01-04T00:00:00'};
    const life=fulfillmentLifecycle(make([o],[item('A',1)]));
    expect(life.stages[0].eligibleOrders).toBe(1);
    expect(life.stages[1]).toMatchObject({eligibleOrders:0,invalidSequenceOrders:1,medianDays:null});
    expect(life.stages[2].eligibleOrders).toBe(1);
  });
  it('does not lose zero-item orders from lifecycle even though they lack corridors',()=>{
    const c=make([order('A',0,{itemCount:0})],[]);
    expect(shippingCorridorScorecard(c).rows).toHaveLength(0);
    expect(fulfillmentLifecycle(c).cohortOrders).toBe(1);
  });
});
