// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {DashboardContent} from '../../src/app/App';
import {DASHBOARD_STORAGE_KEY} from '../../src/domain/dashboardWorkspace';
import {dataset} from './fixtures';

afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();vi.restoreAllMocks();});
function openWorkspace(){const b=screen.queryByRole('button',{name:'Expand Dashboard Workspace'});if(b)fireEvent.click(b);}
function create(name:string){openWorkspace();fireEvent.click(screen.getByRole('button',{name:'New'}));
 fireEvent.change(screen.getByRole('textbox',{name:'New dashboard name'}),{target:{value:name}});
 fireEvent.click(screen.getByRole('button',{name:'Create dashboard'}));}
function setSize(name:string,size:number){fireEvent.change(screen.getByRole('combobox',{name}),{target:{value:String(size)}});}
const pageSize=(name:string)=>screen.getByRole('combobox',{name});

describe('Dashboard table pagination preferences',()=>{
 it('shows compact 10-row defaults and all supported choices in every available table',()=>{
   render(<DashboardContent dataset={dataset}/>);
   for(const name of ['Order Explorer rows per page','Shipping corridor rows per page','Seller rows per page']){
     expect(pageSize(name)).toHaveValue('10');
     expect(within(pageSize(name)).getAllByRole('option').map(o=>(o as HTMLOptionElement).value)).toEqual(['10','25','50','100']);
   }
   // The Customer Experience segment table is only available once reviews are imported.
   expect(localStorage.getItem(DASHBOARD_STORAGE_KEY)).toBeNull();
 });
 it('persists independent per-table preferences only when saving a custom dashboard',()=>{
   render(<DashboardContent dataset={dataset}/>);
   create('Long Tables');
   setSize('Order Explorer rows per page',25);
   setSize('Shipping corridor rows per page',50);
   setSize('Seller rows per page',100);
   expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
   expect(JSON.parse(localStorage.getItem(DASHBOARD_STORAGE_KEY)!).dashboards[0].analysis.tablePageSizes.orderExplorer).toBe(10);
   fireEvent.click(screen.getByRole('button',{name:'Save'}));
   const saved=JSON.parse(localStorage.getItem(DASHBOARD_STORAGE_KEY)!).dashboards[0];
   expect(saved.analysis.tablePageSizes).toEqual({orderExplorer:25,shippingCorridorScorecard:50,sellerPerformance:100,customerExperience:10});
   expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
   setSize('Order Explorer rows per page',100);
   fireEvent.click(screen.getByRole('button',{name:'Discard changes'}));
   expect(pageSize('Order Explorer rows per page')).toHaveValue('25');
 });
 it('restores different saved sizes after switching dashboards',()=>{
   render(<DashboardContent dataset={dataset}/>);
   create('Alpha');
   setSize('Seller rows per page',50);fireEvent.click(screen.getByRole('button',{name:'Save'}));
   const firstId=JSON.parse(localStorage.getItem(DASHBOARD_STORAGE_KEY)!).activeDashboardId;
   create('Beta');
   expect(pageSize('Seller rows per page')).toHaveValue('50'); // New clones current state
   setSize('Seller rows per page',25);fireEvent.click(screen.getByRole('button',{name:'Save'}));
   fireEvent.change(screen.getByRole('combobox',{name:'Current dashboard'}),{target:{value:firstId}});
   expect(pageSize('Seller rows per page')).toHaveValue('50');
 });
});
