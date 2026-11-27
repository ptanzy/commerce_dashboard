// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {DashboardContent} from '../../src/app/App';
import {defaultDashboardDefinition,LEGACY_DASHBOARD_SECTION_IDS,DASHBOARD_STORAGE_KEY} from '../../src/domain/dashboardWorkspace';
import {dataset,orders as fixtureOrders} from './fixtures';
import {ShippingCorridorScorecardPanel} from '../../src/components/OperationalPanels';
import {buildDataIndex} from '../../src/data/indexes';
import {selectCohort} from '../../src/domain/selectors';
import {DEFAULT_FILTERS} from '../../src/domain/types';
import type {OrderFact,ItemFact} from '../../src/domain/types';

afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();vi.restoreAllMocks();});
const openEditor=()=>{const expand=screen.queryByRole('button',{name:'Expand Dashboard Workspace'});if(expand)fireEvent.click(expand);return within(screen.getByRole('list',{name:'Section order'}));};

describe('OE-2 operational panels',()=>{
  it('renders both new sections by default and reports unavailable legacy milestones without fabricating durations',()=>{
    render(<DashboardContent dataset={dataset}/>);
    expect(screen.getByRole('heading',{name:'Fulfillment lifecycle'})).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Shipping corridor scorecard'})).toBeInTheDocument();
    expect(screen.getByText(/Approval and carrier-handoff timestamps are not in this export/)).toBeInTheDocument();
    expect(within(screen.getByRole('table',{name:'Shipping corridor performance scorecard'})).getAllByRole('row')).toHaveLength(4);
    expect(screen.getByRole('region',{name:'Dashboard workspace manager'})).toHaveTextContent('12 of 12 panels visible');
  });
  it('filters corridor rows locally, and focuses an exact flow without narrowing scorecard context',()=>{
    render(<DashboardContent dataset={dataset}/>);
    const search=screen.getByRole('searchbox',{name:'Find shipping corridor'});
    fireEvent.change(search,{target:{value:'SP MG'}});
    const table=within(screen.getByRole('table',{name:'Shipping corridor performance scorecard'}));
    expect(table.getAllByRole('row')).toHaveLength(2);
    fireEvent.click(table.getByRole('button',{name:'Focus shipping corridor SP to MG'}));
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
    expect(screen.getByText('3 directed corridors')).toBeInTheDocument();
    expect(table.getByRole('button',{name:'Clear shipping corridor SP to MG'})).toHaveAttribute('aria-pressed','true');
  });
  it('can independently hide and restore each operational section in the workspace editor',()=>{
    render(<DashboardContent dataset={dataset}/>);
    const editor=openEditor();
    fireEvent.click(editor.getByRole('checkbox',{name:'Fulfillment lifecycle'}));
    expect(screen.queryByRole('heading',{name:'Fulfillment lifecycle'})).not.toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Shipping corridor scorecard'})).toBeInTheDocument();
    fireEvent.click(editor.getByRole('checkbox',{name:'Shipping corridor scorecard'}));
    expect(screen.queryByRole('heading',{name:'Shipping corridor scorecard'})).not.toBeInTheDocument();
    fireEvent.click(editor.getByRole('checkbox',{name:'Fulfillment lifecycle'}));
    expect(screen.getByRole('heading',{name:'Fulfillment lifecycle'})).toBeInTheDocument();
  });
  it('defaults corridor rows to 10, changes the page size, paginates deterministically, and exposes sortable column state',()=>{
    const origins=['SP','RJ','MG']; const destinations=['PR','SC','RS','BA','GO','ES','SP','MG','AM','PA'];
    const syntheticOrders:OrderFact[]=[];const syntheticItems:ItemFact[]=[];
    for(const sellerState of origins)for(const customerState of destinations){
      const id=`${sellerState}-${customerState}`;
      syntheticOrders.push({...fixtureOrders[0],orderId:id,customerState,itemCount:1});
      syntheticItems.push({orderId:id,orderItemId:1,sellerId:`seller-${sellerState}`,sellerState,customerState,category:'test',priceBRL:25,freightChargeBRL:5});
    }
    const cohort=selectCohort(buildDataIndex(syntheticOrders,syntheticItems),DEFAULT_FILTERS);
    const dispatch=vi.fn();
    render(<ShippingCorridorScorecardPanel cohort={cohort} selectionFilters={DEFAULT_FILTERS} dispatch={dispatch}/>);
    const table=within(screen.getByRole('table',{name:'Shipping corridor performance scorecard'}));
    expect(table.getAllByRole('row')).toHaveLength(11);
    fireEvent.change(screen.getByRole('combobox',{name:'Shipping corridor rows per page'}),{target:{value:'25'}});
    expect(table.getAllByRole('row')).toHaveLength(26);
    fireEvent.click(screen.getByRole('button',{name:'Next'}));
    expect(table.getAllByRole('row')).toHaveLength(6);
    fireEvent.click(table.getByRole('button',{name:'Sort by Median'}));
    expect(table.getByRole('columnheader',{name:/Median/})).toHaveAttribute('aria-sort','ascending');
    expect(table.getAllByRole('row')).toHaveLength(26);
  });
  it('migrates an eight-panel saved workspace without suddenly showing new modules',()=>{
    const base=defaultDashboardDefinition();
    const legacy={...base,id:'legacy',name:'Prior Work',updatedAt:'2026-11-26T20:00:00.000Z',
      layout:{sectionOrder:[...LEGACY_DASHBOARD_SECTION_IDS],hiddenSections:['shippingSankey'],filterPanelVisible:true}};
    localStorage.setItem(DASHBOARD_STORAGE_KEY,JSON.stringify({schemaVersion:1,activeDashboardId:'legacy',dashboards:[legacy]}));
    render(<DashboardContent dataset={dataset}/>);
    expect(screen.queryByRole('heading',{name:'Fulfillment lifecycle'})).not.toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'Shipping corridor scorecard'})).not.toBeInTheDocument();
    expect(openEditor().getByRole('checkbox',{name:'Fulfillment lifecycle'})).not.toBeChecked();
    expect(screen.getByRole('combobox',{name:'Current dashboard'})).toHaveValue('legacy');
  });
});
