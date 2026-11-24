import { useMemo, useState } from 'react';
import type { Dispatch } from 'react';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import type { SankeyLink, SankeyNode } from 'd3-sankey';
import { topDirectedFlows } from '../domain/selectors';
import type { Cohort, FlowMeasure } from '../domain/selectors';
import type { FilterAction, Filters } from '../domain/types';
import { stateLabel } from '../components/stateNames';
import { formatInteger, formatPercentage } from '../components/format';

interface FlowNodeExtra { id: string; state: string; side: 'origin' | 'dest' }
interface FlowLinkExtra { sellerState: string; customerState: string }
type Node = SankeyNode<FlowNodeExtra, FlowLinkExtra>;
type Link = SankeyLink<FlowNodeExtra, FlowLinkExtra>;
const WIDTH = 980, HEIGHT = 480;
const flowKey = (origin: string, destination: string) => `${origin}→${destination}`;
const brl = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:2});
const MEASURES: Record<FlowMeasure,string> = {items:'Item count',freight:'Freight charged',value:'Item value'};
function formatWeight(weight:number,measure:FlowMeasure):string {
  return measure === 'items' ? `${formatInteger(weight)} items` : brl.format(weight);
}


/** Preserve separate origin/destination node namespaces, including SP → SP. */
export function makeFlowLayout(summary: ReturnType<typeof topDirectedFlows>): {nodes: Node[];links: Link[]} {
  if (!summary.links.length) return {nodes:[], links:[]};
  const nodes = new Map<string,Node>();
  const links: Link[] = [];
  for (const flow of summary.links) {
    if (!nodes.has(flow.source)) nodes.set(flow.source,{id:flow.source,state:flow.sellerState,side:'origin'});
    if (!nodes.has(flow.target)) nodes.set(flow.target,{id:flow.target,state:flow.customerState,side:'dest'});
    links.push({source:flow.source,target:flow.target,value:flow.weight,sellerState:flow.sellerState,customerState:flow.customerState});
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

/** Sankey always receives the broad global cohort, never the focused drill-down cohort. */
export function ShippingSankey({cohort,filters,dispatch}: {cohort:Cohort;filters:Filters;dispatch:Dispatch<FilterAction>}) {
  const [hoveredPair,setHoveredPair] = useState<string | null>(null);
  const [measure,setMeasure] = useState<FlowMeasure>('items');
  const summary = useMemo(() => topDirectedFlows(cohort,15,measure), [cohort,measure]);
  const layout = useMemo(() => makeFlowLayout(summary), [summary]);
  const path = useMemo(() => sankeyLinkHorizontal<FlowNodeExtra,FlowLinkExtra>(), []);
  const focusKey = filters.focusedFlow ? flowKey(filters.focusedFlow.sellerState,filters.focusedFlow.customerState) : null;
  const selectedLink = summary.links.find(link => flowKey(link.sellerState,link.customerState) === focusKey);
  const hoveringVisible = hoveredPair !== null && summary.links.some(link => flowKey(link.sellerState,link.customerState) === hoveredPair);
  // Do not dim every link if a previously focused pair has fallen out of the current top 15.
  const emphasized = hoveringVisible ? hoveredPair : selectedLink ? focusKey : null;
  const selectPair = (sellerState: string, customerState: string) => dispatch({type:'focus_flow',sellerState,customerState});

  return <div className="viz-body sankey-body">
    <div className="viz-controls"><span className="flow-topline"><strong>{formatWeight(summary.shownWeight,measure)}</strong> shown <span className="flow-summary-sep">/</span> <strong>{formatWeight(summary.mappableWeight,measure)}</strong> eligible mappable</span><span className="viz-meta">Top 15 directed pairs</span></div>
    <div className="sankey-measure-controls" role="group" aria-label="Sankey measurement">
      {(Object.keys(MEASURES) as FlowMeasure[]).map(key=><button key={key} type="button" aria-pressed={measure===key} className={measure===key?'is-active':''} onClick={()=>setMeasure(key)}>{MEASURES[key]}</button>)}
    </div>
    <p className="viz-caption">Rank and size flows by {MEASURES[measure].toLowerCase()}. Click a ribbon to focus KPIs and orders without removing other flows. Hover to preview; click again to clear. Relationships represent matching items, not physical delivery routes.</p>
    {filters.focusedFlow ? <div className="sankey-focus-details" role="status">
      <div><strong>Focused: {focusKey}</strong><span>{selectedLink ? `${formatWeight(selectedLink.weight,measure)} · ${formatInteger(selectedLink.itemCount)} items · ${formatPercentage(summary.mappableWeight ? selectedLink.weight/summary.mappableWeight : null)} of eligible ${MEASURES[measure].toLowerCase()}` : 'The focused pair is outside the current top-15 overview.'}</span></div>
      <button type="button" onClick={()=>dispatch({type:'clear_flow_focus'})}>Clear focus</button>
    </div> : null}
    {summary.links.length === 0 ? <div className="viz-empty" role="status">No mappable seller-to-customer item flows match the selected filters, or the selected measure has no positive valid amounts.</div> : <>
      <div className="sankey-scroll" role="region" tabIndex={0} aria-label="Scrollable seller to customer Sankey diagram">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Sankey diagram of the top fifteen seller-origin to customer-destination flows weighted by ${MEASURES[measure].toLowerCase()}; accessible flow buttons are listed below`}>
          <title>Top 15 seller-to-customer state flows by {MEASURES[measure]}</title>
          <text className="sankey-side-heading" x={134} y={16}>SELLER ORIGINS</text>
          <text className="sankey-side-heading" x={WIDTH-132} y={16} textAnchor="end">CUSTOMER DESTINATIONS</text>
          {layout.links.map((link,i) => {
            const key = flowKey(link.sellerState,link.customerState);
            const selected = focusKey === key;
            const dim = emphasized !== null && emphasized !== key;
            const d = path(link) ?? '';
            return <path key={`${link.sellerState}-${link.customerState}-${i}`} d={d} fill="none"
              className={`sankey-ribbon${selected ? ' sankey-ribbon-active' : ''}${dim ? ' sankey-ribbon-dim' : ''}`}
              strokeWidth={Math.max(1, link.width ?? 1)}
              onMouseEnter={()=>setHoveredPair(key)} onMouseLeave={()=>setHoveredPair(null)}
              onClick={()=>selectPair(link.sellerState,link.customerState)}>
              <title>{stateLabel(link.sellerState)} → {stateLabel(link.customerState)}: {formatWeight(link.value,measure)}. Click to {selected?'clear focus':'focus'}.</title>
            </path>;
          })}
          {layout.nodes.map(node => {
            const left = node.side === 'origin';
            const selectedByGlobal = left ? filters.sellerStates.includes(node.state) : filters.customerStates.includes(node.state);
            const selectedByFocus = Boolean(filters.focusedFlow && (left ? filters.focusedFlow.sellerState : filters.focusedFlow.customerState) === node.state);
            const dim = emphasized !== null && !layout.links.some(link=>
              flowKey(link.sellerState,link.customerState)===emphasized &&
              (left ? link.sellerState : link.customerState) === node.state);
            const x0 = node.x0 ?? 0, y0 = node.y0 ?? 0, x1 = node.x1 ?? 0, y1 = node.y1 ?? 0;
            const count = node.value ?? 0;
            return <g key={node.id} className={dim ? 'sankey-node-dim' : ''}>
              <rect x={x0} y={y0} width={x1-x0} height={Math.max(1,y1-y0)} rx={2} className={`${left?'sankey-origin-node':'sankey-dest-node'}${selectedByGlobal||selectedByFocus?' sankey-node-active':''}`} />
              <text className="sankey-node-label" x={left ? x0-7 : x1+7} y={(y0+y1)/2+3.5} textAnchor={left?'end':'start'}>{node.state} · {formatInteger(count)}</text>
              <title>{left?'Seller origin':'Customer destination'}: {stateLabel(node.state)} — {formatWeight(count,measure)} of matching items</title>
            </g>;
          })}
        </svg>
      </div>
      <div className="sankey-coverage" role="status"><span><span className="legend-dot"/> Displaying {formatPercentage(summary.coverage)} of {formatWeight(summary.mappableWeight,measure)} eligible, mappable {MEASURES[measure].toLowerCase()}</span>{summary.unmappableItemCount ? <span>{formatInteger(summary.unmappableItemCount)} items with unknown seller/destination state excluded from the diagram</span> : null}{measure !== 'items' && summary.invalidWeightItems ? <span>{formatInteger(summary.invalidWeightItems)} items with missing/invalid {MEASURES[measure].toLowerCase()} excluded from monetary denominator</span> : null}</div>
      <div className="flow-action-head">Focus a seller → customer flow <span>KEYBOARD-ACCESSIBLE SELECTION</span></div>
      <div className="flow-action-grid" role="group" aria-label="Focus a directed seller-to-customer state pair">
        {summary.links.map((link,i) => {
          const key = flowKey(link.sellerState,link.customerState);
          return <button type="button" key={`${link.source}-${link.target}`} aria-pressed={focusKey===key}
            className={`flow-choice${emphasized && emphasized !== key ? ' flow-choice-dim' : ''}`}
            onMouseEnter={()=>setHoveredPair(key)} onMouseLeave={()=>setHoveredPair(null)} onFocus={()=>setHoveredPair(key)} onBlur={()=>setHoveredPair(null)}
            onClick={()=>selectPair(link.sellerState,link.customerState)}>
            <span className="flow-rank">{i+1}</span><span className="flow-pair">{link.sellerState} <span aria-hidden="true">→</span> {link.customerState}</span><span>{formatWeight(link.weight,measure)}</span>
          </button>;
        })}
      </div>
    </>}
    <p className="viz-smallprint">The overview always uses global multi-select filters, not the focused order cohort. SP → SP and other intra-state links remain distinct from source/destination nodes. Multiple items from one order contribute separately. Monetary modes use recorded valid item values, not carrier operating costs; zero-weight links do not appear.</p>
  </div>;
}
