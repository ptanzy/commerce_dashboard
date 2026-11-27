import type {Cohort} from './selectors';
import type {OrderFact} from './types';

/** Scores are retained only as aggregated 1..5 counts per distinct order.
 *  Review text, individual review IDs, and customer identity never enter this layer.
 */
export interface ReviewGroup {
  id: string;
  reviewedOrders: number;
  associatedOrders: number;
  /** Mean of per-order means: a multiply-reviewed order gets one vote. */
  meanOrderRating: number | null;
  onTimeEligibleReviewedOrders: number;
  onTimeRateAmongReviewed: number | null;
}
export type ReviewSegment = 'category'|'corridor'|'seller';
export interface CustomerExperienceSummary {
  eligibleOrders: number;
  reviewedOrders: number;
  reviewCount: number;
  coverageRate: number | null;
  /** Raw review-score histogram; these are REVIEWS, not distinct orders. */
  scoreCounts: readonly number[];
  meanReviewScore: number | null;
  meanOrderScore: number | null;
  byOutcome: readonly ReviewGroup[];
  byCategory: readonly ReviewGroup[];
  byCorridor: readonly ReviewGroup[];
  bySeller: readonly ReviewGroup[];
}
const reviewCount=(order:OrderFact):number=>order.reviewScoreCounts?.reduce((a,b)=>a+b,0) ?? 0;
const meanOrder=(order:OrderFact):number|null=>{
  const n=reviewCount(order);
  return n>0 ? order.reviewScoreCounts!.reduce((s,v,i)=>s+v*(i+1),0)/n : null;
};
const eligibleOnTime=(order:OrderFact)=>order.status==='delivered' && order.deliveryDays!==null &&
  Number.isFinite(order.deliveryDays) && order.deliveryDays>=0 &&
  ['early','on_time','late'].includes(order.deliveryClassification);

/** Olist outcomes are order-level; category/corridor/seller rows are associations.
 *  Multi-item or multi-seller orders contribute once PER SEGMENT, never per item.
 *  Cohort matching has already enforced same-item AND filtering.
 */
export function customerExperience(cohort:Cohort):CustomerExperienceSummary {
  const orders=new Map(cohort.eligibleOrders.map(o=>[o.orderId,o]));
  const scoreCounts=[0,0,0,0,0];
  let reviewedOrders=0,reviewCountTotal=0,totalRating=0,totalOrderMean=0;
  const orderMeans=new Map<string,number>();
  for(const order of cohort.eligibleOrders){
    const score=meanOrder(order);
    if(score===null)continue;
    const counts=order.reviewScoreCounts!;
    const n=reviewCount(order);
    for(let i=0;i<5;i++)scoreCounts[i]+=counts[i];
    reviewedOrders++;reviewCountTotal+=n;totalRating+=score*n;totalOrderMean+=score;
    orderMeans.set(order.orderId,score);
  }
  // No review observations: skip expensive category/corridor/seller indexes entirely.
  if(reviewedOrders===0) return {eligibleOrders:cohort.eligibleOrders.length,reviewedOrders:0,reviewCount:0,
    coverageRate:cohort.eligibleOrders.length?0:null,scoreCounts,meanReviewScore:null,meanOrderScore:null,
    byOutcome:[],byCategory:[],byCorridor:[],bySeller:[]};
  const makeGroups=(map:ReadonlyMap<string,ReadonlySet<string>>):ReviewGroup[]=>{
    const result:ReviewGroup[]=[];
    for(const [id,ids] of map){
      let n=0,sum=0,eligible=0,onTime=0;
      for(const orderId of ids){
        const rating=orderMeans.get(orderId),order=orders.get(orderId);
        if(rating===undefined || !order)continue;
        n++;sum+=rating;
        if(eligibleOnTime(order)){
          eligible++;
          if(order.deliveryClassification!=='late')onTime++;
        }
      }
      result.push({id,associatedOrders:ids.size,reviewedOrders:n,
        meanOrderRating:n?sum/n:null,
        onTimeEligibleReviewedOrders:eligible,onTimeRateAmongReviewed:eligible?onTime/eligible:null});
    }
    return result.sort((a,b)=>b.reviewedOrders-a.reviewedOrders||a.id.localeCompare(b.id));
  };
  const mapOf=(pairs:Iterable<[string,string]>):Map<string,Set<string>>=>{
    const map=new Map<string,Set<string>>();
    for(const [id,orderId] of pairs){
      if(!orders.has(orderId))continue;
      let set=map.get(id);if(!set){set=new Set();map.set(id,set);}set.add(orderId);
    }
    return map;
  };
  const byOutcome=makeGroups(mapOf(cohort.eligibleOrders.map(o=>[o.deliveryClassification,o.orderId])));
  const byCategory=makeGroups(mapOf(cohort.eligibleItems.map(i=>[i.category,i.orderId])));
  const byCorridor=makeGroups(mapOf(cohort.eligibleItems.filter(i=>i.sellerState&&i.customerState)
    .map(i=>[`${i.sellerState} → ${i.customerState}`,i.orderId])));
  const bySeller=makeGroups(mapOf(cohort.eligibleItems.filter(i=>i.sellerId).map(i=>[i.sellerId,i.orderId])));
  return {eligibleOrders:cohort.eligibleOrders.length,reviewedOrders,reviewCount:reviewCountTotal,
    coverageRate:cohort.eligibleOrders.length?reviewedOrders/cohort.eligibleOrders.length:null,
    scoreCounts,meanReviewScore:reviewCountTotal?totalRating/reviewCountTotal:null,
    meanOrderScore:reviewedOrders?totalOrderMean/reviewedOrders:null,
    byOutcome,byCategory,byCorridor,bySeller};
}
