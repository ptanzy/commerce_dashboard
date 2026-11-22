import type {DataManifest, ItemFact, OrderFact} from '../domain/types';
import {buildDataIndex} from './indexes';
import type {DataIndex} from './indexes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}
function nullableNonnegativeNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}
function must(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Dataset validation failed: ${message}`);
}

/** One-time runtime input validation, before selectors assume known export schema. */
export function validateDataset(ordersRaw: unknown, itemsRaw: unknown, metadataRaw: unknown): {manifest: DataManifest; index: DataIndex} {
  must(isRecord(metadataRaw), 'metadata.json must be an object');
  must(metadataRaw.schemaVersion === 2, 'unsupported schemaVersion (expected 2)');
  must(metadataRaw.sourceName === 'Olist Brazilian E-Commerce', 'source name mismatch');
  must(Array.isArray(ordersRaw) && Array.isArray(itemsRaw), 'orders and items must be arrays');
  must(typeof metadataRaw.orderCount === 'number' && metadataRaw.orderCount === ordersRaw.length, 'order count mismatch');
  must(typeof metadataRaw.itemCount === 'number' && metadataRaw.itemCount === itemsRaw.length, 'item count mismatch');
  must(typeof metadataRaw.processingVersion === 'string' && metadataRaw.processingVersion.length > 0, 'missing processing version');

  for (const row of ordersRaw) {
    must(isRecord(row), 'order row is not an object');
    must(typeof row.orderId === 'string' && row.orderId.length > 0, 'missing orderId');
    must(nullableString(row.customerState) && nullableString(row.purchaseDate) && nullableString(row.purchaseTimestamp), 'invalid order state/date');
    must(nullableString(row.estimatedDeliveryDate) && nullableString(row.deliveredDate) && nullableString(row.deliveredTimestamp), 'invalid delivery dates');
    must(typeof row.status === 'string', 'invalid order status');
    must(nullableNonnegativeNumber(row.deliveryDays), 'invalid deliveryDays');
    must(row.deliveryDayDelta === null || (typeof row.deliveryDayDelta === 'number' && Number.isInteger(row.deliveryDayDelta)), 'invalid deliveryDayDelta');
    must(['early','on_time','late','unknown'].includes(String(row.deliveryClassification)), 'invalid delivery classification');
    must(typeof row.itemCount === 'number' && Number.isInteger(row.itemCount) && row.itemCount >= 0, 'invalid itemCount');
  }
  for (const row of itemsRaw) {
    must(isRecord(row), 'item row is not an object');
    must(typeof row.orderId === 'string' && typeof row.sellerId === 'string', 'missing item IDs');
    must(typeof row.orderItemId === 'number' && Number.isInteger(row.orderItemId) && row.orderItemId >= 1, 'invalid item ordinal');
    must(nullableString(row.customerState) && nullableString(row.sellerState), 'invalid item UF');
    must(typeof row.category === 'string' && row.category.length > 0, 'invalid category key');
    must(nullableNonnegativeNumber(row.priceBRL) && nullableNonnegativeNumber(row.freightChargeBRL), 'invalid item amount');
  }
  const index = buildDataIndex(ordersRaw as unknown as OrderFact[],itemsRaw as unknown as ItemFact[]);
  for (const order of index.orders) {
    if ((index.itemsByOrderId.get(order.orderId)?.length ?? 0) !== order.itemCount)
      throw new Error(`Dataset validation failed: itemCount mismatch on ${order.orderId}`);
  }
  return {manifest: metadataRaw as unknown as DataManifest, index};
}
