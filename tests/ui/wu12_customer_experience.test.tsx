// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {DashboardContent} from '../../src/app/App';
import {CustomerExperiencePanel} from '../../src/components/CustomerExperiencePanel';
import {defaultDashboardDefinition,DASHBOARD_STORAGE_KEY,ELEVEN_SECTION_IDS} from '../../src/domain/dashboardWorkspace';
import {buildDataIndex} from '../../src/data/indexes';
import {selectCohort} from '../../src/domain/selectors';
import {DEFAULT_FILTERS} from '../../src/domain/types';
import {dataset as base,orders,items} from './fixtures';
import type {DashboardDataset} from '../../src/data/loader';

const enriched:DashboardDataset={
  manifest:{...base.manifest,reviewsAvailable:true,reviewCount:4,reviewedOrderCount:3},
  index:buildDataIndex([
    {...orders[0],reviewScoreCounts:[0,0,0,0,2]},
    {...orders[1],reviewScoreCounts:[1,0,0,0,0]},
    {...orders[2],reviewScoreCounts:[0,0,1,0,0]},
  ],items),
};
afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();vi.restoreAllMocks();});
const openEditor=()=>{const expand=screen.queryByRole('button',{name:'Expand Dashboard Workspace'});if(expand)fireEvent.click(expand);
 return within(screen.getByRole('list',{name:'Section order'}));};

describe('OE-4 customer experience & satisfaction',()=>{
 it('shows a truthful review-data-unavailable message on the legacy export without invented scores',()=>{
   render(<DashboardContent dataset={base}/>);
   expect(screen.getByRole('heading',{name:'Customer experience & satisfaction'})).toBeInTheDocument();
   expect(screen.getByText(/Customer review data is not included in this export/)).toBeInTheDocument();
   expect(screen.queryByRole('region',{name:'Review score distribution'})).not.toBeInTheDocument();
   expect(screen.getByRole('region',{name:'Dashboard workspace manager'})).toHaveTextContent('12 of 12 panels visible');
 });
 it('uses distinct reviewed orders, individual-review histogram and all outcomes',()=>{
   render(<DashboardContent dataset={enriched}/>);
   const panel=within(screen.getByRole('region',{name:'Review score distribution'}));
   expect(panel.getByRole('img',{name:'5 stars: 2 reviews'})).toBeInTheDocument();
   expect(screen.getByText('3 reviewed orders')).toBeInTheDocument();
   const ratings=within(screen.getByRole('region',{name:'Review scores by delivery outcome'}));
   expect(ratings.getByText('Unknown / undelivered')).toBeInTheDocument();
   expect(ratings.getByText('Late')).toBeInTheDocument();
   expect(screen.getByText(/4 valid reviews/)).toBeInTheDocument();
   // Reviewed-order scorecards expose the same bounded pagination choices.
   const segments=within(screen.getByRole('region',{name:'Satisfaction segments'}));
   expect(segments.getByRole('combobox',{name:'Customer satisfaction rows per page'})).toHaveValue('10');
   fireEvent.change(segments.getByRole('combobox',{name:'Customer satisfaction rows per page'}),{target:{value:'50'}});
   expect(segments.getByRole('combobox',{name:'Customer satisfaction rows per page'})).toHaveValue('50');
 });
 it('searches and switches satisfaction segments without modifying the dashboard cohort',()=>{
   render(<DashboardContent dataset={enriched}/>);
   const section=within(screen.getByRole('region',{name:'Satisfaction segments'}));
   fireEvent.change(section.getByRole('combobox',{name:'Minimum reviewed orders'}),{target:{value:'1'}});
   fireEvent.click(section.getByRole('button',{name:'Shipping corridors'}));
   fireEvent.change(section.getByRole('searchbox',{name:'Find satisfaction segment'}),{target:{value:'RJ'}});
   const table=within(section.getByRole('table',{name:'Customer satisfaction segment scorecard'}));
   expect(table.getAllByRole('row')).toHaveLength(3);
   fireEvent.click(section.getByRole('button',{name:'Sellers'}));
   expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('3');
   expect(section.getByRole('button',{name:'Sellers'})).toHaveAttribute('aria-pressed','true');
 });
 it('hides and restores customer experience without touching filter settings',()=>{
   render(<DashboardContent dataset={enriched}/>);
   const editor=openEditor();
   fireEvent.click(editor.getByRole('checkbox',{name:'Customer experience & satisfaction'}));
   expect(screen.queryByRole('heading',{name:'Customer experience & satisfaction'})).not.toBeInTheDocument();
   fireEvent.click(editor.getByRole('checkbox',{name:'Customer experience & satisfaction'}));
   expect(screen.getByRole('heading',{name:'Customer experience & satisfaction'})).toBeInTheDocument();
   expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('3');
 });
 it('loads an eleven-section custom dashboard with customer experience hidden until explicitly enabled',()=>{
   const full=defaultDashboardDefinition();
   const legacy={...full,id:'prior-eleven',name:'Eleven',updatedAt:'2026-11-27T13:00:00.000Z',
     layout:{sectionOrder:[...ELEVEN_SECTION_IDS],hiddenSections:['deliveryTrends'],filterPanelVisible:true}};
   const original=JSON.stringify({schemaVersion:1,activeDashboardId:'prior-eleven',dashboards:[legacy]});
   localStorage.setItem(DASHBOARD_STORAGE_KEY,original);
   render(<DashboardContent dataset={enriched}/>);
   expect(screen.queryByRole('heading',{name:'Customer experience & satisfaction'})).not.toBeInTheDocument();
   expect(openEditor().getByRole('checkbox',{name:'Customer experience & satisfaction'})).not.toBeChecked();
   expect(localStorage.getItem(DASHBOARD_STORAGE_KEY)).toBe(original);
 });
 it('suppresses misleading segment rankings for empty review selections',()=>{
   const unreviewed=buildDataIndex(orders,items);
   render(<CustomerExperiencePanel cohort={selectCohort(unreviewed,DEFAULT_FILTERS)} reviewsAvailable={true}/>);
   expect(screen.getByText(/No reviewed orders in this selection/)).toBeInTheDocument();
   expect(screen.queryByRole('table',{name:'Customer satisfaction segment scorecard'})).not.toBeInTheDocument();
 });
});
