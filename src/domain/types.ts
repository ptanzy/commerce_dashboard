/** Source-naive timestamps are encoded without Z or an implied timezone. */
export type DeliveryClassification = 'early' | 'on_time' | 'late' | 'unknown';

export interface OrderFact {
  orderId: string;
  customerState: string | null;
  purchaseDate: string | null;
  purchaseTimestamp: string | null;
  estimatedDeliveryDate: string | null;
  deliveredDate: string | null;
  deliveredTimestamp: string | null;
  status: string;
  deliveryDays: number | null;
  deliveryDayDelta: number | null;
  deliveryClassification: DeliveryClassification;
  itemCount: number;
}
export interface ItemFact {
  orderId: string;
  orderItemId: number;
  sellerId: string;
  sellerState: string | null;
  customerState: string | null;
  category: string;
  priceBRL: number | null;
  freightChargeBRL: number | null;
}
export interface DataManifest {
  schemaVersion: 2;
  sourceName: 'Olist Brazilian E-Commerce';
  sourceFiles: string[];
  processingVersion: string;
  purchaseDateMin: string | null;
  purchaseDateMax: string | null;
  orderCount: number;
  itemCount: number;
  unmatchedJoinCounts: Record<string, number>;
  invalidCounts: Record<string, number>;
  provenance: string;
  sampleMode: boolean;
  sourceArchiveSha256?: string | null;
  sourceFileSha256?: Record<string, string>;
}
export interface Filters {
  purchaseDateFrom: string | null;
  purchaseDateTo: string | null;
  customerState: string | null;
  sellerState: string | null;
  category: string | null;
}
export type FilterAction =
  | { type: 'set_date_range'; from: string | null; to: string | null }
  | { type: 'set_customer_state'; state: string | null }
  | { type: 'set_seller_state'; state: string | null }
  | { type: 'set_category'; category: string | null }
  | { type: 'set_flow_pair'; sellerState: string; customerState: string }
  | { type: 'clear_all' };

export const DEFAULT_FILTERS: Readonly<Filters> = Object.freeze({
  purchaseDateFrom: null, purchaseDateTo: null, customerState: null,
  sellerState: null, category: null,
});
