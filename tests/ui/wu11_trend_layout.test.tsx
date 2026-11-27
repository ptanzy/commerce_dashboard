// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardSections } from '../../src/app/DashboardSections';
import { defaultDashboardDefinition } from '../../src/domain/dashboardWorkspace';
import { DEFAULT_FILTERS } from '../../src/domain/types';
import { selectCohort, selectFocusedFlowCohort, computeMetrics } from '../../src/domain/selectors';
import { dataset } from './fixtures';

const contextCohort = selectCohort(dataset.index, DEFAULT_FILTERS);
const cohort = selectFocusedFlowCohort(contextCohort, []);
const metrics = computeMetrics(cohort);

function dashboard(definition = defaultDashboardDefinition()) {
  return <DashboardSections definition={definition} dataset={dataset} cohort={cohort} contextCohort={contextCohort}
    metrics={metrics} analyticalFilters={DEFAULT_FILTERS} selectionFilters={DEFAULT_FILTERS} dispatch={() => {}}/>;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('WU-11 Phase 2C responsive paired trend chart', () => {
  it('opts in only when the geographic and trend cards share a chart group', () => {
    const {container, rerender} = render(dashboard());
    const pair = container.querySelector('.workspace-geo-trend-pair');
    expect(pair).not.toBeNull();
    expect(pair?.querySelector('[data-dashboard-section="deliveryTrends"] .trend-plot')).not.toBeNull();
    expect(screen.getByRole('img', {name:/Monthly order count across/i})).toHaveAttribute('viewBox', '0 0 860 294');

    const standalone = defaultDashboardDefinition();
    standalone.layout.hiddenSections = ['geographicDistribution'];
    rerender(dashboard(standalone));
    expect(container.querySelector('.workspace-geo-trend-pair')).toBeNull();
    expect(screen.getByRole('img', {name:/Monthly order count across/i})).toHaveAttribute('viewBox', '0 0 860 294');
  });

  it('expands the vertical data scale without stretching labels, then restores natural aspect at mobile width', () => {
    let sendResize: ((width:number, height:number) => void) | undefined;
    let desktop = true;
    const breakpointListeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', () => ({
      get matches() {return desktop;},
      addEventListener: (_event:string, fn:() => void) => breakpointListeners.add(fn),
      removeEventListener: (_event:string, fn:() => void) => breakpointListeners.delete(fn),
    }));
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        sendResize = (width, height) => callback([{contentRect:{width, height}} as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      observe() {} unobserve() {} disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', TestResizeObserver);

    const {container} = render(dashboard());
    const plot = container.querySelector('.workspace-geo-trend-pair .trend-plot');
    expect(plot).not.toBeNull();
    expect(sendResize).toBeTypeOf('function');
    const svg = screen.getByRole('img', {name:/Monthly order count across/i});
    const initialHitHeight = Number(svg.querySelector('.trend-hit')?.getAttribute('height'));

    act(() => { sendResize?.(540, 500); });
    expect(svg).toHaveAttribute('viewBox', '0 0 860 796');
    expect(Number(svg.querySelector('.trend-hit')?.getAttribute('height'))).toBeGreaterThan(initialHitHeight);
    expect(svg.querySelector('.trend-year-label')).toHaveAttribute('y', '784');
    expect(within(screen.getByRole('group', {name:'Monthly trend metric'})).getByRole('button', {name:'Order volume'})).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(screen.getByRole('group', {name:'Monthly trend metric'})).getByRole('button', {name:'On-time rate'}));
    expect(screen.getByRole('img', {name:/Monthly on-time delivery rate across/i})).toHaveAttribute('viewBox', '0 0 860 796');

    act(() => { desktop = false; for(const listener of breakpointListeners) listener(); });
    expect(screen.getByRole('img', {name:/Monthly on-time delivery rate across/i})).toHaveAttribute('viewBox', '0 0 860 294');
  });
});
