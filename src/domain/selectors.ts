import type { DataIndex } from '../data/indexes';
import type { Filters, FlowPair, ItemFact, OrderFact } from './types';

export interface Cohort {
  eligibleOrders: readonly OrderFact[];
  eligibleItems: readonly ItemFact[];
  eligibleOrderIds: ReadonlySet<string>;
}

/** Seller and category conditions MUST match the same item. */
export function selectCohort(index: DataIndex, filters: Filters): Cohort {
  const baseOrders = index.orders.filter((order) => {
    const date = order.purchaseDate;
    return date !== null &&
      (filters.purchaseDateFrom === null || date >= filters.purchaseDateFrom) &&
      (filters.purchaseDateTo === null || date <= filters.purchaseDateTo) &&
      (filters.customerStates.length === 0 || (order.customerState !== null && filters.customerStates.includes(order.customerState)));
  });
  const baseIds = new Set(baseOrders.map((o) => o.orderId));
  const eligibleItems = index.items.filter((item) =>
    baseIds.has(item.orderId) &&
    (filters.sellerStates.length === 0 || (item.sellerState !== null && filters.sellerStates.includes(item.sellerState))) &&
    (filters.categories.length === 0 || filters.categories.includes(item.category)));
  const itemFilter = filters.sellerStates.length > 0 || filters.categories.length > 0;
  const eligibleOrderIds = itemFilter
    ? new Set(eligibleItems.map((item) => item.orderId))
    : baseIds;
  const eligibleOrders = itemFilter
    ? baseOrders.filter((o) => eligibleOrderIds.has(o.orderId))
    : baseOrders;
  return { eligibleOrders, eligibleItems, eligibleOrderIds };
}

/** Drill-down only: exact directed pairs, OR across pairs, AND with global context.
 * Empty selection leaves the global cohort intact, including no-item orders.
 * A single pair argument remains accepted for older analytical test callers.
 */
export function selectFocusedFlowCohort(context: Cohort, focuses: FlowPair | readonly FlowPair[] | null): Cohort {
  const pairs = focuses === null ? [] : Array.isArray(focuses) ? focuses : [focuses as FlowPair];
  if (!pairs.length) return context;
  const pairKeys=new Set(pairs.map(pair=>`${pair.sellerState}\u0000${pair.customerState}`));
  const eligibleItems = context.eligibleItems.filter(item =>
    pairKeys.has(`${item.sellerState ?? ''}\u0000${item.customerState ?? ''}`));
  const eligibleOrderIds = new Set(eligibleItems.map(item => item.orderId));
  return {
    eligibleOrders: context.eligibleOrders.filter(order => eligibleOrderIds.has(order.orderId)),
    eligibleItems, eligibleOrderIds,
  };
}

export interface Metrics {
  distinctOrders: number;
  deliveredDurationCount: number;
  onTimeDenominator: number;
  onTimeNumerator: number;
  onTimeRate: number | null;
  medianDeliveryDays: number | null;
  p95DeliveryDays: number | null;
  freightChargeBRL: number;
  itemPriceBRL: number;
  freightToPriceRatio: number | null;
  invalidPriceItems: number;
  invalidFreightItems: number;
}

/** R-7 interpolation, matching d3.quantileSorted and DuckDB PERCENTILE_CONT. */
export function quantileR7(values: readonly number[], p: number): number | null {
  if (p < 0 || p > 1 || !Number.isFinite(p)) throw new RangeError('p must be between 0 and 1');
  const clean = values.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (!clean.length) return null;
  const pos = (clean.length - 1) * p;
  const low = Math.floor(pos), high = Math.ceil(pos), fraction = pos - low;
  return clean[low] + (clean[high] - clean[low]) * fraction;
}

/** Safe even if an input record has not passed ETL validation. */
export function isDeliveredDurationEligible(order: OrderFact): boolean {
  return order.status === 'delivered' &&
    order.purchaseTimestamp !== null && order.deliveredTimestamp !== null &&
    order.deliveryDays !== null && Number.isFinite(order.deliveryDays) && order.deliveryDays >= 0;
}

export function isOnTimeEligible(order: OrderFact): boolean {
  return isDeliveredDurationEligible(order) && order.estimatedDeliveryDate !== null &&
    order.deliveredDate !== null &&
    ['early', 'on_time', 'late'].includes(order.deliveryClassification);
}

