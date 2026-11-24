// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { buildDataIndex } from '../../src/data/indexes';
import { DashboardContent } from '../../src/app/App';
import { parseBrazilTopology } from '../../src/charts/BrazilMap';
import { makeFlowLayout } from '../../src/charts/ShippingSankey';
import { selectCohort, selectFocusedFlowCohort, topDirectedFlows } from '../../src/domain/selectors';
import { DEFAULT_FILTERS } from '../../src/domain/types';
import { BRAZIL_STATES } from '../../src/components/stateNames';
import { dataset, items, orders } from './fixtures';

const codes = Object.keys(BRAZIL_STATES).sort();
const topology = {
  type:'Topology' as const,
  transform:{scale:[0.001,0.001],translate:[-75,-34]},
  objects:{estados:{type:'GeometryCollection' as const,geometries:codes.map((id,i)=>({type:'Polygon' as const,id,properties:{SIGLA:id},arcs:[[i]]}))}},
  arcs: codes.map((_,i)=>[[i*8,0],[5,0],[0,5],[-5,0],[0,-5]]),
};
const jsonResponse=(json:unknown)=>({ok:true,json:async()=>json} as Response);
function mockGeo() { vi.stubGlobal('fetch',vi.fn(async()=>jsonResponse(topology))); }
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

describe('WU-05 contextual map',()=>{
  it('requires 27 unique UF shapes and correct TopoJSON nesting',()=>{
    expect(parseBrazilTopology(topology).features).toHaveLength(27);
    const incomplete=structuredClone(topology);
    incomplete.objects.estados.geometries.pop();
    expect(()=>parseBrazilTopology(incomplete)).toThrow(/27 distinct/);
    const legacy=structuredClone(topology);
    legacy.objects.estados.geometries[0].arcs=[0] as unknown as number[][];
    expect(()=>parseBrazilTopology(legacy)).toThrow(/legacy polygon arc nesting/);
  });
  it('toggles multiple seller states and preserves destination selections', async()=>{
    mockGeo();
    render(<DashboardContent dataset={dataset}/>);
    expect(screen.getByRole('button',{name:'Seller origins'})).toHaveAttribute('aria-pressed','true');
    const origins=within(await screen.findByRole('group',{name:'Seller origins state selection'}));
    fireEvent.click(origins.getByRole('button',{name:/SP São Paulo/}));
    fireEvent.click(origins.getByRole('button',{name:/RJ Rio de Janeiro/}));
    expect(screen.getByRole('button',{name:'Clear Origin: SP filter'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Clear Origin: RJ filter'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Destinations'}));
    const destinations=within(screen.getByRole('group',{name:'Customer destinations state selection'}));
    fireEvent.click(destinations.getByRole('button',{name:/MG Minas Gerais/}));
    expect(screen.getByRole('button',{name:'Clear Destination: MG filter'})).toBeInTheDocument();
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
    expect(screen.getByRole('button',{name:'Clear Origin: SP filter'})).toBeInTheDocument();
  });
});

describe('WU-05 contextual trend and non-destructive Sankey focus',()=>{
  it('keeps full historical context while month selection changes KPIs',async()=>{
    mockGeo();
    const next={...orders[0],orderId:'april',itemCount:0,purchaseDate:'2018-04-02',purchaseTimestamp:'2018-04-02T10:00:00'};
    const wide={manifest:{...dataset.manifest,orderCount:4},index:buildDataIndex([...orders,next],items)};
    render(<DashboardContent dataset={wide}/>);
    const month=screen.getByRole('combobox',{name:'Select purchase month'});
    fireEvent.change(month,{target:{value:'2018-03'}});
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('3');
    expect(screen.getByRole('option',{name:/2018-04/})).toBeInTheDocument();
    fireEvent.change(month,{target:{value:'2018-04'}});
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button',{name:'Clear date selection'}));
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('4');
  });
  it('retains all Sankey links after selecting a flow; KPIs and orders focus, click again resets',async()=>{
    mockGeo();
    const context=selectCohort(dataset.index,DEFAULT_FILTERS);
    const graph=makeFlowLayout(topDirectedFlows(context));
    expect(graph.nodes.some(n=>n.id==='origin:SP')).toBe(true);
    expect(graph.nodes.some(n=>n.id==='dest:SP')).toBe(true);
    expect(selectFocusedFlowCohort(context,{sellerState:'RJ',customerState:'MG'}).eligibleOrders).toHaveLength(1);
    render(<DashboardContent dataset={dataset}/>);
    const choices=screen.getByRole('group',{name:'Focus a directed seller-to-customer state pair'});
    const linkCount=within(choices).getAllByRole('button').length;
    const selection=within(choices).getByRole('button',{name:/RJ.*MG.*1 items/});
    fireEvent.mouseEnter(selection);
    expect(document.querySelectorAll('.sankey-ribbon-dim').length).toBeGreaterThan(0);
    fireEvent.mouseLeave(selection);
    fireEvent.click(selection);
    // Main filter panel displays one summary chip.
    expect(screen.getByRole('button', {
      name: 'Clear 1 focused flow filter'
    })).toBeInTheDocument();

    // Sankey panel retains the individually removable flow.
    expect(screen.getByRole('button', {
      name: 'Remove focused flow RJ→MG'
    })).toBeInTheDocument();
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
    expect(within(choices).getAllByRole('button')).toHaveLength(linkCount);
    expect(selection).toHaveAttribute('aria-pressed','true');
    expect(screen.queryByRole('button',{name:'Clear Origin: RJ filter'})).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 1 of 1 eligible orders/)).toBeInTheDocument();
    expect(document.querySelectorAll('.sankey-ribbon-dim').length).toBeGreaterThan(0);
    fireEvent.click(selection);
    expect(screen.queryByRole('button',{name:'Clear Focused flow: RJ → MG filter'})).not.toBeInTheDocument();
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('3');
  });
  it('keeps mappable flow empty state under a category/seller conflict',async()=>{
    mockGeo();
    render(<DashboardContent dataset={dataset}/>);
    // Match only SP origins and books (books are sold from RJ in fixture).
    const seller=screen.getByLabelText('Seller origins');fireEvent.click(seller);
    fireEvent.click(screen.getByRole('checkbox',{name:'Seller origins: SP · São Paulo'}));
    const cats=screen.getByLabelText('Product categories');fireEvent.click(cats);
    fireEvent.click(screen.getByRole('checkbox',{name:'Product categories: Books'}));
    expect(screen.getByText(/No mappable seller-to-customer item flows match/)).toBeInTheDocument();
  });
});
