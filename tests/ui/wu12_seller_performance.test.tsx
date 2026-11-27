// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {DashboardContent} from '../../src/app/App';
import {SellerPerformancePanel} from '../../src/components/SellerPerformancePanel';
import {defaultDashboardDefinition,DASHBOARD_STORAGE_KEY,TEN_SECTION_IDS} from '../../src/domain/dashboardWorkspace';
import {buildDataIndex} from '../../src/data/indexes';
import {selectCohort} from '../../src/domain/selectors';
import {DEFAULT_FILTERS} from '../../src/domain/types';
import {dataset,orders as fixtureOrders} from './fixtures';
import type {ItemFact,OrderFact} from '../../src/domain/types';
afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();vi.restoreAllMocks();});
const openEditor=()=>{const expand=screen.queryByRole('button',{name:'Expand Dashboard Workspace'});if(expand)fireEvent.click(expand);return within(screen.getByRole('list',{name:'Section order'}));};
describe('OE-3 seller performance',()=>{
 it('shows a seller-specific panel with explicit multi-seller and unavailable-handoff caveats',()=>{
  render(<DashboardContent dataset={dataset}/>);
  expect(screen.getByRole('heading',{name:'Seller performance'})).toBeInTheDocument();
  const table=within(screen.getByRole('table',{name:'Seller performance scorecard'}));
  expect(table.getAllByRole('row')).toHaveLength(3);
  expect(screen.getByText(/Approval\/carrier-handoff milestones are not exported/)).toBeInTheDocument();
  expect(screen.getByText(/Orders involving multiple sellers are included/)).toBeInTheDocument();
  expect(screen.getByRole('region',{name:'Dashboard workspace manager'})).toHaveTextContent('12 of 12 panels visible');
 });
 it('searches seller IDs, sorts independently, opens detail, and never changes KPI cohort',()=>{
  render(<DashboardContent dataset={dataset}/>);
  const search=screen.getByRole('searchbox',{name:'Find seller'});
  fireEvent.change(search,{target:{value:'seller-sp'}});
  const table=within(screen.getByRole('table',{name:'Seller performance scorecard'}));
  expect(table.getAllByRole('row')).toHaveLength(2);
  fireEvent.click(table.getByRole('button',{name:'Inspect seller seller-sp'}));
  expect(screen.getByRole('region',{name:'Seller seller-sp details'})).toHaveTextContent('multi-seller orders');
  expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('3');
  fireEvent.click(table.getByRole('button',{name:'Sort sellers by On-time'}));
  expect(table.getByRole('columnheader',{name:/On-time/})).toHaveAttribute('aria-sort','descending');
  fireEvent.click(table.getByRole('button',{name:'Close seller seller-sp'}));
  expect(screen.queryByRole('region',{name:'Seller seller-sp details'})).not.toBeInTheDocument();
 });
 it('defaults to 10 seller rows and allows 25-row pagination without mounting every seller',()=>{
  const generatedOrders:OrderFact[]=[];const generatedItems:ItemFact[]=[];
  for(let i=0;i<27;i++){
   const id=`seller-order-${i}`;
   generatedOrders.push({...fixtureOrders[0],orderId:id});
   generatedItems.push({orderId:id,orderItemId:1,sellerId:`seller-${String(i).padStart(2,'0')}`,sellerState:'SP',customerState:'MG',category:'books',priceBRL:50,freightChargeBRL:5});
  }
  const index=buildDataIndex(generatedOrders,generatedItems);
  render(<SellerPerformancePanel cohort={selectCohort(index,DEFAULT_FILTERS)} allItems={index.items}/>);
  const table=within(screen.getByRole('table',{name:'Seller performance scorecard'}));
  expect(table.getAllByRole('row')).toHaveLength(11);
  fireEvent.change(screen.getByRole('combobox',{name:'Seller rows per page'}),{target:{value:'25'}});
  expect(table.getAllByRole('row')).toHaveLength(26);
  fireEvent.click(screen.getByRole('button',{name:'Next'}));
  expect(table.getAllByRole('row')).toHaveLength(3);
 });
 it('can hide, restore and reorder seller panel without changing shared filters',()=>{
  render(<DashboardContent dataset={dataset}/>);
  const editor=openEditor();
  fireEvent.click(editor.getByRole('checkbox',{name:'Seller performance'}));
  expect(screen.queryByRole('heading',{name:'Seller performance'})).not.toBeInTheDocument();
  fireEvent.click(editor.getByRole('checkbox',{name:'Seller performance'}));
  expect(screen.getByRole('heading',{name:'Seller performance'})).toBeInTheDocument();
  fireEvent.click(editor.getByRole('button',{name:'Move Seller performance up'}));
  expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('3');
 });
 it('loads an older ten-section dashboard with seller panel hidden, preserving the prior layout',()=>{
  const full=defaultDashboardDefinition();
  const legacy={...full,id:'prior-ten',name:'Prior ten',updatedAt:'2026-11-27T12:00:00.000Z',
   layout:{sectionOrder:[...TEN_SECTION_IDS],hiddenSections:['deliveryTrends'],filterPanelVisible:true}};
  localStorage.setItem(DASHBOARD_STORAGE_KEY,JSON.stringify({schemaVersion:1,activeDashboardId:'prior-ten',dashboards:[legacy]}));
  render(<DashboardContent dataset={dataset}/>);
  expect(screen.queryByRole('heading',{name:'Seller performance'})).not.toBeInTheDocument();
  expect(openEditor().getByRole('checkbox',{name:'Seller performance'})).not.toBeChecked();
  expect(screen.getByRole('combobox',{name:'Current dashboard'})).toHaveValue('prior-ten');
  expect(JSON.parse(localStorage.getItem(DASHBOARD_STORAGE_KEY)!).dashboards[0].layout.sectionOrder).toHaveLength(10);
 });
});
