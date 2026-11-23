import { useEffect, useState } from 'react';
import { loadDashboardData } from '../data/loader';
import type { DashboardDataset } from '../data/loader';

type DatasetState =
  | { status: 'loading'; dataset: null; error: null }
  | { status: 'ready'; dataset: DashboardDataset; error: null }
  | { status: 'error'; dataset: null; error: string };

export function useDashboardData(): DatasetState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DatasetState>({ status: 'loading', dataset: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', dataset: null, error: null });
    loadDashboardData(controller.signal).then((dataset) => {
      if (!controller.signal.aborted) setState({ status: 'ready', dataset, error: null });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({
        status: 'error', dataset: null,
        error: error instanceof Error ? error.message : 'An unknown data loading error occurred.',
      });
    });
    return () => controller.abort();
  }, [attempt]);
  return { ...state, retry: () => setAttempt((value) => value + 1) };
}
