import { DASHBOARD_SECTION_IDS } from './dashboardWorkspace';
import type { DashboardSectionId } from './dashboardWorkspace';

/** Presentation grouping only; does not affect which analytical sections are selected. */
export type DashboardSectionGroup = 'kpis' | 'comparison' | 'charts' | 'advanced' | 'orders';
export interface DashboardSectionBlock {
  group: DashboardSectionGroup;
  sections: DashboardSectionId[];
}

const GROUP_BY_SECTION: Readonly<Record<DashboardSectionId, DashboardSectionGroup>> = {
  kpis: 'kpis',
  periodComparison: 'comparison',
  geographicDistribution: 'charts',
  deliveryTrends: 'charts',
  shippingSankey: 'charts',
  categoryLeaderboard: 'advanced',
  delayDistribution: 'advanced',
  orderExplorer: 'orders',
};

/**
 * Preserve the exact saved order; coalesce adjacent chart/advanced sections for a
 * responsive grid. A section moved between groups in a later WU must not jump
 * back to its original group merely because of its type.
 */
export function groupDashboardSections(visible: readonly DashboardSectionId[]): DashboardSectionBlock[] {
  const seen = new Set<DashboardSectionId>();
  const blocks: DashboardSectionBlock[] = [];
  for (const id of visible) {
    if (!DASHBOARD_SECTION_IDS.includes(id) || seen.has(id)) continue;
    seen.add(id);
    const group = GROUP_BY_SECTION[id];
    const last = blocks[blocks.length - 1];
    if (last?.group === group && (group === 'charts' || group === 'advanced')) last.sections.push(id);
    else blocks.push({group, sections: [id]});
  }
  return blocks;
}
