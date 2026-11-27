/** Operational expansion foundation: shipping-corridor and fulfillment-stage summaries.
 *
 * Pure selectors operating on a WU-05 cohort. They preserve WU-11 filter semantics:
 * seller + category must match the same item; stage metrics count each order once;
 * a multi-seller order can legitimately belong to more than one directed corridor.
 */
import type { Cohort } from './selectors';
import { isDeliveredDurationEligible, isOnTimeEligible, quantileR7 } from './selectors';
import type { OrderFact } from './types';

export interface ShippingCorridorRow {
  sellerState: string;
  customerState: string;
  distinctOrders: number;
  matchedItems: number;
  deliveredDurationCount: number;
  onTimeNumerator: number;
  onTimeDenominator: number;
  onTimeRate: number | null;
  medianDeliveryDays: number | null;
  p95DeliveryDays: number | null;
  /** Totals use valid, matched item amounts only, not whole-order values. */
  itemPriceBRL: number | null;
  freightChargeBRL: number | null;
  freightToPriceRatio: number | null;
  missingPriceItems: number;
  missingFreightItems: number;
}

export interface ShippingCorridorResult {
  rows: readonly ShippingCorridorRow[];
  totalCorridors: number;
  mappableItems: number;
  unmappableItems: number;
  /** Rows may overlap in order count when an order spans multiple seller states. */
  orderCountsCanOverlap: true;
}

export type CorridorSort = 'orders' | 'items' | 'onTime' | 'median' | 'p95' | 'freightRatio';
export interface CorridorOptions {
  sort?: CorridorSort;
  order?: 'asc' | 'desc';
  limit?: number;
  /** Minimum distinct orders for display; no unsupported values are imputed. */
  minOrders?: number;
}

interface CorridorAccumulator {
  sellerState: string;
  customerState: string;
  ids: Set<string>;
  matchedItems: number;
  itemPriceBRL: number;
  priceCount: number;
  freightChargeBRL: number;
  freightCount: number;
  missingPriceItems: number;
  missingFreightItems: number;
}

const validMoney = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value >= 0;

