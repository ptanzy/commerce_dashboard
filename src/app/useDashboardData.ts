import { useEffect, useState } from 'react';
import { loadDashboardData } from '../data/loader';
import type { DashboardDataset } from '../data/loader';
import { clockNow, recordEvent, recordTiming, setDatasetMetadata, setHealth } from '../observability/diagnostics';

type DatasetState =
  | { status: 'loading'; dataset: null; error: null }
  | { status: 'ready'; dataset: DashboardDataset; error: null }
  | { status: 'error'; dataset: null; error: string };

export function useDashboardData(): DatasetState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DatasetState>({ status: 'loading', dataset: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    const started = clockNow();
    recordEvent('info','DATASET_LOAD_STARTED','app');
    setHealth('dataset','pending');
    setState({ status: 'loading', dataset: null, error: null });
    loadDashboardData(controller.signal).then((dataset) => {
      if (!controller.signal.aborted) {
        recordTiming('dataset_load',clockNow()-started);
        setDatasetMetadata({schemaVersion:dataset.manifest.schemaVersion,
          processingVersion:dataset.manifest.processingVersion,
          orderCount:dataset.manifest.orderCount,itemCount:dataset.manifest.itemCount});
        setHealth('dataset','ready');
        recordEvent('info','DATASET_LOADED','app',dataset.manifest.orderCount);
        setState({ status: 'ready', dataset, error: null });
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        recordTiming('dataset_load',clockNow()-started);
        setHealth('dataset','degraded');
        recordEvent('error','DATASET_LOAD_FAILED','app');
        setState({status:'error',dataset:null,
          error:error instanceof Error ? error.message : 'An unknown data loading error occurred.'});
      }
    });
    return () => controller.abort();
  }, [attempt]);
  return { ...state, retry: () => {recordEvent('info','DATASET_RETRY','app');setAttempt((value) => value + 1);} };
}