export function computeMetrics(cohort: Cohort): Metrics {
  const durations: number[] = [];
  let onTimeDenominator = 0, onTimeNumerator = 0;
  for (const order of cohort.eligibleOrders) {
    if (isDeliveredDurationEligible(order)) durations.push(order.deliveryDays!);
    if (isOnTimeEligible(order)) {
      onTimeDenominator++;
      if (order.deliveryClassification !== 'late') onTimeNumerator++;
    }
  }
  let freightChargeBRL = 0, itemPriceBRL = 0, invalidPriceItems = 0, invalidFreightItems = 0;
  for (const item of cohort.eligibleItems) {
    if (item.priceBRL !== null && Number.isFinite(item.priceBRL) && item.priceBRL >= 0)
      itemPriceBRL += item.priceBRL;
    else invalidPriceItems++;
    if (item.freightChargeBRL !== null && Number.isFinite(item.freightChargeBRL) && item.freightChargeBRL >= 0)
      freightChargeBRL += item.freightChargeBRL;
    else invalidFreightItems++;
  }
  return {
    distinctOrders: cohort.eligibleOrders.length,
    deliveredDurationCount: durations.length,
    onTimeDenominator, onTimeNumerator,
    onTimeRate: onTimeDenominator > 0 ? onTimeNumerator / onTimeDenominator : null,
    medianDeliveryDays: quantileR7(durations, 0.5),
    p95DeliveryDays: quantileR7(durations, 0.95),
    freightChargeBRL, itemPriceBRL,
    freightToPriceRatio: itemPriceBRL > 0 ? freightChargeBRL / itemPriceBRL : null,
    invalidPriceItems, invalidFreightItems,
  };
}

/** A mutually exclusive view of delivery outcomes over the distinct eligible order cohort.
 * Early/on-time/late require valid delivered duration and a promised date.
 * Unknown includes non-delivered and records without enough reliable delivery information.
 */
export interface DeliveryBreakdown {
  early: number;
  onTime: number;
  late: number;
  unknown: number;
  eligible: number;
  totalOrders: number;
}

export function deliveryBreakdown(cohort: Cohort): DeliveryBreakdown {
  let early = 0, onTime = 0, late = 0;
  for (const order of cohort.eligibleOrders) {
    if (!isOnTimeEligible(order)) continue;
    if (order.deliveryClassification === 'early') early++;
    else if (order.deliveryClassification === 'on_time') onTime++;
    else if (order.deliveryClassification === 'late') late++;
  }
  const eligible = early + onTime + late;
  return { early, onTime, late, unknown: cohort.eligibleOrders.length - eligible,
    eligible, totalOrders: cohort.eligibleOrders.length };
}

/** Each state counts DISTINCT orders. Multi-seller orders may belong to several origin states. */
export interface StateDeliveryStats {
  state: string;
  distinctOrders: number;
  durationCount: number;
  onTimeNumerator: number;
  onTimeDenominator: number;
  onTimeRate: number | null;
  medianDeliveryDays: number | null;
}

export function stateDeliveryStats(cohort: Cohort, dimension: 'origin' | 'destination'): ReadonlyMap<string, StateDeliveryStats> {
  const orderById = new Map(cohort.eligibleOrders.map(order => [order.orderId, order]));
  const grouped = new Map<string, Set<string>>();
  const add = (state: string | null, id: string) => {
    if (!state || !orderById.has(id)) return;
    let ids = grouped.get(state);
    if (!ids) { ids = new Set<string>(); grouped.set(state, ids); }
    ids.add(id);
  };
  if (dimension === 'destination') {
    for (const order of cohort.eligibleOrders) add(order.customerState, order.orderId);
  } else {
    for (const item of cohort.eligibleItems) add(item.sellerState, item.orderId);
  }
  const result = new Map<string, StateDeliveryStats>();
  for (const [state, ids] of grouped) {
    let onTimeDenominator = 0, onTimeNumerator = 0;
    const durations: number[] = [];
    for (const id of ids) {
      const order = orderById.get(id)!;
      if (isDeliveredDurationEligible(order)) durations.push(order.deliveryDays!);
      if (isOnTimeEligible(order)) {
        onTimeDenominator++;
        if (order.deliveryClassification !== 'late') onTimeNumerator++;
      }
    }
    result.set(state, {state, distinctOrders: ids.size, durationCount: durations.length,
      onTimeDenominator, onTimeNumerator,
      onTimeRate: onTimeDenominator ? onTimeNumerator / onTimeDenominator : null,
      medianDeliveryDays: quantileR7(durations, 0.5)});
  }
  return result;
}