/** All mappable directed pairs, not Sankey top-15. Returns no source rows/identifiers. */
export function shippingCorridorScorecard(cohort: Cohort, options: CorridorOptions = {}): ShippingCorridorResult {
  const eligibleOrderIds = new Set(cohort.eligibleOrders.map(order => order.orderId));
  const orderById = new Map(cohort.eligibleOrders.map(order => [order.orderId, order]));
  const byPair = new Map<string, CorridorAccumulator>();
  let mappableItems = 0;
  let unmappableItems = 0;

  for (const item of cohort.eligibleItems) {
    if (!eligibleOrderIds.has(item.orderId) || !item.sellerState || !item.customerState) {
      unmappableItems++;
      continue;
    }
    mappableItems++;
    const key = `${item.sellerState}\u0000${item.customerState}`;
    let entry = byPair.get(key);
    if (!entry) {
      entry = { sellerState: item.sellerState, customerState: item.customerState,
        ids: new Set<string>(), matchedItems: 0,
        itemPriceBRL: 0, priceCount: 0, freightChargeBRL: 0, freightCount: 0,
        missingPriceItems: 0, missingFreightItems: 0 };
      byPair.set(key, entry);
    }
    entry.ids.add(item.orderId);
    entry.matchedItems++;
    if (validMoney(item.priceBRL)) { entry.itemPriceBRL += item.priceBRL; entry.priceCount++; }
    else entry.missingPriceItems++;
    if (validMoney(item.freightChargeBRL)) { entry.freightChargeBRL += item.freightChargeBRL; entry.freightCount++; }
    else entry.missingFreightItems++;
  }

  const rows: ShippingCorridorRow[] = [];
  for (const entry of byPair.values()) {
    let onTimeNumerator = 0;
    let onTimeDenominator = 0;
    const durations: number[] = [];
    for (const id of entry.ids) {
      const order = orderById.get(id)!;
      if (isDeliveredDurationEligible(order)) durations.push(order.deliveryDays!);
      if (isOnTimeEligible(order)) {
        onTimeDenominator++;
        if (order.deliveryClassification !== 'late') onTimeNumerator++;
      }
    }
    const itemPriceBRL = entry.priceCount ? entry.itemPriceBRL : null;
    const freightChargeBRL = entry.freightCount ? entry.freightChargeBRL : null;
    rows.push({ sellerState: entry.sellerState, customerState: entry.customerState,
      distinctOrders: entry.ids.size, matchedItems: entry.matchedItems,
      deliveredDurationCount: durations.length,
      onTimeNumerator, onTimeDenominator,
      onTimeRate: onTimeDenominator ? onTimeNumerator / onTimeDenominator : null,
      medianDeliveryDays: quantileR7(durations, 0.5), p95DeliveryDays: quantileR7(durations, 0.95),
      itemPriceBRL, freightChargeBRL,
      freightToPriceRatio: itemPriceBRL !== null && itemPriceBRL > 0 && freightChargeBRL !== null
        ? freightChargeBRL / itemPriceBRL : null,
      missingPriceItems: entry.missingPriceItems, missingFreightItems: entry.missingFreightItems,
    });
  }
  const sort = options.sort ?? 'orders';
  const key = ({
    orders:'distinctOrders', items:'matchedItems', onTime:'onTimeRate',
    median:'medianDeliveryDays', p95:'p95DeliveryDays', freightRatio:'freightToPriceRatio',
  } as const)[sort];
  const descending = (options.order ?? 'desc') === 'desc';
  const minOrders = Number.isSafeInteger(options.minOrders) && (options.minOrders ?? 0) > 0
    ? options.minOrders! : 1;
  const filteredRows = rows.filter(row => row.distinctOrders >= minOrders).sort((a,b) => {
    const av = a[key] as number | null;
    const bv = b[key] as number | null;
    // Always put missing values last, regardless of sort direction.
    if (av === null) return bv === null ? 0 : 1;
    if (bv === null) return -1;
    if (av !== bv) return descending ? bv-av : av-bv;
    return a.sellerState.localeCompare(b.sellerState) || a.customerState.localeCompare(b.customerState);
  });
  const limit = Number.isSafeInteger(options.limit) && (options.limit ?? -1) >= 0
    ? options.limit! : filteredRows.length;
  return {rows: filteredRows.slice(0, limit), totalCorridors: byPair.size,
    mappableItems, unmappableItems, orderCountsCanOverlap: true};
}

/** New Olist milestone columns are optional to preserve existing WU-11 exports. */
export type LifecycleOrder = OrderFact & {
  approvedTimestamp?: string | null;
  carrierHandoffTimestamp?: string | null;
};
export type LifecycleStageId = 'purchaseToApproval' | 'approvalToCarrier' |
  'carrierToDelivery' | 'purchaseToDelivery';
export interface LifecycleStageSummary {
  id: LifecycleStageId;
  label: string;
  /** Number of cohort orders satisfying the date/stage eligibility checks. */
  eligibleOrders: number;
  /** Orders where both timestamps existed but were malformed or out of order. */
  invalidSequenceOrders: number;
  medianDays: number | null;
  p95Days: number | null;
  /** False means an older export does not contain this source milestone field. */
  milestoneFieldsExported: boolean;
}
export interface LifecycleSummary {
  cohortOrders: number;
  stages: readonly LifecycleStageSummary[];
  promiseEligibleOrders: number;
  /** Actual delivery calendar date minus promised calendar date: positive is late. */
  medianDaysPastPromise: number | null;
  p95DaysPastPromise: number | null;
}

