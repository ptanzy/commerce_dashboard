import { useMemo } from 'react';
import type { Dispatch } from 'react';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import type { SankeyLink, SankeyNode } from 'd3-sankey';
import { topDirectedFlows } from '../domain/selectors';
import type { Cohort } from '../domain/selectors';
import type { FilterAction, Filters } from '../domain/types';
import { stateLabel } from '../components/stateNames';
import { formatInteger, formatPercentage } from '../components/format';

interface FlowNodeExtra { id: string; state: string; side: 'origin' | 'dest' }
interface FlowLinkExtra { sellerState: string; customerState: string }
type Node = SankeyNode<FlowNodeExtra, FlowLinkExtra>;
type Link = SankeyLink<FlowNodeExtra, FlowLinkExtra>;
const WIDTH = 980, HEIGHT = 480;

/** Preserve separate origin/destination node namespaces, including SP → SP. */
export function makeFlowLayout(summary: ReturnType<typeof topDirectedFlows>): {nodes: Node[];links: Link[]} {
  if (!summary.links.length) return {nodes:[], links:[]};
  const nodes = new Map<string,Node>();
  const links: Link[] = [];
  for (const flow of summary.links) {
    if (!nodes.has(flow.source)) nodes.set(flow.source,{id:flow.source,state:flow.sellerState,side:'origin'});
    if (!nodes.has(flow.target)) nodes.set(flow.target,{id:flow.target,state:flow.customerState,side:'dest'});
    links.push({source:flow.source,target:flow.target,value:flow.itemCount,sellerState:flow.sellerState,customerState:flow.customerState});
  }
  const layout = sankey<FlowNodeExtra,FlowLinkExtra>()
    .nodeId(d => d.id)
    .nodeWidth(16)
    .nodePadding(12)
    .nodeSort((a,b) => a.state.localeCompare(b.state))
    .iterations(16)
    .extent([[134,30],[WIDTH-132,HEIGHT-30]]);
  const result = layout({nodes:[...nodes.values()].map(n => ({...n})),links});
  return {nodes:result.nodes, links:result.links};
}

export function ShippingSankey({cohort,filters,dispatch}: {cohort:Cohort;filters:Filters;dispatch:Dispatch<FilterAction>}) {
  const summary = useMemo(() => topDirectedFlows(cohort,15), [cohort]);
  const layout = useMemo(() => makeFlowLayout(summary), [summary]);
  const path = useMemo(() => sankeyLinkHorizontal<FlowNodeExtra,FlowLinkExtra>(), []);
  const selectPair = (sellerState: string, customerState: string) => dispatch({type:'set_flow_pair',sellerState,customerState});
  const selectedPair = filters.sellerState && filters.customerState ? `${filters.sellerState}→${filters.customerState}` : null;
  return <div className="viz-body sankey-body">
    <div className="viz-controls"><span className="flow-topline"><strong>{formatInteger(summary.shownItemCount)}</strong> item contributions displayed <span className="flow-summary-sep">/</span> <strong>{formatInteger(summary.mappableItemCount)}</strong> mappable</span><span className="viz-meta">Top 15 directed pairs</span></div>
    <p className="viz-caption">Each ribbon represents matching order-item contributions from a seller state to a customer state, not a physical delivery route.</p>
    {summary.links.length === 0 ? <div className="viz-empty" role="status">No mappable seller-to-customer item flows match the selected filters.</div> : <>
      <div className="sankey-scroll" role="region" tabIndex={0} aria-label="Scrollable seller to customer Sankey diagram">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Sankey diagram of the top fifteen seller-origin to customer-destination item-count flows; accessible flow buttons are listed below">
          <title>Top 15 seller-to-customer state flows by matching item count</title>
          <text className="sankey-side-heading" x={134} y={16}>SELLER ORIGINS</text>
          <text className="sankey-side-heading" x={WIDTH-132} y={16} textAnchor="end">CUSTOMER DESTINATIONS</text>
          {layout.links.map((link,i) => {
            const selected = selectedPair === `${link.sellerState}→${link.customerState}`;
            const d = path(link) ?? '';
            return <path key={`${link.sellerState}-${link.customerState}-${i}`} d={d} fill="none" className={`sankey-ribbon${selected ? ' sankey-ribbon-active' : ''}`} strokeWidth={Math.max(1, link.width ?? 1)} onClick={() => selectPair(link.sellerState,link.customerState)}>
              <title>{stateLabel(link.sellerState)} → {stateLabel(link.customerState)}: {formatInteger(link.value)} item contributions. Click to filter.</title>
            </path>;
          })}
          {layout.nodes.map(node => {
            const left = node.side === 'origin';
            const active = (left ? filters.sellerState : filters.customerState) === node.state;
            const x0 = node.x0 ?? 0, y0 = node.y0 ?? 0, x1 = node.x1 ?? 0, y1 = node.y1 ?? 0;
            const count = node.value ?? 0;
            return <g key={node.id}>
              <rect x={x0} y={y0} width={x1-x0} height={Math.max(1,y1-y0)} rx={2} className={`${left?'sankey-origin-node':'sankey-dest-node'}${active?' sankey-node-active':''}`} />
              <text className="sankey-node-label" x={left ? x0-7 : x1+7} y={(y0+y1)/2+3.5} textAnchor={left?'end':'start'}>{node.state} · {formatInteger(count)}</text>
              <title>{left?'Seller origin':'Customer destination'}: {stateLabel(node.state)} — {formatInteger(count)} matching item contributions</title>
            </g>;
          })}
        </svg>
      </div>
      <div className="sankey-coverage" role="status"><span><span className="legend-dot"/> Displaying {formatPercentage(summary.coverage)} of {formatInteger(summary.mappableItemCount)} mappable matching items</span>{summary.unmappableItemCount ? <span>{formatInteger(summary.unmappableItemCount)} items with unknown seller/destination state excluded from the diagram</span> : null}</div>
      <div className="flow-action-head">Choose a seller → customer flow <span>KEYBOARD-ACCESSIBLE SELECTION</span></div>
      <div className="flow-action-grid" role="group" aria-label="Select a directed seller-to-customer state pair">
        {summary.links.map((link,i) => <button type="button" key={`${link.source}-${link.target}`} aria-pressed={selectedPair === `${link.sellerState}→${link.customerState}`} className="flow-choice" onClick={() => selectPair(link.sellerState,link.customerState)}>
          <span className="flow-rank">{i+1}</span><span className="flow-pair">{link.sellerState} <span aria-hidden="true">→</span> {link.customerState}</span><span>{formatInteger(link.itemCount)} items</span>
        </button>)}
      </div>
      {(filters.sellerState || filters.customerState) ? <button type="button" className="viz-clear" onClick={()=>{
        // Clear each state constraint without changing date or category filters.
        if(filters.sellerState) dispatch({type:'set_seller_state',state:null});
        if(filters.customerState) dispatch({type:'set_customer_state',state:null});
      }}>Clear both state filters to explore other flows</button> : null}
    </>}
    <p className="viz-smallprint">Two separate node sets retain intra-state links such as SP → SP. Multiple items from one order contribute separately. Olist does not identify the routes taken by shipments.</p>
  </div>;
}
