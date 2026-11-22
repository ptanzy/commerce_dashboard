import {describe,expect,it} from 'vitest';
import {buildDataIndex} from '../src/data/indexes';
import {DEFAULT_FILTERS} from '../src/domain/types';
import {computeMetrics, matchingOrderAmounts, monthDateRange, monthlyTrendContext, originStateOrderCounts, quantileR7, selectCohort, topDirectedFlows} from '../src/domain/selectors';
import type {OrderFact, ItemFact} from '../src/domain/types';

function order(id: string, change: Partial<OrderFact> = {}): OrderFact { return {
  orderId: id, customerState:'MG',purchaseDate:'2018-03-01', purchaseTimestamp:'2018-03-01T00:00:00',
  estimatedDeliveryDate:'2018-03-04', deliveredDate:'2018-03-04', deliveredTimestamp:'2018-03-04T11:00:00',
  status:'delivered', deliveryDays:3.458333333, deliveryDayDelta:0, deliveryClassification:'on_time',itemCount:1,...change
}; }
function item(id: string,n:number,sellerState:string,category:string,priceBRL:number|null,freightChargeBRL:number|null,customerState='MG'):ItemFact{return{orderId:id,orderItemId:n,sellerId:'s',sellerState,customerState,category,priceBRL,freightChargeBRL};}
const fixture=()=>buildDataIndex([
  order('multi',{itemCount:2}),order('empty',{status:'canceled',itemCount:0,deliveryDays:null,deliveryClassification:'unknown'}),
  order('SP',{customerState:'SP'}),order('negative',{deliveryDays:null,deliveryClassification:'unknown'}),
  order('next',{purchaseDate:'2018-04-01',purchaseTimestamp:'2018-04-01T00:00:00'}),
], [item('multi',1,'SP','electronics',100,10),item('multi',2,'RJ','furniture',200,20),item('SP',1,'SP','electronics',0,0,'SP'),item('negative',1,'SP','electronics',null,null),item('next',1,'SP','electronics',10,1)]);

it('preserves item grain, distinct orders and zero-item order',()=>{
 const index=fixture();const all=selectCohort(index,DEFAULT_FILTERS);
 expect(all.eligibleOrders).toHaveLength(5);expect(all.eligibleItems).toHaveLength(5);
 expect(matchingOrderAmounts(all).get('empty')).toEqual({matchedItemCount:0,priceBRL:null,freightChargeBRL:null});
});
it('requires seller and category to match the same item',()=>{
 const group=selectCohort(fixture(),{...DEFAULT_FILTERS,sellerState:'SP',category:'furniture'});
 expect(group.eligibleOrders).toHaveLength(0);
 const selected=selectCohort(fixture(),{...DEFAULT_FILTERS,sellerState:'SP',category:'electronics'});
 expect(selected.eligibleOrders).toHaveLength(4);expect(selected.eligibleItems).toHaveLength(4);
});
it('uses matching items for freight and order detail amounts',()=>{
 const selected=selectCohort(fixture(),{...DEFAULT_FILTERS,category:'furniture'});
 const kpi=computeMetrics(selected);
 expect(kpi.distinctOrders).toBe(1);expect(kpi.itemPriceBRL).toBe(200);expect(kpi.freightChargeBRL).toBe(20);
 expect(matchingOrderAmounts(selected).get('multi')!.matchedItemCount).toBe(1);
});
it('excludes unknown duration from median/on-time, not from order count',()=>{
 const kpi=computeMetrics(selectCohort(fixture(),DEFAULT_FILTERS));
 expect(kpi.distinctOrders).toBe(5);expect(kpi.deliveredDurationCount).toBe(3);
 expect(kpi.onTimeRate).toBe(1);expect(kpi.invalidFreightItems).toBe(1);
});
it('retains same-state SP to SP link and does not merge origin/dest nodes',()=>{
 const flow=topDirectedFlows(selectCohort(fixture(),DEFAULT_FILTERS));
 const same=flow.links.find(l=>l.sellerState==='SP' && l.customerState==='SP');
 expect(same?.source).toBe('origin:SP');expect(same?.target).toBe('dest:SP');
 expect(originStateOrderCounts(selectCohort(fixture(),DEFAULT_FILTERS)).get('SP')).toBe(4);
});
it('returns null for undefined ratios and R-7 percentiles',()=>{
 const selected=selectCohort(fixture(),{...DEFAULT_FILTERS,customerState:'XX'});
 expect(computeMetrics(selected).freightToPriceRatio).toBeNull();
 expect(quantileR7([1,2,3,4],0.5)).toBe(2.5);expect(quantileR7([1,2,3,4],0.95)).toBeCloseTo(3.85);
});
it('trend month click never collapses entire history',()=>{
 const index=fixture();const date=monthDateRange('2018-03');
 const trend=monthlyTrendContext(index,{...DEFAULT_FILTERS,purchaseDateFrom:date.from,purchaseDateTo:date.to});
 expect(trend.map(m=>m.month)).toEqual(['2018-03','2018-04']);
 expect(trend.map(m=>m.selected)).toEqual([true,false]);
});
