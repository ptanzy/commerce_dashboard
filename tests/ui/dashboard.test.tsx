// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DashboardContent, App } from '../../src/app/App';
import { dataset, orders, items, manifest } from './fixtures';
import { THEME_STORAGE_KEY } from '../../src/app/theme';
import { filterReducer } from '../../src/app/filterReducer';
import { DEFAULT_FILTERS } from '../../src/domain/types';

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); document.documentElement.dataset.theme = 'dark'; });

function metricsText(testId: string): string { return screen.getByTestId(testId).textContent ?? ''; }

const select = (name:string,value:string) => fireEvent.change(screen.getByRole('combobox',{name}),{target:{value}});

describe('WU-02 React shell and KPI/filter integration', () => {
  it('defaults to all valid history and preserves zero-item orders without inflating order counts', () => {
    render(<DashboardContent dataset={dataset}/>);
    expect(metricsText('kpi-indigo')).toBe('3');
    expect(metricsText('kpi-mint')).toBe('50.0%');
    expect(metricsText('kpi-amber')).toBe('5.5 days');
    expect(metricsText('kpi-blue')).toBe('16.3%');
    expect(screen.getByText(/All historical data · No filters applied/)).toBeInTheDocument();
    const filterPanel = screen.getByRole('region', { name: 'Dashboard filters' });
    expect(within(filterPanel).getByRole('status')).toHaveTextContent('3 of 3 orders');
  });

  it('seller and category filters must match the same item, with money from matching items only', () => {
    render(<DashboardContent dataset={dataset}/>);
    select('Seller origin','SP');
    select('Product category','health_beauty');
    expect(metricsText('kpi-indigo')).toBe('1');
    expect(metricsText('kpi-blue')).toBe('10.0%');
    expect(screen.getByRole('button',{name:/Clear Origin: SP filter/})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Clear Category: Health Beauty filter/})).toBeInTheDocument();
    select('Product category','books');
    expect(metricsText('kpi-indigo')).toBe('0');
    expect(metricsText('kpi-mint')).toBe('N/A');
    expect(metricsText('kpi-amber')).toBe('N/A');
    expect(metricsText('kpi-blue')).toBe('N/A');
    expect(screen.getByText(/No matching orders/)).toBeInTheDocument();
  });

  it('destination and seller filters combine with AND, and chips clear independently', () => {
    render(<DashboardContent dataset={dataset}/>);
    select('Customer destination','MG');
    select('Seller origin','SP');
    expect(metricsText('kpi-indigo')).toBe('1');
    fireEvent.click(screen.getByRole('button',{name:/Clear Origin: SP filter/}));
    expect(screen.getByRole('combobox',{name:'Customer destination'})).toHaveValue('MG');
    expect(screen.getByRole('combobox',{name:'Seller origin'})).toHaveValue('');
    fireEvent.click(screen.getByRole('button',{name:'Reset all'}));
    expect(metricsText('kpi-indigo')).toBe('3');
  });

  it('date inputs are inclusive and can be cleared without affecting dimension chips', () => {
    render(<DashboardContent dataset={dataset}/>);
    select('Seller origin','RJ');
    fireEvent.change(screen.getByLabelText('Purchase date from'),{target:{value:'2018-03-02'}});
    fireEvent.change(screen.getByLabelText('Purchase date to'),{target:{value:'2018-03-02'}});
    expect(metricsText('kpi-indigo')).toBe('1');
    fireEvent.click(screen.getByRole('button',{name:/Clear Date:/}));
    expect(metricsText('kpi-indigo')).toBe('2');
    expect(screen.getByRole('combobox',{name:'Seller origin'})).toHaveValue('RJ');
  });

  it('atomic flow pair action sets both states without an additional selected-link flag', () => {
    const state = filterReducer({...DEFAULT_FILTERS}, {type:'set_flow_pair',sellerState:'SP',customerState:'MG'});
    expect(state).toEqual({...DEFAULT_FILTERS,sellerState:'SP',customerState:'MG'});
    expect(filterReducer(state,{type:'clear_all'})).toEqual(DEFAULT_FILTERS);
  });
});

function mockResponse(json: unknown, ok = true, status = 200): Response {
  return {ok,status,json:async()=>json} as Response;
}

async function renderLoadedApp() {
  render(<App/>);
  await screen.findByText('Refine your view');
}

describe('WU-02 local loading and theme', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
      const suffix=input.split('/').pop();
      if(suffix==='orders.json')return mockResponse(orders);
      if(suffix==='items.json')return mockResponse(items);
      if(suffix==='metadata.json')return mockResponse(manifest);
      return mockResponse({},false,404);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads three local JSON assets, validates once, and defaults to dark mode', async () => {
    await renderLoadedApp();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(metricsText('kpi-indigo')).toBe('3');
    expect(screen.getByText('The numbers at a glance')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Switch to light theme'})).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => /\/(orders|items|metadata)\.json$/.test(url))).toHaveLength(3);
  });

  it('persists light theme independently of seller/category filters across remounts', async () => {
    const ui=render(<App/>);
    await screen.findByText('Refine your view');
    select('Seller origin','SP');
    expect(metricsText('kpi-indigo')).toBe('1');
    fireEvent.click(screen.getByRole('button',{name:'Switch to light theme'}));
    await waitFor(()=>expect(document.documentElement.dataset.theme).toBe('light'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(metricsText('kpi-indigo')).toBe('1');
    ui.unmount();
    await renderLoadedApp();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('button',{name:'Switch to dark theme'})).toBeInTheDocument();
  });

  it('reports missing JSON assets and retries without displaying false KPI zeros', async () => {
    vi.stubGlobal('fetch',vi.fn(async()=>mockResponse({},false,404)));
    render(<App/>);
    expect(await screen.findByText(/We couldn't open the local dataset/)).toBeInTheDocument();
    expect(screen.getByText(/python scripts\/prepare_data.py/)).toBeInTheDocument();
    expect(screen.queryByTestId('kpi-indigo')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Try loading again/})).toBeInTheDocument();
  });
});