export interface MatchedMoney {
  matchedItemCount: number;
  priceBRL: number | null;
  freightChargeBRL: number | null;
}

/** Keyed per distinct order; missing item rows and invalid-only sums stay null. */
export function matchingOrderAmounts(cohort: Cohort): ReadonlyMap<string, MatchedMoney> {
  const output = new Map<string, MatchedMoney>();
  for (const order of cohort.eligibleOrders) output.set(order.orderId, { matchedItemCount: 0, priceBRL: null, freightChargeBRL: null });
  for (const item of cohort.eligibleItems) {
    const entry = output.get(item.orderId);
    if (!entry) continue;
    entry.matchedItemCount++;
    if (item.priceBRL !== null && Number.isFinite(item.priceBRL) && item.priceBRL >= 0)
      entry.priceBRL = (entry.priceBRL ?? 0) + item.priceBRL;
    if (item.freightChargeBRL !== null && Number.isFinite(item.freightChargeBRL) && item.freightChargeBRL >= 0)
      entry.freightChargeBRL = (entry.freightChargeBRL ?? 0) + item.freightChargeBRL;
  }
  return output;
}

export type FlowMeasure = 'items' | 'freight' | 'value';
export interface DirectedLink {
  source: string;
  target: string;
  sellerState: string;
  customerState: string;
  itemCount: number;
  freightChargeBRL: number;
  itemValueBRL: number;
  /** Nonnegative weight used by Sankey; zero-weight pairs are omitted for monetary modes. */
  weight: number;
}
export interface SankeySummary {
  links: readonly DirectedLink[];
  measure: FlowMeasure;
  mappableItemCount: number;
  unmappableItemCount: number;
  shownItemCount: number;
  /** The denominator includes only valid, mappable values for the selected measurement. */
  mappableWeight: number;
  shownWeight: number;
  invalidWeightItems: number;
  coverage: number | null;
}

/** Sort and rank TOP 15 separately by the selected measure. Do not treat null money as BRL zero. */
export function topDirectedFlows(cohort: Cohort, count = 15, measure: FlowMeasure = 'items', pinned: readonly FlowPair[] = []): SankeySummary {
  const byPair = new Map<string, DirectedLink>();
  let mappableItemCount = 0, unmappableItemCount = 0, invalidWeightItems = 0;
  let mappableWeight = 0;
  for (const item of cohort.eligibleItems) {
    if (!item.sellerState || !item.customerState) { unmappableItemCount++; continue; }
    mappableItemCount++;
    const key = `${item.sellerState}\u0000${item.customerState}`;
    let link = byPair.get(key);
    if (!link) {
      link = {source:`origin:${item.sellerState}`, target:`dest:${item.customerState}`,
        sellerState:item.sellerState,customerState:item.customerState,
        itemCount:0,freightChargeBRL:0,itemValueBRL:0,weight:0};
      byPair.set(key,link);
    }
    link.itemCount++;
    if (item.priceBRL !== null && Number.isFinite(item.priceBRL) && item.priceBRL >= 0)
      link.itemValueBRL += item.priceBRL;
    if (item.freightChargeBRL !== null && Number.isFinite(item.freightChargeBRL) && item.freightChargeBRL >= 0)
      link.freightChargeBRL += item.freightChargeBRL;
    const selectedValue = measure === 'items' ? 1 : measure === 'freight' ? item.freightChargeBRL : item.priceBRL;
    if (selectedValue !== null && Number.isFinite(selectedValue) && selectedValue >= 0)
      mappableWeight += selectedValue;
    else invalidWeightItems++;
  }
  for (const link of byPair.values()) link.weight = measure === 'items' ? link.itemCount :
    measure === 'freight' ? link.freightChargeBRL : link.itemValueBRL;
  const ranked = [...byPair.values()].filter(link => link.weight > 0)
    .sort((a,b) => b.weight - a.weight || a.sellerState.localeCompare(b.sellerState) || a.customerState.localeCompare(b.customerState));
  const links = ranked.slice(0, Math.max(0, count));
  const included = new Set(links.map(link=>`${link.sellerState}\u0000${link.customerState}`));
  // Preserve previously focused pairs when measure changes re-rank the top 15.
  for (const pair of pinned) {
    const key=`${pair.sellerState}\u0000${pair.customerState}`;
    const link=byPair.get(key);
    if (link && link.weight>0 && !included.has(key)) {links.push(link);included.add(key);}
  }
  const shownItemCount = links.reduce((sum, link) => sum + link.itemCount, 0);
  const shownWeight = links.reduce((sum, link) => sum + link.weight, 0);
  return {links, measure, mappableItemCount, unmappableItemCount, shownItemCount,
    mappableWeight, shownWeight, invalidWeightItems,
    coverage: mappableWeight > 0 ? Math.min(1, shownWeight / mappableWeight) : null};
}

