// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DashboardContent } from '../../src/app/App';
import { DashboardSections } from '../../src/app/DashboardSections';
import { defaultDashboardDefinition, DASHBOARD_SECTION_IDS, DASHBOARD_STORAGE_KEY } from '../../src/domain/dashboardWorkspace';
import { filterReducer } from '../../src/app/filterReducer';
import { selectCohort, selectFocusedFlowCohort, computeMetrics } from '../../src/domain/selectors';
import { DEFAULT_FILTERS } from '../../src/domain/types';
import { dataset } from './fixtures';

afterEach(()=>{ cleanup(); window.localStorage.clear();window.sessionStorage.clear();sessionStorage.clear(); vi.restoreAllMocks(); });

function openEditor(){return expandWorkspace();}

function toggle(editor: ReturnType<typeof within>,name:string){fireEvent.click(editor.getByRole('checkbox',{name}));}

function expandWorkspace(){
  const expand=screen.queryByRole('button',{name:'Expand Dashboard Workspace'});
  if(expand) fireEvent.click(expand);
  return within(screen.getByRole('list',{name:'Section order'}));
}

describe('WU-11 Phase 2 conditional section rendering',()=>{
  it('starts with the original eight visible panels and has no implicit workspace writes',()=>{
    render(<DashboardContent dataset={dataset}/>);
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('3');
    expect(screen.getByRole('heading',{name:'Geographic distribution'})).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Delivery trends'})).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Product category leaderboard'})).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Delivery timing distribution'})).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:/order explorer/i})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Expand Dashboard Workspace'})).toHaveAttribute('aria-expanded','false');
    expect(localStorage.getItem(DASHBOARD_STORAGE_KEY)).toBeNull();
  });

  it('unmounts hidden charts and their controls while keeping the remaining panels, filters and diagnostics',()=>{
    render(<DashboardContent dataset={dataset}/>);
    const editor=openEditor();
    toggle(editor,'Geographic distribution');
    expect(editor.getByRole('checkbox',{name:'Geographic distribution'})).not.toBeChecked();
    expect(screen.queryByRole('group',{name:'Map measurement'})).not.toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'Geographic distribution'})).not.toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Delivery trends'})).toBeInTheDocument();
    expect(screen.getByRole('group',{name:'Sankey measurement'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Filters & Views'}));
    expect(screen.getByRole('region',{name:'Dashboard filters'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Export filtered orders/})).toBeInTheDocument();
    toggle(editor,'Geographic distribution');
    expect(screen.getByRole('heading',{name:'Geographic distribution'})).toBeInTheDocument();
    expect(editor.getByRole('checkbox',{name:'Geographic distribution'})).toBeChecked();
    expect(localStorage.getItem(DASHBOARD_STORAGE_KEY)).toBeNull();
  });

  it('keeps directed flow focus and matching KPI calculations when the Sankey is unmounted',()=>{
    render(<DashboardContent dataset={dataset}/>);
    const flows=within(screen.getByRole('group',{name:'Focus a directed seller-to-customer state pair'}));
    fireEvent.click(flows.getByRole('button',{name:/SP.*MG.*1 items/}));
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
    const editor=openEditor();
    toggle(editor,'Shipping Sankey');
    expect(screen.queryByRole('group',{name:'Sankey measurement'})).not.toBeInTheDocument();
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button',{name:'Filters & Views'}));
    expect(screen.getByRole('button',{name:'Clear 1 focused flow filter'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/Filters Active/}));
    const summary=within(screen.getByRole('region',{name:'Active dashboard filter context'}));
    expect(summary.getByRole('button',{name:'Remove active flow filter SP→MG'})).toBeInTheDocument();
    // The summary is still actionable while Sankey is hidden; restoring the
    // chart exposes a separately labeled, chart-local removal control.
    toggle(editor,'Shipping Sankey');
    expect(screen.getByRole('group',{name:'Sankey measurement'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Remove focused flow SP→MG'})).toBeInTheDocument();
  });

  it('supports the all-hidden state without losing global services, and restores the default',()=>{
    render(<DashboardContent dataset={dataset}/>);
    const editor=openEditor();
    for(const label of ['Executive KPIs','Previous-period comparison','Geographic distribution','Delivery trends','Shipping Sankey','Category leaderboard','Delivery timing distribution','Order Explorer']) toggle(editor,label);
    expect(screen.getByRole('heading',{name:'No analytical sections are visible'})).toBeInTheDocument();
    expect(screen.queryByTestId('kpi-indigo')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'Beyond the numbers'})).not.toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'Explore the details'})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Export filtered orders/})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Filters & Views'}));
    expect(screen.getByRole('region',{name:'Dashboard filters'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Show all sections'}));
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('3');
    expect(screen.queryByRole('heading',{name:'No analytical sections are visible'})).not.toBeInTheDocument();
    expect(editor.getAllByRole('checkbox').every(box=>(box as HTMLInputElement).checked)).toBe(true);
  });

  it('restores all panels on remount because this phase has preview-only changes',()=>{
    const first=render(<DashboardContent dataset={dataset}/>);
    const editor=openEditor();
    toggle(editor,'Executive KPIs');
    expect(screen.queryByTestId('kpi-indigo')).not.toBeInTheDocument();
    first.unmount();
    render(<DashboardContent dataset={dataset}/>);
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('3');
    expect(localStorage.getItem(DASHBOARD_STORAGE_KEY)).toBeNull();
  });

  it('keeps the saved section order, even when sections cross original group boundaries',()=>{
    const first=defaultDashboardDefinition();
    first.layout.sectionOrder=[...DASHBOARD_SECTION_IDS].reverse();
    first.layout.hiddenSections=['geographicDistribution','deliveryTrends','shippingSankey','categoryLeaderboard','delayDistribution'];
    const global=selectCohort(dataset.index,DEFAULT_FILTERS);
    const cohort=selectFocusedFlowCohort(global,[]);
    const {container}=render(<DashboardSections definition={first} dataset={dataset} contextCohort={global} cohort={cohort}
      metrics={computeMetrics(cohort)} analyticalFilters={DEFAULT_FILTERS} selectionFilters={DEFAULT_FILTERS} dispatch={action=>filterReducer(DEFAULT_FILTERS,action)}/>);
    expect([...container.querySelectorAll('[data-dashboard-section]')].map(el=>el.getAttribute('data-dashboard-section'))).toEqual(['orderExplorer','periodComparison','kpis']);
    expect(screen.getByRole('heading',{name:'Previous-period comparison'})).toBeInTheDocument();
  });
});
