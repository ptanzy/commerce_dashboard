// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {DashboardContent} from '../../src/app/App';
import {dataset} from './fixtures';
import {BRAZIL_STATES} from '../../src/components/stateNames';
import {SAVED_VIEWS_KEY} from '../../src/domain/savedViews';

const codes=Object.keys(BRAZIL_STATES).sort();
const topology={type:'Topology',transform:{scale:[0.001,0.001],translate:[-75,-34]},
  objects:{estados:{type:'GeometryCollection',geometries:codes.map((id,i)=>({type:'Polygon',id,properties:{SIGLA:id},arcs:[[i]]}))}},
  arcs:codes.map((_,i)=>[[i*8,0],[5,0],[0,5],[-5,0],[0,-5]])};
beforeEach(()=>vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>topology} as Response))));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();window.localStorage.clear();});

describe('WU-07 advanced exploration',()=>{
  it('focuses multiple exact directed flows through the accessible flow list, without shrinking the Sankey',()=>{
    render(<DashboardContent dataset={dataset}/>);
    const choices=within(screen.getByRole('group',{name:'Focus a directed seller-to-customer state pair'}));
    const count=choices.getAllByRole('button').length;
    const first=choices.getByRole('button',{name:/SP.*MG.*1 items/});
    const second=choices.getByRole('button',{name:/RJ.*SP.*1 items/});
    fireEvent.click(first);
    fireEvent.click(second);
    expect(first).toHaveAttribute('aria-pressed','true');
    expect(second).toHaveAttribute('aria-pressed','true');
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('2');
    expect(choices.getAllByRole('button')).toHaveLength(count);
    expect(screen.getByRole('button',{name:'Remove focused flow SP→MG'})).toBeInTheDocument();
    expect(document.querySelectorAll('.sankey-ribbon-dim').length).toBeGreaterThan(0);
    fireEvent.click(first);
    expect(first).toHaveAttribute('aria-pressed','false');
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button',{name:'Clear flow focus'}));
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('3');
  });
  it('offers category measurement modes and delivery timing without changing the KPI cohort',()=>{
    render(<DashboardContent dataset={dataset}/>);
    const ranking=screen.getByRole('region',{name:'Product category leaderboard'});
    expect(within(ranking).getByText('Health Beauty')).toBeInTheDocument();
    const measures=within(ranking).getByRole('group',{name:'Category ranking measurement'});
    fireEvent.click(within(measures).getByRole('button',{name:'Item value'}));
    expect(within(measures).getByRole('button',{name:'Item value'})).toHaveAttribute('aria-pressed','true');
    const delay=screen.getByRole('region',{name:'Delivery timing distribution'});
    expect(within(delay).getByRole('img',{name:/Delivery timing histogram of 2 valid deliveries/})).toBeInTheDocument();
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('3');
  });
  it('previous-period comparisons only appear for two dates with a full available preceding period',()=>{
    render(<DashboardContent dataset={dataset}/>);
    const panel=screen.getByRole('region',{name:'Previous-period comparison'});
    expect(within(panel).getByText(/Set both purchase dates/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Purchase date from'),{target:{value:'2018-03-03'}});
    fireEvent.change(screen.getByLabelText('Purchase date to'),{target:{value:'2018-03-03'}});
    expect(within(panel).getByRole('table',{name:'Current versus previous period metrics'})).toBeInTheDocument();
    expect(within(panel).getByText(/Previous: 2018-03-02 → 2018-03-02/)).toBeInTheDocument();
  });
  it('saves, restores, renames and deletes filter views in local browser storage',()=>{
    render(<DashboardContent dataset={dataset}/>);
    const views=within(screen.getByRole('region',{name:'Saved filter views'}));
    const name=views.getByRole('textbox',{name:'Saved view name'});
    fireEvent.change(name,{target:{value:'SP sellers'}});
    fireEvent.click(views.getByRole('button',{name:'Save new'}));
    const raw=JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY)!);
    expect(raw).toHaveLength(1);
    const pick=views.getByRole('combobox',{name:'Choose a saved view'});
    fireEvent.change(pick,{target:{value:raw[0].id}});
    // A saved all-history view should undo a later selection.
    const seller=screen.getByLabelText('Seller origins');fireEvent.click(seller);
    fireEvent.click(screen.getByRole('checkbox',{name:'Seller origins: SP · São Paulo'}));
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
    fireEvent.click(views.getByRole('button',{name:'Load'}));
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('3');
    fireEvent.change(name,{target:{value:'All orders'}});
    fireEvent.click(views.getByRole('button',{name:'Rename'}));
    expect(views.getByRole('option',{name:'All orders'})).toBeInTheDocument();
    fireEvent.click(views.getByRole('button',{name:'Delete'}));
    expect(JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY)!)).toHaveLength(0);
  });
  it('offers a filtered CSV export without needing a hosted server',()=>{
    const create=vi.fn(()=> 'blob:test');const revoke=vi.fn();
    vi.stubGlobal('URL',class extends URL {static createObjectURL=create;static revokeObjectURL=revoke;});
    vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
    render(<DashboardContent dataset={dataset}/>);
    fireEvent.click(screen.getByRole('button',{name:'Export filtered orders (CSV)'}));
    expect(create).toHaveBeenCalledTimes(1);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });
});
