import type { DataIndex } from '../data/indexes';
import type { Filters, OrderFact } from './types';
import type { Cohort, Metrics } from './selectors';
import { computeMetrics, isOnTimeEligible, selectCohort, selectFocusedFlowCohort } from './selectors';

export type CategoryMeasure = 'orders' | 'value' | 'freight' | 'onTime';
export interface CategoryRank {
  category: string;
  distinctOrders: number;
  itemCount: number;
  itemValueBRL: number | null;
  freightBRL: number | null;
  onTimeNumerator: number;
  onTimeDenominator: number;
  onTimeRate: number | null;
}

/** Group matching item contributions only; one order per category, even with duplicate items. */
export function categoryLeaderboard(cohort: Cohort, measure: CategoryMeasure = 'orders', limit = 12): CategoryRank[] {
  const orderById = new Map(cohort.eligibleOrders.map(order=>[order.orderId,order]));
  const rows = new Map<string,{ids:Set<string>; items:number;price:number;freight:number;validPrice:number;validFreight:number}>();
  for(const item of cohort.eligibleItems){
    if(!orderById.has(item.orderId)) continue;
    let v=rows.get(item.category);
    if(!v){v={ids:new Set(),items:0,price:0,freight:0,validPrice:0,validFreight:0};rows.set(item.category,v);}
    v.ids.add(item.orderId);v.items++;
    if(item.priceBRL!==null && Number.isFinite(item.priceBRL) && item.priceBRL>=0){v.price+=item.priceBRL;v.validPrice++;}
    if(item.freightChargeBRL!==null && Number.isFinite(item.freightChargeBRL) && item.freightChargeBRL>=0){v.freight+=item.freightChargeBRL;v.validFreight++;}
  }
  const result:CategoryRank[]=[];
  for(const [category,v] of rows){
    let onTimeNumerator=0,onTimeDenominator=0;
    for(const id of v.ids){
      const order=orderById.get(id)!;
      if(isOnTimeEligible(order)){
        onTimeDenominator++;
        if(order.deliveryClassification!=='late')onTimeNumerator++;
      }
    }
    result.push({category,distinctOrders:v.ids.size,itemCount:v.items,
      itemValueBRL:v.validPrice?v.price:null,freightBRL:v.validFreight?v.freight:null,
      onTimeNumerator,onTimeDenominator,onTimeRate:onTimeDenominator?onTimeNumerator/onTimeDenominator:null});
  }
  const weight=(v:CategoryRank):number|null=>{
    if(measure==='orders')return v.distinctOrders;
    if(measure==='value')return v.itemValueBRL;
    if(measure==='freight')return v.freightBRL;
    return v.onTimeDenominator>=30?v.onTimeRate:null;
  };
  return result.sort((a,b)=>{
    const wa=weight(a),wb=weight(b);
    if(wa===null || wb===null)return wa===wb?a.category.localeCompare(b.category):wa===null?1:-1;
    return wb-wa || b.distinctOrders-a.distinctOrders || a.category.localeCompare(b.category);
  }).slice(0,Math.max(0,limit));
}

export interface DelayBucket { id:string; label:string; count:number; share:number; kind:'early'|'on-time'|'late' }
export interface DelayDistribution { buckets:DelayBucket[]; observed:number; withoutDelta:number; totalOrders:number }
const BINS:ReadonlyArray<{id:string;label:string;min:number;max:number;kind:DelayBucket['kind']}>= [
  {id:'early10',label:'≥10 days early',min:-Infinity,max:-10,kind:'early'},
  {id:'early5',label:'5–9 days early',min:-9,max:-5,kind:'early'},
  {id:'early1',label:'1–4 days early',min:-4,max:-1,kind:'early'},
  {id:'on-time',label:'On promised date',min:0,max:0,kind:'on-time'},
  {id:'late3',label:'1–3 days late',min:1,max:3,kind:'late'},
  {id:'late7',label:'4–7 days late',min:4,max:7,kind:'late'},
  {id:'late14',label:'8–14 days late',min:8,max:14,kind:'late'},
  {id:'late15',label:'≥15 days late',min:15,max:Infinity,kind:'late'},
];
/** Calendar-day delta, not fractional delivery duration. Unknown/invalid excluded. */
export function delayDistribution(cohort:Cohort): DelayDistribution {
  const counts=new Map(BINS.map(bin=>[bin.id,0]));
  let observed=0,withoutDelta=0;
  for(const order of cohort.eligibleOrders){
    if(!isOnTimeEligible(order) || order.deliveryDayDelta===null || !Number.isInteger(order.deliveryDayDelta)) {withoutDelta++;continue;}
    const bin=BINS.find(bin=>order.deliveryDayDelta!>=bin.min && order.deliveryDayDelta!<=bin.max);
    if(!bin){withoutDelta++;continue;}
    counts.set(bin.id,counts.get(bin.id)!+1);observed++;
  }
  return {buckets:BINS.map(bin=>({id:bin.id,label:bin.label,count:counts.get(bin.id)!,share:observed?counts.get(bin.id)!/observed:0,kind:bin.kind})),
    observed,withoutDelta,totalOrders:cohort.eligibleOrders.length};
}

export interface PeriodComparison {
  from:string;to:string;days:number;previousFrom:string;previousTo:string;
  previousMetrics:Metrics;
}
function utcDay(s:string):number|null {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
  const [y,m,d]=s.split('-').map(Number);
  const value=Date.UTC(y,m-1,d),date=new Date(value);
  return date.getUTCFullYear()===y && date.getUTCMonth()===m-1 && date.getUTCDate()===d ? value : null;
}
const DAY=86400000;
function formatDay(value:number):string{return new Date(value).toISOString().slice(0,10);}
/** Returns null unless a complete, equal-length prior period exists inside available history. */
export function previousPeriod(index:DataIndex,filters:Filters):PeriodComparison|null {
  if(!filters.purchaseDateFrom || !filters.purchaseDateTo || !index.fullHistoryMin)return null;
  const from=utcDay(filters.purchaseDateFrom),to=utcDay(filters.purchaseDateTo),min=utcDay(index.fullHistoryMin);
  if(from===null || to===null || min===null || from>to)return null;
  const days=Math.round((to-from)/DAY)+1;
  const previousTo=from-DAY,previousFrom=from-days*DAY;
  if(previousFrom<min)return null;
  const fromDay=formatDay(previousFrom),toDay=formatDay(previousTo);
  const past=selectFocusedFlowCohort(selectCohort(index,{...filters,purchaseDateFrom:fromDay,purchaseDateTo:toDay}),filters.focusedFlows);
  return {from:filters.purchaseDateFrom,to:filters.purchaseDateTo,days,previousFrom:fromDay,previousTo:toDay,
    previousMetrics:computeMetrics(past)};
}

/** For comparison labels: positive means improvement only where lower is better. */
export function metricDelta(current:number|null,previous:number|null):number|null {
  return current===null||previous===null?null:current-previous;
}
