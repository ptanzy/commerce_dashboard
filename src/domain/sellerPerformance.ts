/** Seller-associated order performance for a preselected global cohort.
 *
 * Olist logistics milestones and delivery outcomes are ORDER-level events. A
 * seller's presence on an order is an association, not proof that the seller
 * caused that order's outcome. In a multi-seller order the same outcome may
 * appear on several seller rows. Handoff duration is limited to single-seller
 * orders with both valid exported approval and handoff timestamps.
 */
import type { Cohort } from './selectors';
import { isDeliveredDurationEligible, isOnTimeEligible, quantileR7 } from './selectors';
import type { ItemFact, OrderFact } from './types';

export interface SellerPerformanceRow {
  sellerId: string;
  sellerState: string | null;
  distinctOrders: number;
  matchedItems: number;
  singleSellerOrders: number;
  multiSellerOrders: number;
  onTimeNumerator: number;
  onTimeDenominator: number;
  onTimeRate: number | null;
  deliveryDurationCount: number;
  medianDeliveryDays: number | null;
  p95DeliveryDays: number | null;
  /** Approval-to-carrier handoff, from orders containing only this seller. */
  handoffEligibleOrders: number;
  medianHandoffDays: number | null;
  p95HandoffDays: number | null;
  matchedItemValueBRL: number | null;
  matchedFreightChargeBRL: number | null;
  freightToItemValueRatio: number | null;
  missingPriceItems: number;
  missingFreightItems: number;
  topCategories: readonly {category:string;items:number}[];
  topDestinationStates: readonly {state:string;orders:number}[];
}
export interface SellerPerformanceResult {
  rows: readonly SellerPerformanceRow[];
  totalSellers: number;
  matchedItems: number;
  itemsWithoutSeller: number;
  /** Order-level performance can appear in more than one seller row. */
  orderCountsMayOverlap: true;
  /** True only when this export contains both milestone columns on an order. */
  handoffFieldsExported: boolean;
}

type Acc = {
  id: string;
  state: string | null;
  ids: Set<string>;
  count: number;
  value: number; valueCount: number; missingPrice: number;
  freight: number; freightCount: number; missingFreight: number;
  categories: Map<string,number>;
};
const DAY = 86_400_000;
const validMoney=(n:number|null):n is number => n!==null && Number.isFinite(n) && n>=0;
const timestampMillis=(input:string|null|undefined):number|null=>{
  if(typeof input!=='string')return null;
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(input);
  if(!match)return null;
  const [year,month,day,hour,minute,second]=match.slice(1).map(Number);
  const millis=Date.UTC(year,month-1,day,hour,minute,second);
  if(!Number.isFinite(millis))return null;
  const check=new Date(millis);
  return check.getUTCFullYear()===year && check.getUTCMonth()===month-1 && check.getUTCDate()===day &&
    check.getUTCHours()===hour && check.getUTCMinutes()===minute && check.getUTCSeconds()===second ? millis : null;
};

/** All-index items are necessary to classify multi-seller orders even when item filters hide other sellers. */
export function sellerPerformance(cohort:Cohort, allItems:readonly ItemFact[]): SellerPerformanceResult {
  const orderById=new Map(cohort.eligibleOrders.map(o=>[o.orderId,o]));
  const allSellerIdsByOrder=new Map<string,Set<string>>();
  for(const item of allItems){
    if(!item.sellerId)continue;
    let ids=allSellerIdsByOrder.get(item.orderId);
    if(!ids){ids=new Set();allSellerIdsByOrder.set(item.orderId,ids);}
    ids.add(item.sellerId);
  }
  const acc=new Map<string,Acc>();
  let matchedItems=0,itemsWithoutSeller=0;
  for(const item of cohort.eligibleItems){
    if(!orderById.has(item.orderId))continue;
    if(!item.sellerId){itemsWithoutSeller++;continue;}
    matchedItems++;
    let entry=acc.get(item.sellerId);
    if(!entry){
      entry={id:item.sellerId,state:item.sellerState,ids:new Set(),count:0,
        value:0,valueCount:0,missingPrice:0,freight:0,freightCount:0,missingFreight:0,
        categories:new Map()};
      acc.set(item.sellerId,entry);
    }
    if(entry.state!==item.sellerState)entry.state=null;
    entry.ids.add(item.orderId);
    entry.count++;
    if(validMoney(item.priceBRL)){entry.value+=item.priceBRL;entry.valueCount++;}
    else entry.missingPrice++;
    if(validMoney(item.freightChargeBRL)){entry.freight+=item.freightChargeBRL;entry.freightCount++;}
    else entry.missingFreight++;
    entry.categories.set(item.category,(entry.categories.get(item.category)??0)+1);
  }
  const handoffFieldsExported=cohort.eligibleOrders.some(o=>
    Object.prototype.hasOwnProperty.call(o,'approvedTimestamp') &&
    Object.prototype.hasOwnProperty.call(o,'carrierHandoffTimestamp'));
  const rows:SellerPerformanceRow[]=[];
  for(const entry of acc.values()){
    const durations:number[]=[],handoffs:number[]=[];
    let singleSellerOrders=0,multiSellerOrders=0,onTimeDenominator=0,onTimeNumerator=0;
    const destinations=new Map<string,number>();
    for(const id of entry.ids){
      const order=orderById.get(id)!;
      const sellerCount=allSellerIdsByOrder.get(id)?.size ?? 0;
      if(sellerCount===1)singleSellerOrders++;
      else multiSellerOrders++;
      if(order.customerState)destinations.set(order.customerState,(destinations.get(order.customerState)??0)+1);
      if(isDeliveredDurationEligible(order))durations.push(order.deliveryDays!);
      if(isOnTimeEligible(order)){
        onTimeDenominator++;
        if(order.deliveryClassification!=='late')onTimeNumerator++;
      }
      if(sellerCount===1){
        const approved=timestampMillis(order.approvedTimestamp);
        const handoff=timestampMillis(order.carrierHandoffTimestamp);
        if(approved!==null && handoff!==null && handoff>=approved)handoffs.push((handoff-approved)/DAY);
      }
    }
    const value=entry.valueCount?entry.value:null;
    const freight=entry.freightCount?entry.freight:null;
    rows.push({sellerId:entry.id,sellerState:entry.state,distinctOrders:entry.ids.size,matchedItems:entry.count,
      singleSellerOrders,multiSellerOrders,onTimeNumerator,onTimeDenominator,
      onTimeRate:onTimeDenominator?onTimeNumerator/onTimeDenominator:null,
      deliveryDurationCount:durations.length,medianDeliveryDays:quantileR7(durations,.5),
      p95DeliveryDays:quantileR7(durations,.95),handoffEligibleOrders:handoffs.length,
      medianHandoffDays:quantileR7(handoffs,.5),p95HandoffDays:quantileR7(handoffs,.95),
      matchedItemValueBRL:value,matchedFreightChargeBRL:freight,
      freightToItemValueRatio:value!==null && value>0 && freight!==null?freight/value:null,
      missingPriceItems:entry.missingPrice,missingFreightItems:entry.missingFreight,
      topCategories:[...entry.categories].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,5)
        .map(([category,items])=>({category,items})),
      topDestinationStates:[...destinations].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,5)
        .map(([state,orders])=>({state,orders})),
    });
  }
  rows.sort((a,b)=>b.distinctOrders-a.distinctOrders || a.sellerId.localeCompare(b.sellerId));
  return {rows,totalSellers:rows.length,matchedItems,itemsWithoutSeller,orderCountsMayOverlap:true,handoffFieldsExported};
}
