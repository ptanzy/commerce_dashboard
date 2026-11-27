// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DashboardContent } from '../../src/app/App';
import { DASHBOARD_STORAGE_KEY } from '../../src/domain/dashboardWorkspace';
import { dataset } from './fixtures';

afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();vi.restoreAllMocks();});
const sectionIds=()=>[...document.querySelectorAll<HTMLElement>('[data-dashboard-section]')].map(node=>node.dataset.dashboardSection);
const orderList=()=>within(screen.getByRole('list',{name:'Section order'}));
function editor(){
  expandWorkspace();
}
function create(name='Delivery Focus'){
  expandWorkspace();
  fireEvent.click(screen.getByRole('button',{name:'New'}));
  fireEvent.change(screen.getByRole('textbox',{name:'New dashboard name'}),{target:{value:name}});
  fireEvent.click(screen.getByRole('button',{name:'Create dashboard'}));
}
function selectMetric(group:string,name:string){
  fireEvent.click(within(screen.getByRole('group',{name:group})).getByRole('button',{name}));
}
function expectSelected(group:string,name:string){
  expect(within(screen.getByRole('group',{name:group})).getByRole('button',{name})).toHaveAttribute('aria-pressed','true');
}

function expandWorkspace(){
  const expand=screen.queryByRole('button',{name:'Expand Dashboard Workspace'});
  if(expand) fireEvent.click(expand);
  return within(screen.getByRole('list',{name:'Section order'}));
}

describe('WU-11 Phase 4 section ordering and view preference restoration',()=>{
  it('moves sections using keyboard-accessible buttons without altering filters, and persists the order',()=>{
    const first=render(<DashboardContent dataset={dataset}/>);
    create();editor();
    const initial=sectionIds();
    expect(initial.indexOf('deliveryTrends')).toBeGreaterThan(initial.indexOf('geographicDistribution'));
    fireEvent.click(orderList().getByRole('button',{name:'Move Delivery trends up'}));
    const next=sectionIds();
    expect(next.indexOf('deliveryTrends')).toBeLessThan(next.indexOf('geographicDistribution'));
    expect(screen.getByRole('button',{name:'Save'})).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{name:'Save'}));
    const saved=JSON.parse(localStorage.getItem(DASHBOARD_STORAGE_KEY)!);
    expect(saved.dashboards[0].layout.sectionOrder.indexOf('deliveryTrends'))
      .toBeLessThan(saved.dashboards[0].layout.sectionOrder.indexOf('geographicDistribution'));
    first.unmount();
    render(<DashboardContent dataset={dataset}/>);
    expect(sectionIds().indexOf('deliveryTrends')).toBeLessThan(sectionIds().indexOf('geographicDistribution'));
  });

  it('remembers map, Sankey, trends, and category preferences across hide/show and reload',()=>{
    const first=render(<DashboardContent dataset={dataset}/>);
    create('Analyst');
    selectMetric('Map geography view','Destinations');
    selectMetric('Map measurement','Median delivery');
    selectMetric('Sankey measurement','Freight charged');
    selectMetric('Monthly trend metric','On-time rate');
    selectMetric('Category ranking measurement','Item value');
    editor();
    const visibility=within(screen.getByRole('list',{name:'Section order'}));
    fireEvent.click(visibility.getByRole('checkbox',{name:'Geographic distribution'}));
    expect(screen.queryByRole('group',{name:'Map measurement'})).not.toBeInTheDocument();
    fireEvent.click(visibility.getByRole('checkbox',{name:'Geographic distribution'}));
    expectSelected('Map geography view','Destinations');
    expectSelected('Map measurement','Median delivery');
    fireEvent.click(screen.getByRole('button',{name:'Save'}));
    const saved=JSON.parse(localStorage.getItem(DASHBOARD_STORAGE_KEY)!);
    expect(saved.dashboards[0].analysis.views).toEqual({
      geographic:{mode:'destination',metric:'median'},
      sankey:{measure:'freight'}, trends:{measure:'onTime'}, category:{measure:'value'},
    });
    first.unmount();render(<DashboardContent dataset={dataset}/>);
    expectSelected('Map geography view','Destinations');
    expectSelected('Map measurement','Median delivery');
    expectSelected('Sankey measurement','Freight charged');
    expectSelected('Monthly trend metric','On-time rate');
    expectSelected('Category ranking measurement','Item value');
  });

  it('discard reverts unsaved chart preferences and ordering on a named dashboard',()=>{
    render(<DashboardContent dataset={dataset}/>);
    create();
    selectMetric('Map measurement','Median delivery');
    editor();
    fireEvent.click(orderList().getByRole('button',{name:'Move Shipping Sankey up'}));
    expect(screen.getByRole('button',{name:'Save'})).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{name:'Discard changes'}));
    expectSelected('Map measurement','Order volume');
    expect(orderList().getByRole('button',{name:'Move Shipping Sankey up'})).toBeEnabled();
    expect(screen.getByText('Saved configuration')).toBeInTheDocument();
  });

  it('switches between saved dashboards with independent chart choices',()=>{
    render(<DashboardContent dataset={dataset}/>);
    create('Destination dashboard');
    selectMetric('Map geography view','Destinations');
    selectMetric('Map measurement','On-time rate');
    fireEvent.click(screen.getByRole('button',{name:'Save'}));
    const firstId=JSON.parse(localStorage.getItem(DASHBOARD_STORAGE_KEY)!).activeDashboardId;
    fireEvent.change(screen.getByRole('combobox',{name:'Current dashboard'}),{target:{value:'full-dashboard'}});
    expectSelected('Map geography view','Seller origins');
    expectSelected('Map measurement','Order volume');
    fireEvent.change(screen.getByRole('combobox',{name:'Current dashboard'}),{target:{value:firstId}});
    expectSelected('Map geography view','Destinations');
    expectSelected('Map measurement','On-time rate');
  });
});
