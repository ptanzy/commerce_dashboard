import {
  DASHBOARD_LIMIT, DASHBOARD_SCHEMA_VERSION, FULL_DASHBOARD_ID,
  defaultDashboardDefinition, readDashboardDefinition,
} from './dashboardWorkspace';
import type { DashboardDefinition, DashboardWorkspaceSnapshot } from './dashboardWorkspace';
import type { Filters } from './types';

export type WorkspaceChangeResult =
  | { ok: true; workspace: DashboardWorkspaceSnapshot; dashboard: DashboardDefinition }
  | { ok: false; reason: 'invalid-name' | 'duplicate-name' | 'limit-reached' | 'not-found' | 'protected' | 'invalid' };

const nameKey = (name: string) => name.toLocaleLowerCase('en-US');
const nameValid = (name: string) => name.length >= 1 && name.length <= 60 &&
  !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(name);

export function definitionById(workspace: DashboardWorkspaceSnapshot, id: string): DashboardDefinition | null {
  return id === FULL_DASHBOARD_ID ? defaultDashboardDefinition() : workspace.dashboards.find(item => item.id === id) ?? null;
}

/** Draft ownership is explicit: returns fresh arrays, not aliases to filter reducer or storage. */
export function workspaceDraft(definition: DashboardDefinition, filters: Filters, filterPanelVisible = definition.layout.filterPanelVisible): DashboardDefinition {
  return {
    ...definition,
    layout: { sectionOrder: [...definition.layout.sectionOrder], hiddenSections: [...definition.layout.hiddenSections], filterPanelVisible },
    analysis: {
      filters: { ...filters, customerStates: [...filters.customerStates], sellerStates: [...filters.sellerStates],
        categories: [...filters.categories], focusedFlows: filters.focusedFlows.map(pair => ({...pair})) },
      views: {
        geographic: {...definition.analysis.views.geographic}, sankey: {...definition.analysis.views.sankey},
        trends: {...definition.analysis.views.trends}, category: {...definition.analysis.views.category},
      },
    },
  };
}

/** Compare semantic content only; last modified time and name do not make an active draft dirty. */
export function workspaceDraftDirty(saved: DashboardDefinition, draft: DashboardDefinition): boolean {
  const fields = (d: DashboardDefinition) => JSON.stringify({layout:d.layout,analysis:d.analysis});
  return fields(saved) !== fields(draft);
}

function uniqueName(workspace: DashboardWorkspaceSnapshot, name: string, exceptId?: string): boolean {
  const normalized = nameKey(name);
  return normalized !== 'full dashboard' && !workspace.dashboards.some(d => d.id !== exceptId && nameKey(d.name) === normalized);
}

export function uniqueDashboardName(workspace: DashboardWorkspaceSnapshot, suggested: string): string {
  const clean = suggested.trim().slice(0,60) || 'New Dashboard';
  if (uniqueName(workspace, clean)) return clean;
  for (let i=2; i<=DASHBOARD_LIMIT+3; i++) {
    const suffix = ` (${i})`;
    const candidate = clean.slice(0,60-suffix.length).trimEnd() + suffix;
    if (uniqueName(workspace,candidate)) return candidate;
  }
  return `Dashboard ${workspace.dashboards.length+1}`;
}

/** Caller supplies an opaque stable ID and an ISO timestamp, making tests deterministic. */
export function createNamedDashboard(
  workspace: DashboardWorkspaceSnapshot, source: DashboardDefinition,
  requestedName: string, id: string, timestamp: string,
): WorkspaceChangeResult {
  const name = requestedName.trim();
  if (!nameValid(name)) return {ok:false,reason:'invalid-name'};
  if (!uniqueName(workspace,name)) return {ok:false,reason:'duplicate-name'};
  if (workspace.dashboards.length >= DASHBOARD_LIMIT) return {ok:false,reason:'limit-reached'};
  const candidate=readDashboardDefinition({...workspaceDraft(source,source.analysis.filters),schemaVersion:DASHBOARD_SCHEMA_VERSION,id,name,updatedAt:timestamp});
  if (!candidate || workspace.dashboards.some(x=>x.id===id)) return {ok:false,reason:'invalid'};
  return {ok:true,dashboard:candidate,workspace:{...workspace,activeDashboardId:id,dashboards:[...workspace.dashboards,candidate]}};
}

export function saveNamedDashboard(workspace:DashboardWorkspaceSnapshot,draft:DashboardDefinition,timestamp:string):WorkspaceChangeResult {
  if (draft.id===FULL_DASHBOARD_ID) return {ok:false,reason:'protected'};
  if (!workspace.dashboards.some(item=>item.id===draft.id)) return {ok:false,reason:'not-found'};
  const candidate=readDashboardDefinition({...draft,updatedAt:timestamp});
  if (!candidate || !uniqueName(workspace,candidate.name,candidate.id)) return {ok:false,reason:'invalid'};
  return {ok:true,dashboard:candidate,workspace:{...workspace,dashboards:workspace.dashboards.map(d=>d.id===candidate.id?candidate:d)}};
}

export function renameNamedDashboard(workspace:DashboardWorkspaceSnapshot,id:string,requestedName:string,timestamp:string):WorkspaceChangeResult {
  if(id===FULL_DASHBOARD_ID)return {ok:false,reason:'protected'};
  const original=workspace.dashboards.find(d=>d.id===id);
  if(!original)return {ok:false,reason:'not-found'};
  const name=requestedName.trim();
  if(!nameValid(name))return {ok:false,reason:'invalid-name'};
  if(!uniqueName(workspace,name,id))return {ok:false,reason:'duplicate-name'};
  const candidate=readDashboardDefinition({...original,name,updatedAt:timestamp});
  if(!candidate)return {ok:false,reason:'invalid'};
  return {ok:true,dashboard:candidate,workspace:{...workspace,dashboards:workspace.dashboards.map(d=>d.id===id?candidate:d)}};
}

export function removeNamedDashboard(workspace:DashboardWorkspaceSnapshot,id:string):WorkspaceChangeResult {
  if(id===FULL_DASHBOARD_ID)return {ok:false,reason:'protected'};
  if(!workspace.dashboards.some(d=>d.id===id))return {ok:false,reason:'not-found'};
  const next={...workspace,activeDashboardId:workspace.activeDashboardId===id?FULL_DASHBOARD_ID:workspace.activeDashboardId,
    dashboards:workspace.dashboards.filter(d=>d.id!==id)};
  return {ok:true,workspace:next,dashboard:definitionById(next,next.activeDashboardId)!};
}
