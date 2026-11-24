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
/** Empty selections mean no constraint; OR within each dimension, AND across dimensions. */
export interface FlowPair { sellerState: string; customerState: string }
export interface Filters {
  purchaseDateFrom: string | null;
  purchaseDateTo: string | null;
  customerStates: readonly string[];
  sellerStates: readonly string[];
  categories: readonly string[];
  /** Context-preserving detail focus. Never applied to the Sankey overview cohort. */
  focusedFlows: readonly FlowPair[];
}
export type MultiDimension = 'customerStates' | 'sellerStates' | 'categories';
export type FilterAction =
  | { type: 'set_date_range'; from: string | null; to: string | null }
  | { type: 'toggle_value'; dimension: MultiDimension; value: string }
  | { type: 'clear_dimension'; dimension: MultiDimension }
  | { type: 'focus_flow'; sellerState: string; customerState: string }
  | { type: 'toggle_flow_focus'; sellerState: string; customerState: string }
  | { type: 'restore_filters'; filters: Filters }
  | { type: 'clear_flow_focus' }
  | { type: 'clear_all' };

export const DEFAULT_FILTERS: Readonly<Filters> = Object.freeze({
  purchaseDateFrom: null, purchaseDateTo: null,
  customerStates: Object.freeze([] as string[]), sellerStates: Object.freeze([] as string[]),
  categories: Object.freeze([] as string[]), focusedFlows: Object.freeze([] as FlowPair[]),
});
