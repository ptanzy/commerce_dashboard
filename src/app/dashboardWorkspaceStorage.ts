import {
  DASHBOARD_SCHEMA_VERSION, DASHBOARD_STORAGE_KEY, DASHBOARD_STORAGE_MAX_CHARS, DASHBOARD_LIMIT,
  emptyDashboardWorkspace, readDashboardWorkspace,
} from '../domain/dashboardWorkspace';
import type { DashboardWorkspaceSnapshot } from '../domain/dashboardWorkspace';

/** Storage is injected: this module is safe to test in Node without a browser. */
export interface WorkspaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export type WorkspaceReadStatus = 'empty' | 'ready' | 'unavailable' | 'oversize' | 'invalid' | 'unsupported-version';
export type WorkspaceReadResult = { workspace: DashboardWorkspaceSnapshot; status: WorkspaceReadStatus };

export function readDashboardWorkspaceStorage(storage: WorkspaceStorage): WorkspaceReadResult {
  let raw: string | null;
  try { raw = storage.getItem(DASHBOARD_STORAGE_KEY); }
  catch { return { workspace: emptyDashboardWorkspace(), status: 'unavailable' }; }
  if (raw === null) return { workspace: emptyDashboardWorkspace(), status: 'empty' };
  if (raw.length > DASHBOARD_STORAGE_MAX_CHARS) return { workspace: emptyDashboardWorkspace(), status: 'oversize' };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return { workspace: emptyDashboardWorkspace(), status: 'invalid' }; }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return { workspace: emptyDashboardWorkspace(), status: 'invalid' };
  if (!Object.prototype.hasOwnProperty.call(parsed, 'schemaVersion') ||
      (parsed as { schemaVersion?: unknown }).schemaVersion !== DASHBOARD_SCHEMA_VERSION)
    return { workspace: emptyDashboardWorkspace(), status: 'unsupported-version' };
  // Reject malformed container structure. Individual malformed entries are discarded on read.
  const root = parsed as Record<string, unknown>;
  if (typeof root.activeDashboardId !== 'string' || !Array.isArray(root.dashboards) ||
      root.dashboards.length > DASHBOARD_LIMIT ||
      !['schemaVersion', 'activeDashboardId', 'dashboards'].every(key => Object.prototype.hasOwnProperty.call(root, key)) || Object.keys(root).length !== 3)
    return { workspace: emptyDashboardWorkspace(), status: 'invalid' };
  return { workspace: readDashboardWorkspace(parsed), status: 'ready' };
}

export type WorkspaceWriteResult = { ok: true } | { ok: false; reason: 'invalid' | 'oversize' | 'unavailable' };
/** Explicit writes only. A load error never rewrites or deletes a user's stored data. */
export function writeDashboardWorkspaceStorage(storage: WorkspaceStorage, snapshot: DashboardWorkspaceSnapshot): WorkspaceWriteResult {
  const safe = readDashboardWorkspace(snapshot);
  if (safe.dashboards.length !== snapshot.dashboards.length ||
      safe.activeDashboardId !== snapshot.activeDashboardId ||
      snapshot.schemaVersion !== DASHBOARD_SCHEMA_VERSION) return { ok: false, reason: 'invalid' };
  const serialized = JSON.stringify(safe);
  if (serialized.length > DASHBOARD_STORAGE_MAX_CHARS) return { ok: false, reason: 'oversize' };
  try { storage.setItem(DASHBOARD_STORAGE_KEY, serialized); return { ok: true }; }
  catch { return { ok: false, reason: 'unavailable' }; }
}
