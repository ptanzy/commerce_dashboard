import { fetchWithTransientRetry } from '../observability/recovery';
import { clockNow, recordTiming } from '../observability/diagnostics';
import type { DataIndex } from './indexes';
import type { DataManifest } from '../domain/types';
import { validateDataset } from './validate';

export interface DashboardDataset {
  index: DataIndex;
  manifest: DataManifest;
}

export type JsonFetch = (input: string, init?: RequestInit) => Promise<Response>;

function assetUrl(name: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}data/${name}`;
}

async function getJson(name: string, signal: AbortSignal, fetchJson: JsonFetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchWithTransientRetry(assetUrl(name), signal, fetchJson);
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(`Could not fetch ${name}. Check that the local Vite server is running.`, { cause: error });
  }
  if (!response.ok) {
    throw new Error(`Could not load ${name} (HTTP ${response.status}). Run the Python data-preparation command to create public/data/${name}.`);
  }
  try {
    return await response.json() as unknown;
  } catch (error) {
    throw new Error(`${name} is not valid JSON. Regenerate the local data exports.`, { cause: error });
  }
}

/** Fetch all three static assets concurrently, validate schema, index exactly once. */
export async function loadDashboardData(signal: AbortSignal, fetchJson: JsonFetch = fetch): Promise<DashboardDataset> {
  const [metadata, orders, items] = await Promise.all([
    getJson('metadata.json', signal, fetchJson),
    getJson('orders.json', signal, fetchJson),
    getJson('items.json', signal, fetchJson),
  ]);
  if (signal.aborted) throw new DOMException('Data loading aborted', 'AbortError');
  const start = clockNow();
  const result = validateDataset(orders,items,metadata);
  recordTiming('dataset_validation',clockNow()-start);
  return result;
}
