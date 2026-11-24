// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {DashboardContent} from '../../src/app/App';
import {BRAZIL_STATES} from '../../src/components/stateNames';
import {dataset} from './fixtures';

const codes=Object.keys(BRAZIL_STATES).sort();
const topology={type:'Topology',transform:{scale:[0.001,0.001],translate:[-75,-34]},
  objects:{estados:{type:'GeometryCollection',geometries:codes.map((id,i)=>({type:'Polygon',id,properties:{SIGLA:id},arcs:[[i]]}))}},
  arcs:codes.map((_,i)=>[[i*8,0],[5,0],[0,5],[-5,0],[0,-5]])};
function mockGeo(){vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>topology} as Response)));}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

describe('WU-06 delivery analytics presentation',()=>{
  it('shows P95 and a mutually exclusive outcome breakdown, keeping unknown separate',()=>{
    mockGeo(); render(<DashboardContent dataset={dataset}/>);
    expect(screen.getByTestId('kpi-violet')).toHaveTextContent('6.9 days');
    expect(screen.getByRole('img',{name:/Early 1, on promised date 0, late 1; 1 other or unknown orders/})).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 eligible orders are undelivered/)).toBeInTheDocument();
  });
  it('switches map measurements independently from geography and global filters',async()=>{
    mockGeo(); render(<DashboardContent dataset={dataset}/>);
    const controls=within(screen.getByRole('group',{name:'Map measurement'}));
    expect(controls.getByRole('button',{name:'Order volume'})).toHaveAttribute('aria-pressed','true');
    await screen.findByRole('group',{name:'Seller origins state selection'});
    fireEvent.click(controls.getByRole('button',{name:'On-time rate'}));
    expect(controls.getByRole('button',{name:'On-time rate'})).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('img',{name:/Map of Brazil showing seller origins by on-time rate/})).toBeInTheDocument();
    expect(screen.getByText(/Fewer than 30 eligible deliveries are shown neutral/)).toBeInTheDocument();
    fireEvent.click(controls.getByRole('button',{name:'Median delivery'}));
    expect(screen.getByRole('img',{name:/Map of Brazil showing seller origins by median delivery/})).toBeInTheDocument();
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('3');
  });
  it('shows volume leaders and honestly omits underpowered punctuality rankings',()=>{
    mockGeo(); render(<DashboardContent dataset={dataset}/>);
    const rankings=screen.getByRole('region',{name:'State performance rankings'});
    expect(within(rankings).getByText(/Highest order volume/)).toBeInTheDocument();
    expect(within(rankings).getByText('No states meet the minimum sample size.')).toBeInTheDocument();
  });
  it('re-ranks the Sankey by money but preserves selected-flow focus and the original KPI cohort',()=>{
    mockGeo(); render(<DashboardContent dataset={dataset}/>);
    const measures=within(screen.getByRole('group',{name:'Sankey measurement'}));
    expect(measures.getByRole('button',{name:'Item count'})).toHaveAttribute('aria-pressed','true');
    const choices=within(screen.getByRole('group',{name:'Focus a directed seller-to-customer state pair'}));
    const length=choices.getAllByRole('button').length;
    const flow=choices.getByRole('button',{name:/RJ.*MG.*1 items/});
    fireEvent.click(flow);
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
    fireEvent.click(measures.getByRole('button',{name:'Freight charged'}));
    expect(measures.getByRole('button',{name:'Freight charged'})).toHaveAttribute('aria-pressed','true');
    expect(choices.getAllByRole('button')).toHaveLength(length);
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
    fireEvent.click(measures.getByRole('button',{name:'Item value'}));
    expect(choices.getAllByRole('button')).toHaveLength(length);
    fireEvent.click(screen.getByRole('button',{name:'Clear flow focus'}));
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('3');
  });
});