/** Seller-origin counts overlap: multi-seller orders may count in multiple states. */
export function originStateOrderCounts(cohort: Cohort): ReadonlyMap<string, number> {
  const ids = new Map<string, Set<string>>();
  for (const item of cohort.eligibleItems) {
    if (!item.sellerState) continue;
    if (!ids.has(item.sellerState)) ids.set(item.sellerState, new Set());
    ids.get(item.sellerState)!.add(item.orderId);
  }
  return new Map([...ids].map(([state, orderIds]) => [state, orderIds.size]));
}

export function destinationStateOrderCounts(cohort: Cohort): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const order of cohort.eligibleOrders) {
    if (order.customerState) counts.set(order.customerState, 1 + (counts.get(order.customerState) ?? 0));
  }
  return counts;
}

export interface MonthMetric {
  month: string;
  distinctOrders: number;
  onTimeNumerator: number;
  onTimeDenominator: number;
  onTimeRate: number | null;
  selected: boolean;
  lowSample: boolean;
}

/** Month selection replaces the date range; the trend remains a full-history context view. */
export function monthDateRange(month: string): {from: string; to: string} {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`Invalid month: ${month}`);
  const [year, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

export function monthlyTrendContext(index: DataIndex, filters: Filters, lowSampleThreshold = 30, focuses: FlowPair | readonly FlowPair[] | null = null): readonly MonthMetric[] {
  if (!index.fullHistoryMin || !index.fullHistoryMax) return [];
  // Remove only the date constraint; keep all current seller/customer/category constraints.
  const contextFilters = { ...filters, purchaseDateFrom: null, purchaseDateTo: null };
  const cohort = selectFocusedFlowCohort(selectCohort(index, contextFilters), focuses);
  const byMonth = new Map<string, {orders: number; onTime: number; eligible: number}>();
  for (const order of cohort.eligibleOrders) {
    const month = order.purchaseDate!.slice(0, 7);
    const record = byMonth.get(month) ?? { orders: 0, onTime: 0, eligible: 0 };
    record.orders++;
    if (isOnTimeEligible(order)) {
      record.eligible++;
      if (order.deliveryClassification !== 'late') record.onTime++;
    }
    byMonth.set(month, record);
  }
  const start = index.fullHistoryMin.slice(0, 7);
  const end = index.fullHistoryMax.slice(0, 7);
  const output: MonthMetric[] = [];
  for (let year = Number(start.slice(0, 4)), month = Number(start.slice(5, 7)); ; ) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const value = byMonth.get(key) ?? { orders: 0, onTime: 0, eligible: 0 };
    const from = `${key}-01`, to = monthDateRange(key).to;
    const selected = (filters.purchaseDateFrom === null || to >= filters.purchaseDateFrom) &&
      (filters.purchaseDateTo === null || from <= filters.purchaseDateTo);
    output.push({ month: key, distinctOrders: value.orders, onTimeNumerator: value.onTime,
      onTimeDenominator: value.eligible, onTimeRate: value.eligible > 0 ? value.onTime/value.eligible : null,
      selected, lowSample: value.eligible > 0 && value.eligible < lowSampleThreshold });
    if (key === end) break;
    if (++month === 13) {year++;month=1;}
  }
  return output;
}

export function categoryLabel(category: string): string {
  if (category === 'unknown') return 'Unknown';
  const untranslated = category.startsWith('untranslated:');
  const name = untranslated ? category.slice('untranslated:'.length) : category;
  const formatted = name.replace(/_/g, ' ').replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  return untranslated ? `Untranslated: ${formatted}` : formatted;
}
