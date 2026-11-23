// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { buildDataIndex } from '../../src/data/indexes';
import { DashboardContent } from '../../src/app/App';
import { parseBrazilTopology } from '../../src/charts/BrazilMap';
import { makeFlowLayout } from '../../src/charts/ShippingSankey';
import { selectCohort, topDirectedFlows } from '../../src/domain/selectors';
import { DEFAULT_FILTERS } from '../../src/domain/types';
import { BRAZIL_STATES } from '../../src/components/stateNames';
import { dataset, items, orders } from './fixtures';

const codes = Object.keys(BRAZIL_STATES).sort();
// 27 *distinct* tiny closed TopoJSON polygons with separate UF IDs.
const topology = {
  type:'Topology' as const,
  transform:{scale:[0.001,0.001],translate:[-75,-34]},
  objects:{estados:{type:'GeometryCollection' as const,geometries:codes.map((id,i)=>({type:'Polygon' as const,id,properties:{SIGLA:id},arcs:[[i]]}))}},
  arcs: codes.map((_,i)=>[[i*8,0],[5,0],[0,5],[-5,0],[0,-5]]),
};
const jsonResponse=(json:unknown)=>({ok:true,json:async()=>json} as Response);
function mockGeo() { vi.stubGlobal('fetch',vi.fn(async()=>jsonResponse(topology))); }

afterEach(()=>{cleanup();vi.unstubAllGlobals();});

describe('WU-03 geographic asset and map',()=>{
  it('rejects an incomplete topology and accepts precisely 27 unique UF shapes',()=>{
    expect(parseBrazilTopology(topology).features).toHaveLength(27);
    const incomplete=structuredClone(topology);
    incomplete.objects.estados.geometries.pop();
    expect(()=>parseBrazilTopology(incomplete)).toThrow(/27 distinct/);
    const legacy=structuredClone(topology);
    legacy.objects.estados.geometries[0].arcs=[0] as unknown as number[][];
    expect(()=>parseBrazilTopology(legacy)).toThrow(/legacy polygon arc nesting/);
  });

  it('defaults to seller origins, applies only seller-state filters and preserves destination selections', async()=>{
    mockGeo();
    render(<DashboardContent dataset={dataset}/>);
    expect(screen.getByRole('button',{name:'Seller origins'})).toHaveAttribute('aria-pressed','true');
    expect(await screen.findByRole('group',{name:'Seller origins state selection'})).toBeInTheDocument();
    const origins=within(screen.getByRole('group',{name:'Seller origins state selection'}));
    fireEvent.click(origins.getByRole('button',{name:/SP São Paulo/}));
    expect(screen.getByRole('combobox',{name:'Seller origin'})).toHaveValue('SP');
    expect(screen.getByRole('combobox',{name:'Customer destination'})).toHaveValue('');
    fireEvent.click(screen.getByRole('button',{name:'Destinations'}));
    const destinations=within(screen.getByRole('group',{name:'Customer destinations state selection'}));
    fireEvent.click(destinations.getByRole('button',{name:/MG Minas Gerais/}));
    expect(screen.getByRole('combobox',{name:'Customer destination'})).toHaveValue('MG');
    expect(screen.getByRole('combobox',{name:'Seller origin'})).toHaveValue('SP');
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
  });
});

describe('WU-03 trend and Sankey linked interactions',()=>{
  it('keeps the full historical context while a month selection changes KPIs, and permits direct switching',async()=>{
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
    expect(screen.getByRole('option',{name:/2018-03/})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Clear date selection'}));
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('4');
  });

  it('keeps same-state flow nodes separate and binds link selection to both chips atomically',async()=>{
    mockGeo();
    const cohort=selectCohort(dataset.index,{...DEFAULT_FILTERS});
    const summary=topDirectedFlows(cohort);
    const graph=makeFlowLayout(summary);
    expect(graph.nodes.some(n=>n.id==='origin:SP')).toBe(true);
    expect(graph.nodes.some(n=>n.id==='dest:SP')).toBe(true);
    render(<DashboardContent dataset={dataset}/>);
    const flows=screen.getByRole('group',{name:'Select a directed seller-to-customer state pair'});
    fireEvent.click(within(flows).getByRole('button',{name:/RJ.*SP.*1 items/}));
    expect(screen.getByRole('combobox',{name:'Seller origin'})).toHaveValue('RJ');
    expect(screen.getByRole('combobox',{name:'Customer destination'})).toHaveValue('SP');
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
  });

  it('shows no phantom links under an empty cohort',async()=>{
    mockGeo();
    render(<DashboardContent dataset={dataset}/>);
    fireEvent.change(screen.getByRole('combobox',{name:'Seller origin'}),{target:{value:'SP'}});
    fireEvent.change(screen.getByRole('combobox',{name:'Product category'}),{target:{value:'books'}});
    expect(screen.getByText(/No mappable seller-to-customer item flows match/)).toBeInTheDocument();
  });
});
