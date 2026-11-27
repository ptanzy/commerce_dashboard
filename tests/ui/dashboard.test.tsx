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
const metricsText = (testId: string): string => screen.getByTestId(testId).textContent ?? '';
function openFilters(){const button=screen.getByRole('button',{name:'Filters & Views'});if(button.getAttribute('aria-expanded')==='false')fireEvent.click(button);}

/** Native details/summary checkbox filters; opening one never erases other selected values. */
function choose(group: string, option: string) {
  const summary = screen.getByLabelText(group);
  const details = summary.closest('details');
  if (!details) throw new Error(`Missing details for ${group}`);
  if (!details.open) fireEvent.click(summary);
  fireEvent.click(screen.getByRole('checkbox',{name:`${group}: ${option}`}));
}

describe('WU-05 dashboard, multi-select and focused cohorts', () => {
  it('defaults to all valid history and preserves zero-item orders without duplicate order counts', () => {
    render(<DashboardContent dataset={dataset}/>);
    openFilters();
    expect(metricsText('kpi-indigo')).toBe('3');
    expect(metricsText('kpi-mint')).toBe('50.0%');
    expect(metricsText('kpi-amber')).toBe('5.5 days');
    expect(metricsText('kpi-blue')).toBe('16.3%');
    expect(screen.getByText(/All historical data · No filters applied/)).toBeInTheDocument();
    expect(within(screen.getByRole('region',{name:'Dashboard filters'})).getByRole('status')).toHaveTextContent('3 of 3 orders');
  });
  it('uses OR within selected origins and categories, AND across groups, with same-item matching', () => {
    render(<DashboardContent dataset={dataset}/>);
    openFilters();
    choose('Seller origins','SP · São Paulo');
    choose('Seller origins','RJ · Rio de Janeiro');
    expect(metricsText('kpi-indigo')).toBe('2');
    expect(screen.getByRole('button',{name:'Clear Origin: RJ filter'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Clear Origin: SP filter'})).toBeInTheDocument();
    choose('Product categories','Health Beauty');
    choose('Product categories','Books');
    expect(metricsText('kpi-indigo')).toBe('2');
    fireEvent.click(screen.getByRole('button',{name:'Clear Origin: RJ filter'}));
    expect(metricsText('kpi-indigo')).toBe('1');
    fireEvent.click(screen.getByRole('button',{name:'Clear Category: Health Beauty filter'}));
    expect(metricsText('kpi-indigo')).toBe('0'); // SP health, RJ books: no item matches SP+books
    expect(metricsText('kpi-mint')).toBe('N/A');
    expect(screen.getByText(/No matching orders/)).toBeInTheDocument();
  });
  it('searches the category menu without changing selected filter values', () => {
    render(<DashboardContent dataset={dataset}/>);
    openFilters();
    const summary=screen.getByLabelText('Product categories');
    fireEvent.click(summary);
    fireEvent.change(screen.getByRole('searchbox',{name:'Search product categories'}),{target:{value:'book'}});
    expect(screen.getByRole('checkbox',{name:'Product categories: Books'})).toBeInTheDocument();
    expect(screen.queryByRole('checkbox',{name:'Product categories: Health Beauty'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox',{name:'Product categories: Books'}));
    expect(screen.getByRole('button',{name:'Clear Category: Books filter'})).toBeInTheDocument();
    expect(metricsText('kpi-indigo')).toBe('1');
  });
  it('supports destination AND origin combinations, individually removable chips and reset', () => {
    render(<DashboardContent dataset={dataset}/>);
    openFilters();
    choose('Customer destinations','MG · Minas Gerais');
    choose('Seller origins','SP · São Paulo');
    expect(metricsText('kpi-indigo')).toBe('1');
    fireEvent.click(screen.getByRole('button',{name:'Clear Origin: SP filter'}));
    expect(screen.getByRole('checkbox',{name:'Customer destinations: MG · Minas Gerais'})).toBeChecked();
    fireEvent.click(screen.getByRole('button',{name:'Reset all'}));
    expect(metricsText('kpi-indigo')).toBe('3');
  });
  it('keeps date range inclusive and independent of a multi-select origin', () => {
    render(<DashboardContent dataset={dataset}/>);
    openFilters();
    choose('Seller origins','RJ · Rio de Janeiro');
    fireEvent.change(screen.getByLabelText('Purchase date from'),{target:{value:'2018-03-02'}});
    fireEvent.change(screen.getByLabelText('Purchase date to'),{target:{value:'2018-03-02'}});
    expect(metricsText('kpi-indigo')).toBe('1');
    fireEvent.click(screen.getByRole('button',{name:/Clear Date:/}));
    expect(metricsText('kpi-indigo')).toBe('2');
    expect(screen.getByRole('button',{name:'Clear Origin: RJ filter'})).toBeInTheDocument();
  });
  it('summarizes multiple focused flows in the filter bar while preserving per-flow Sankey controls', () => {
    render(<DashboardContent dataset={dataset}/>);
    openFilters();
    const choices = within(screen.getByRole('group',{name:'Focus a directed seller-to-customer state pair'}));
    fireEvent.click(choices.getByRole('button',{name:/SP.*MG.*1 items/}));
    fireEvent.click(choices.getByRole('button',{name:/RJ.*SP.*1 items/}));

    fireEvent.click(screen.getByRole('button',{name:/Filters Active/}));
    const filterBar = within(screen.getByRole('region',{name:'Dashboard filters'}));
    expect(filterBar.getByRole('button',{name:'Clear 2 focused flows filter'})).toBeInTheDocument();
    expect(filterBar.queryAllByRole('button',{name:/Clear Focused flow:/})).toHaveLength(0);
    expect(screen.getByRole('button',{name:'Remove focused flow SP→MG'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Remove focused flow RJ→SP'})).toBeInTheDocument();
    expect(metricsText('kpi-indigo')).toBe('2');

    // Summary clear removes only flow focus; global filter selections must survive.
    choose('Seller origins','SP · São Paulo');
    expect(filterBar.getByRole('button',{name:'Clear Origin: SP filter'})).toBeInTheDocument();
    expect(filterBar.getByRole('button',{name:'Clear 1 focused flow filter'})).toBeInTheDocument();
    fireEvent.click(filterBar.getByRole('button',{name:'Clear 1 focused flow filter'}));
    expect(filterBar.queryByRole('button',{name:/Clear \d+ focused flow/})).not.toBeInTheDocument();
    expect(filterBar.getByRole('button',{name:'Clear Origin: SP filter'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Remove focused flow SP→MG'})).not.toBeInTheDocument();
    expect(metricsText('kpi-indigo')).toBe('1');
  });
  it('focus action never replaces global multi-selects, toggles, and clears when invalidated', () => {
    const first=filterReducer(DEFAULT_FILTERS,{type:'toggle_value',dimension:'sellerStates',value:'SP'});
    const both=filterReducer(first,{type:'toggle_value',dimension:'sellerStates',value:'RJ'});
    const focused=filterReducer(both,{type:'focus_flow',sellerState:'SP',customerState:'MG'});
    expect(focused.sellerStates).toEqual(['RJ','SP']);
    expect(focused.focusedFlows).toEqual([{sellerState:'SP',customerState:'MG'}]);
    expect(filterReducer(focused,{type:'focus_flow',sellerState:'SP',customerState:'MG'}).focusedFlows).toEqual([]);
    expect(filterReducer(focused,{type:'toggle_value',dimension:'sellerStates',value:'SP'}).focusedFlows).toEqual([]);
    expect(filterReducer(focused,{type:'clear_all'})).toEqual(DEFAULT_FILTERS);
  });
});

function mockResponse(json: unknown, ok = true, status = 200): Response {
  return {ok,status,json:async()=>json} as Response;
}
async function renderLoadedApp() { render(<App/>); await screen.findByRole('button',{name:'Filters & Views'});openFilters(); }

describe('WU-02 loading and theme retained under WU-05', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
      const suffix=String(input).split('/').pop();
      if(suffix==='orders.json')return mockResponse(orders);
      if(suffix==='items.json')return mockResponse(items);
      if(suffix==='metadata.json')return mockResponse(manifest);
      return mockResponse({},false,404);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());
  it('loads local JSON and defaults to dark mode', async () => {
    await renderLoadedApp();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(metricsText('kpi-indigo')).toBe('3');
    expect(screen.getByRole('button',{name:'Switch to light theme'})).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => /\/(orders|items|metadata)\.json$/.test(String(url)))).toHaveLength(3);
  });
  it('persists light mode without disturbing chosen origins', async () => {
    const ui=render(<App/>);
    await screen.findByRole('button',{name:'Filters & Views'});openFilters();
    choose('Seller origins','SP · São Paulo');
    expect(metricsText('kpi-indigo')).toBe('1');
    fireEvent.click(screen.getByRole('button',{name:'Switch to light theme'}));
    await waitFor(()=>expect(document.documentElement.dataset.theme).toBe('light'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(metricsText('kpi-indigo')).toBe('1');
    ui.unmount();
    await renderLoadedApp();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
  it('shows a useful error without false zeros when data files are missing', async () => {
    vi.stubGlobal('fetch',vi.fn(async()=>mockResponse({},false,404)));
    render(<App/>);
    expect(await screen.findByText(/We couldn't open the local dataset/)).toBeInTheDocument();
    expect(screen.queryByTestId('kpi-indigo')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Try loading again/})).toBeInTheDocument();
  });
});
