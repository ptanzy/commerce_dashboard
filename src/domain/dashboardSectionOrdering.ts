import { DASHBOARD_SECTION_IDS } from './dashboardWorkspace';
import type { DashboardSectionId } from './dashboardWorkspace';

/** Move by stable section ID, including hidden sections. Reject duplicates and unknown IDs.
 * Section arrangement never changes filter/focus state. */
export function moveDashboardSection(
  order: readonly DashboardSectionId[], moving: DashboardSectionId, targetIndex: number,
): DashboardSectionId[] {
  if (order.length !== DASHBOARD_SECTION_IDS.length ||
      new Set(order).size !== DASHBOARD_SECTION_IDS.length ||
      order.some(id => !DASHBOARD_SECTION_IDS.includes(id))) return [...order];
  const from = order.indexOf(moving);
  if (from < 0 || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= order.length || from === targetIndex)
    return [...order];
  const next = [...order];
  next.splice(from,1);
  next.splice(targetIndex,0,moving);
  return next;
}

export function shiftDashboardSection(
  order: readonly DashboardSectionId[], id: DashboardSectionId, direction: -1 | 1,
): DashboardSectionId[] {
  const index = order.indexOf(id);
  return moveDashboardSection(order,id,index+direction);
}
