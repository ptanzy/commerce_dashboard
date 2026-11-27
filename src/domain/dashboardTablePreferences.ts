/** Persistent, per-dashboard pagination preferences. No unbounded or arbitrary numbers. */
export const TABLE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type TablePageSize = typeof TABLE_PAGE_SIZE_OPTIONS[number];
export const DEFAULT_TABLE_PAGE_SIZE: TablePageSize = 10;
export const DASHBOARD_TABLE_IDS = [
  'orderExplorer', 'shippingCorridorScorecard', 'sellerPerformance', 'customerExperience',
] as const;
export type DashboardTableId = typeof DASHBOARD_TABLE_IDS[number];
export type DashboardTablePageSizes = Record<DashboardTableId, TablePageSize>;

export const defaultDashboardTablePageSizes = (): DashboardTablePageSizes => ({
  orderExplorer: DEFAULT_TABLE_PAGE_SIZE,
  shippingCorridorScorecard: DEFAULT_TABLE_PAGE_SIZE,
  sellerPerformance: DEFAULT_TABLE_PAGE_SIZE,
  customerExperience: DEFAULT_TABLE_PAGE_SIZE,
});

export function isTablePageSize(value: unknown): value is TablePageSize {
  return typeof value === 'number' && TABLE_PAGE_SIZE_OPTIONS.some(option=>option===value);
}

/** Reject extra keys, prototype pollution and invalid page sizes in imported dashboards. */
export function readDashboardTablePageSizes(input: unknown): DashboardTablePageSizes | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const proto = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) return null;
  const value = input as Record<string, unknown>;
  const keys = Object.keys(value);
  if (keys.length!==DASHBOARD_TABLE_IDS.length ||
      !keys.every(key=>DASHBOARD_TABLE_IDS.some(id=>id===key)) ||
      !DASHBOARD_TABLE_IDS.every(key=>isTablePageSize(value[key]))) return null;
  return {
    orderExplorer: value.orderExplorer as TablePageSize,
    shippingCorridorScorecard: value.shippingCorridorScorecard as TablePageSize,
    sellerPerformance: value.sellerPerformance as TablePageSize,
    customerExperience: value.customerExperience as TablePageSize,
  };
}
