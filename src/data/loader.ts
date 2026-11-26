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

/** Request JSON explicitly: Vite's HTML SPA fallback can otherwise serve index.html
 * (HTTP 200) for a missing /data/current.json when fetch uses a wildcard Accept header.
 * The JSON Accept header makes that missing optional pointer an HTTP 404,
 * allowing legacy flat-file datasets to continue loading safely. */
function fetchJsonOnly(fetchJson: JsonFetch): JsonFetch {
  return (url, init) => fetchJson(url, { ...init, headers: { Accept: 'application/json' } });
}

function assetUrl(name: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}data/${name}`;
}

async function getJson(name: string, signal: AbortSignal, fetchJson: JsonFetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchWithTransientRetry(assetUrl(name), signal, fetchJsonOnly(fetchJson));
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

interface PublishedGeneration { formatVersion: 1; generation: string; sha256: Record<string, string> }

function isPublishedGeneration(value: unknown): value is PublishedGeneration {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.formatVersion !== 1 || typeof candidate.generation !== 'string' || !/^[a-f0-9]{32}$/.test(candidate.generation)) return false;
  if (typeof candidate.sha256 !== 'object' || candidate.sha256 === null) return false;
  const digests = candidate.sha256 as Record<string, unknown>;
  return ['metadata.json','orders.json','items.json'].every(name => typeof digests[name] === 'string' && /^[a-f0-9]{64}$/.test(digests[name] as string));
}

/** One atomic pointer selects an immutable three-file generation. Older flat
 * deployments remain supported if current.json is absent (HTTP 404 only). */
export async function loadDashboardData(signal: AbortSignal, fetchJson: JsonFetch = fetch): Promise<DashboardDataset> {
  const pointerResponse = await fetchWithTransientRetry(assetUrl('current.json'), signal, fetchJsonOnly(fetchJson));
  let prefix = '';
  if (pointerResponse.ok) {
    let pointer: unknown;
    try {
      pointer = await pointerResponse.json();
    } catch {
      throw new Error('Dataset publication pointer is not valid JSON. The server may be returning HTML for public/data/current.json.');
    }
    if (!isPublishedGeneration(pointer)) throw new Error('Dataset publication pointer is invalid. Regenerate the local exports.');
    prefix = `generations/${pointer.generation}/`;
  } else if (pointerResponse.status !== 404) {
    throw new Error(`Could not load dataset publication pointer (HTTP ${pointerResponse.status}).`);
  }
  const [metadata, orders, items] = await Promise.all([
    getJson(prefix + 'metadata.json', signal, fetchJson),
    getJson(prefix + 'orders.json', signal, fetchJson),
    getJson(prefix + 'items.json', signal, fetchJson),
  ]);
  if (signal.aborted) throw new DOMException('Data loading aborted', 'AbortError');
  const start = clockNow();
  const result = validateDataset(orders,items,metadata);
  recordTiming('dataset_validation',clockNow()-start);
  return result;
}
