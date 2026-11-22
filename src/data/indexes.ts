import type { OrderFact, ItemFact } from '../domain/types';

export interface DataIndex {
  orders: readonly OrderFact[];
  items: readonly ItemFact[];
  orderById: ReadonlyMap<string, OrderFact>;
  itemsByOrderId: ReadonlyMap<string, readonly ItemFact[]>;
  fullHistoryMin: string | null;
  fullHistoryMax: string | null;
}

/** One-time indexing at data load. No business metric is computed here. */
export function buildDataIndex(orders: readonly OrderFact[], items: readonly ItemFact[]): DataIndex {
  const orderById = new Map<string, OrderFact>();
  const itemsByOrderId = new Map<string, ItemFact[]>();
  let min: string | null = null;
  let max: string | null = null;
  for (const order of orders) {
    if (orderById.has(order.orderId)) throw new Error(`Duplicate order ID: ${order.orderId}`);
    orderById.set(order.orderId, order);
    if (order.purchaseDate !== null) {
      if (min === null || order.purchaseDate < min) min = order.purchaseDate;
      if (max === null || order.purchaseDate > max) max = order.purchaseDate;
    }
  }
  const seenItems = new Set<string>();
  for (const item of items) {
    if (!orderById.has(item.orderId)) throw new Error(`Orphan item: ${item.orderId}`);
    const key = `${item.orderId}\u0000${item.orderItemId}`;
    if (seenItems.has(key)) throw new Error(`Duplicate item: ${key}`);
    seenItems.add(key);
    const target = itemsByOrderId.get(item.orderId);
    if (target) target.push(item);
    else itemsByOrderId.set(item.orderId, [item]);
  }
  return { orders, items, orderById, itemsByOrderId, fullHistoryMin: min, fullHistoryMax: max };
}
