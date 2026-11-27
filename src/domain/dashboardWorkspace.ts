import { readFilterSnapshot } from './savedViews';
import { DEFAULT_FILTERS } from './types';
import type { Filters } from './types';

/** WU-11's stable section IDs describe existing visualizations, not user-authored components. */
export const DASHBOARD_SECTIONS = [
  { id: 'kpis', label: 'Executive KPIs' },
  { id: 'periodComparison', label: 'Previous-period comparison' },
  { id: 'geographicDistribution', label: 'Geographic distribution' },
  { id: 'deliveryTrends', label: 'Delivery trends' },
  { id: 'shippingSankey', label: 'Shipping Sankey' },
  { id: 'categoryLeaderboard', label: 'Category leaderboard' },
  { id: 'delayDistribution', label: 'Delivery timing distribution' },
  { id: 'orderExplorer', label: 'Order Explorer' },
] as const;
export type DashboardSectionId = typeof DASHBOARD_SECTIONS[number]['id'];
export const DASHBOARD_SECTION_IDS: readonly DashboardSectionId[] = DASHBOARD_SECTIONS.map(section => section.id);
export const DASHBOARD_SCHEMA_VERSION = 1 as const;
export const FULL_DASHBOARD_ID = 'full-dashboard';
export const DASHBOARD_STORAGE_KEY = 'commerce-dashboard:wu11-workspaces:v1';
export const DASHBOARD_LIMIT = 20;
export const DASHBOARD_STORAGE_MAX_CHARS = 512_000;

export interface DashboardChartViews {
  geographic: { mode: 'origin' | 'destination'; metric: 'orders' | 'onTime' | 'median' };
  sankey: { measure: 'items' | 'freight' | 'value' };
  trends: { measure: 'orders' | 'onTime' };
  category: { measure: 'orders' | 'value' | 'freight' | 'onTime' };
}
export interface DashboardDefinition {
  schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
  id: string;
  name: string;
  layout: {
    /** Complete permutation; hidden sections remain in their saved positions. */
    sectionOrder: DashboardSectionId[];
    hiddenSections: DashboardSectionId[];
    /** Whether the full filter control panel is shown; the compact active-context disclosure remains accessible. */
    filterPanelVisible: boolean;
  };
  analysis: {
    /** Same order/item-grain and exact directed-flow semantics as WU-07. */
    filters: Filters;
    views: DashboardChartViews;
  };
  updatedAt: string;
}
export interface DashboardWorkspaceSnapshot {
  schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
  activeDashboardId: string;
  /** User dashboards only. The immutable full dashboard is virtual and cannot be edited/deleted. */
  dashboards: DashboardDefinition[];
}