const MILLIS_PER_DAY = 86400000;
/** Parse source-naive timestamps as arithmetic calendar instants, without asserting a timezone. */
function sourceNaiveMillis(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [y,mon,d,h,min,s] = m.slice(1).map(Number);
  const ms = Date.UTC(y, mon-1, d, h, min, s);
  if (!Number.isFinite(ms)) return null;
  const check = new Date(ms);
  if (check.getUTCFullYear()!==y || check.getUTCMonth()!==mon-1 || check.getUTCDate()!==d ||
      check.getUTCHours()!==h || check.getUTCMinutes()!==min || check.getUTCSeconds()!==s) return null;
  return ms;
}

/** Only eligible, nonnegative stage durations; missing milestone != zero duration. */
export function fulfillmentLifecycle(cohort: Cohort): LifecycleSummary {
  const ids: LifecycleStageId[] = ['purchaseToApproval','approvalToCarrier','carrierToDelivery','purchaseToDelivery'];
  const labels = ['Purchase → approval','Approval → carrier handoff',
    'Carrier handoff → customer','Purchase → customer'];
  const stages = ids.map((id,index) => ({id,label:labels[index],values:[] as number[],
    invalidSequenceOrders:0, milestoneFieldsExported: id==='purchaseToDelivery'}));
  const promiseDeltas:number[]=[];
  for (const order of cohort.eligibleOrders as readonly LifecycleOrder[]) {
    const exportedApproval=Object.prototype.hasOwnProperty.call(order,'approvedTimestamp');
    const exportedCarrier=Object.prototype.hasOwnProperty.call(order,'carrierHandoffTimestamp');
    if (exportedApproval) stages[0].milestoneFieldsExported=true;
    if (exportedApproval && exportedCarrier) stages[1].milestoneFieldsExported=true;
    if (exportedCarrier) stages[2].milestoneFieldsExported=true;
    const purchase=sourceNaiveMillis(order.purchaseTimestamp);
    const approved=sourceNaiveMillis(order.approvedTimestamp);
    const handoff=sourceNaiveMillis(order.carrierHandoffTimestamp);
    const delivered=isDeliveredDurationEligible(order)?sourceNaiveMillis(order.deliveredTimestamp):null;
    const pairs:[number|null,number|null,boolean][] = [
      [purchase,approved,exportedApproval],
      [approved,handoff,exportedApproval&&exportedCarrier],
      [handoff,delivered,exportedCarrier],
      [purchase,delivered,true],
    ];
    for(let i=0;i<pairs.length;i++){
      const [start,end,exported]=pairs[i];
      if(!exported)continue;
      if(start===null || end===null){
        // An actual malformed non-empty source string is different from an absent event.
        const rawStart=[order.purchaseTimestamp,order.approvedTimestamp,order.carrierHandoffTimestamp,order.purchaseTimestamp][i];
        const rawEnd=[order.approvedTimestamp,order.carrierHandoffTimestamp,order.deliveredTimestamp,order.deliveredTimestamp][i];
        if ((rawStart && start===null) || (rawEnd && end===null &&
            (i<2 || order.status==='delivered'))) stages[i].invalidSequenceOrders++;
        continue;
      }
      if(end<start){ stages[i].invalidSequenceOrders++;continue; }
      stages[i].values.push((end-start)/MILLIS_PER_DAY);
    }
    if (isOnTimeEligible(order) && order.deliveryDayDelta!==null && Number.isInteger(order.deliveryDayDelta))
      promiseDeltas.push(order.deliveryDayDelta);
  }
  return {
    cohortOrders:cohort.eligibleOrders.length,
    stages:stages.map(s=>({id:s.id,label:s.label,eligibleOrders:s.values.length,
      invalidSequenceOrders:s.invalidSequenceOrders,medianDays:quantileR7(s.values,0.5),
      p95Days:quantileR7(s.values,0.95),milestoneFieldsExported:s.milestoneFieldsExported})),
    promiseEligibleOrders:promiseDeltas.length,
    medianDaysPastPromise:quantileR7(promiseDeltas,0.5),
    p95DaysPastPromise:quantileR7(promiseDeltas,0.95),
  };
}
