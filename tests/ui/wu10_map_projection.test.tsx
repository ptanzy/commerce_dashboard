// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BrazilMap } from '../../src/charts/BrazilMap';
import { DEFAULT_FILTERS } from '../../src/domain/types';
import { BRAZIL_STATES } from '../../src/components/stateNames';
import { dataset } from './fixtures';

// Count the actual D3 projection construction, not just React render counts. The
// map may re-render to update colors, captions and selection; geometry should not.
const projectionCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock('d3-geo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('d3-geo')>();
  return {
    ...actual,
    geoMercator: (...args: Parameters<typeof actual.geoMercator>) => {
      projectionCalls.count++;
      return actual.geoMercator(...args);
    },
  };
});

const codes = Object.keys(BRAZIL_STATES).sort();
const topology = {
  type: 'Topology',
  transform: { scale: [0.001, 0.001], translate: [-75, -34] },
  objects: { estados: { type: 'GeometryCollection', geometries: codes.map((id, i) => ({
    type: 'Polygon', id, properties: { SIGLA: id }, arcs: [[i]],
  })) } },
  arcs: codes.map((_, i) => [[i * 8, 0], [5, 0], [0, 5], [-5, 0], [0, -5]]),
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); projectionCalls.count = 0; });

describe('WU-10 Phase 3B geographic path memoization', () => {
  it('projects geography once across metric changes, view changes and filter updates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => topology })));
    const dispatch = vi.fn();
    const { rerender } = render(<BrazilMap index={dataset.index} filters={DEFAULT_FILTERS} dispatch={dispatch}/>);
    await screen.findByRole('img', { name: /map of brazil showing seller origins by order volume/i });
    expect(projectionCalls.count).toBe(1);
    const measurement = within(screen.getByRole('group', { name: 'Map measurement' }));
    fireEvent.click(measurement.getByRole('button', { name: 'On-time rate' }));
    expect(measurement.getByRole('button', { name: 'On-time rate' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(measurement.getByRole('button', { name: 'Median delivery' }));
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining('median delivery'));
    fireEvent.click(screen.getByRole('button', { name: 'Destinations' }));
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining('customer destinations'));
    fireEvent.click(screen.getByRole('button', { name: 'Seller origins' }));
    rerender(<BrazilMap index={dataset.index} filters={{ ...DEFAULT_FILTERS, sellerStates: ['SP'] }} dispatch={dispatch}/>);
    expect(projectionCalls.count).toBe(1);
  });
});