const VIEW_DEFAULTS: DashboardChartViews = {
  geographic: { mode: 'origin', metric: 'orders' },
  sankey: { measure: 'items' },
  trends: { measure: 'orders' },
  category: { measure: 'orders' },
};
const NO_CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x) &&
  (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const exactKeys = (x: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(x).length === keys.length && Object.keys(x).every(key => keys.includes(key));
const oneOf = (x: unknown, allowed: readonly string[]): x is string =>
  typeof x === 'string' && allowed.includes(x);
const isSection = (x: unknown): x is DashboardSectionId =>
  typeof x === 'string' && DASHBOARD_SECTION_IDS.includes(x as DashboardSectionId);

/** Factory: no shared mutable arrays with DEFAULT_FILTERS or a sibling dashboard. */
export function defaultDashboardDefinition(): DashboardDefinition {
  return {
    schemaVersion: DASHBOARD_SCHEMA_VERSION,
    id: FULL_DASHBOARD_ID,
    name: 'Full Dashboard',
    layout: { sectionOrder: [...DASHBOARD_SECTION_IDS], hiddenSections: [], filterPanelVisible: true },
    analysis: {
      filters: {
        ...DEFAULT_FILTERS, customerStates: [], sellerStates: [], categories: [], focusedFlows: [],
      },
      views: {
        geographic: { ...VIEW_DEFAULTS.geographic },
        sankey: { ...VIEW_DEFAULTS.sankey },
        trends: { ...VIEW_DEFAULTS.trends },
        category: { ...VIEW_DEFAULTS.category },
      },
    },
    /** Sentinel for the virtual built-in dashboard, not a modification timestamp. */
    updatedAt: '1970-01-01T00:00:00.000Z',
  };
}
export const emptyDashboardWorkspace = (): DashboardWorkspaceSnapshot => ({
  schemaVersion: DASHBOARD_SCHEMA_VERSION,
  activeDashboardId: FULL_DASHBOARD_ID,
  dashboards: [],
});

/** Reject unknown layout IDs and duplicates rather than silently losing user content. */
function readLayout(input: unknown): DashboardDefinition['layout'] | null {
  if (!isRecord(input) || !(exactKeys(input, ['sectionOrder', 'hiddenSections']) ||
    exactKeys(input, ['sectionOrder', 'hiddenSections', 'filterPanelVisible']))) return null;
  // Phase 1 configurations lacked this visibility field; normalize them without rewriting storage.
  if ('filterPanelVisible' in input && typeof input.filterPanelVisible !== 'boolean') return null;
  const order = input.sectionOrder, hidden = input.hiddenSections;
  if (!Array.isArray(order) || order.length !== DASHBOARD_SECTION_IDS.length ||
      !order.every(isSection) || new Set(order).size !== DASHBOARD_SECTION_IDS.length ||
      !Array.isArray(hidden) || hidden.length > DASHBOARD_SECTION_IDS.length ||
      !hidden.every(isSection) || new Set(hidden).size !== hidden.length) return null;
  return { sectionOrder: [...order], hiddenSections: [...hidden], filterPanelVisible: input.filterPanelVisible !== false };
}

function readViews(input: unknown): DashboardChartViews | null {
  if (!isRecord(input) || !exactKeys(input, ['geographic', 'sankey', 'trends', 'category'])) return null;
  const { geographic, sankey, trends, category } = input;
  if (!isRecord(geographic) || !exactKeys(geographic, ['mode', 'metric']) ||
      !oneOf(geographic.mode, ['origin', 'destination']) || !oneOf(geographic.metric, ['orders', 'onTime', 'median']) ||
      !isRecord(sankey) || !exactKeys(sankey, ['measure']) || !oneOf(sankey.measure, ['items', 'freight', 'value']) ||
      !isRecord(trends) || !exactKeys(trends, ['measure']) || !oneOf(trends.measure, ['orders', 'onTime']) ||
      !isRecord(category) || !exactKeys(category, ['measure']) || !oneOf(category.measure, ['orders', 'value', 'freight', 'onTime'])) return null;
  return {
    geographic: { mode: geographic.mode as DashboardChartViews['geographic']['mode'], metric: geographic.metric as DashboardChartViews['geographic']['metric'] },
    sankey: { measure: sankey.measure as DashboardChartViews['sankey']['measure'] },
    trends: { measure: trends.measure as DashboardChartViews['trends']['measure'] },
    category: { measure: category.measure as DashboardChartViews['category']['measure'] },
  };
}

/** Pure validation for localStorage and future JSON import. No HTML or executable layout. */
export function readDashboardDefinition(input: unknown): DashboardDefinition | null {
  if (!isRecord(input) || !exactKeys(input, ['schemaVersion', 'id', 'name', 'layout', 'analysis', 'updatedAt']) ||
      input.schemaVersion !== DASHBOARD_SCHEMA_VERSION || typeof input.id !== 'string' ||
      !ID_PATTERN.test(input.id) || input.id === FULL_DASHBOARD_ID ||
      typeof input.name !== 'string' || input.name.trim().length < 1 ||
      input.name.trim().length > 60 || NO_CONTROL_CHARS.test(input.name) ||
      typeof input.updatedAt !== 'string') return null;
  const timestamp = new Date(input.updatedAt);
  if (!Number.isFinite(timestamp.valueOf()) || timestamp.toISOString() !== input.updatedAt) return null;
  const layout = readLayout(input.layout);
  if (!layout || !isRecord(input.analysis) || !exactKeys(input.analysis, ['filters', 'views'])) return null;
  const filters = readFilterSnapshot(input.analysis.filters);
  const views = readViews(input.analysis.views);
  if (!filters || !views) return null;
  return {
    schemaVersion: DASHBOARD_SCHEMA_VERSION,
    id: input.id,
    name: input.name.trim(),
    layout,
    analysis: { filters, views },
    updatedAt: input.updatedAt,
  };
}

/** Invalid individual dashboards are quarantined; the remaining valid saved dashboards survive. */
export function readDashboardWorkspace(input: unknown): DashboardWorkspaceSnapshot {
  const fallback = emptyDashboardWorkspace();
  if (!isRecord(input) || !exactKeys(input, ['schemaVersion', 'activeDashboardId', 'dashboards']) ||
      input.schemaVersion !== DASHBOARD_SCHEMA_VERSION ||
      typeof input.activeDashboardId !== 'string' || !Array.isArray(input.dashboards) ||
      input.dashboards.length > DASHBOARD_LIMIT) return fallback;
  const dashboards: DashboardDefinition[] = [];
  const ids = new Set<string>();
  const names = new Set<string>(['full dashboard']);
  for (const item of input.dashboards) {
    const dashboard = readDashboardDefinition(item);
    if (!dashboard || ids.has(dashboard.id) || names.has(dashboard.name.toLocaleLowerCase('en-US'))) continue;
    ids.add(dashboard.id);
    names.add(dashboard.name.toLocaleLowerCase('en-US'));
    dashboards.push(dashboard);
  }
  return {
    schemaVersion: DASHBOARD_SCHEMA_VERSION,
    activeDashboardId: ids.has(input.activeDashboardId) ? input.activeDashboardId : FULL_DASHBOARD_ID,
    dashboards,
  };
}

export function visibleDashboardSections(definition: DashboardDefinition): DashboardSectionId[] {
  const hidden = new Set(definition.layout.hiddenSections);
  return definition.layout.sectionOrder.filter(id => !hidden.has(id));
}
