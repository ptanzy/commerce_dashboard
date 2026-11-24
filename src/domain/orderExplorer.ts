import type { DataIndex } from '../data/indexes';
import type { Cohort, MatchedMoney } from './selectors';
import { matchingOrderAmounts } from './selectors';
import type { Filters, ItemFact, OrderFact } from './types';

/** One table row per eligible order, with charges from matching items only. */
export interface ExplorerOrder extends OrderFact {
  matchingItemCount: number;
  matchingPriceBRL: number | null;
  matchingFreightBRL: number | null;
}

export function selectExplorerOrders(cohort: Cohort): ExplorerOrder[] {
  const money = matchingOrderAmounts(cohort);
  return cohort.eligibleOrders.map((order) => {
    const matched = money.get(order.orderId);
    return {
      ...order,
      matchingItemCount: matched?.matchedItemCount ?? 0,
      matchingPriceBRL: matched?.priceBRL ?? null,
      matchingFreightBRL: matched?.freightChargeBRL ?? null,
    };
  });
}

export interface OrderDetail {
  order: OrderFact;
  fullItems: readonly ItemFact[];
  matchingItemIds: ReadonlySet<number>;
  matchingTotals: MatchedMoney;
  fullTotals: MatchedMoney;
}

function sumItemAmounts(items: readonly ItemFact[]): MatchedMoney {
  let priceBRL: number | null = null;
  let freightChargeBRL: number | null = null;
  for (const item of items) {
    if (item.priceBRL !== null && Number.isFinite(item.priceBRL) && item.priceBRL >= 0)
      priceBRL = (priceBRL ?? 0) + item.priceBRL;
    if (item.freightChargeBRL !== null && Number.isFinite(item.freightChargeBRL) && item.freightChargeBRL >= 0)
      freightChargeBRL = (freightChargeBRL ?? 0) + item.freightChargeBRL;
  }
  return { matchedItemCount: items.length, priceBRL, freightChargeBRL };
}

/** Indexed per-order item lookup; no scan of the entire 112k-item dataset. */
export function selectOrderDetail(index: DataIndex, cohort: Cohort, filters: Filters, orderId: string): OrderDetail | null {
  if (!cohort.eligibleOrderIds.has(orderId)) return null;
  const order = index.orderById.get(orderId);
  if (!order) return null;
  const fullItems = index.itemsByOrderId.get(orderId) ?? [];
  const matchedItems = fullItems.filter((item) =>
    (filters.sellerStates.length === 0 || (item.sellerState !== null && filters.sellerStates.includes(item.sellerState))) &&
    (filters.categories.length === 0 || filters.categories.includes(item.category)) &&
    (filters.focusedFlow === null || (item.sellerState === filters.focusedFlow.sellerState && item.customerState === filters.focusedFlow.customerState)),
  );
  return {
    order, fullItems,
    matchingItemIds: new Set(matchedItems.map((item) => item.orderItemId)),
    matchingTotals: sumItemAmounts(matchedItems),
    fullTotals: sumItemAmounts(fullItems),
  };
}
