import { useEffect, useMemo, useState } from 'react';
import type { Dispatch } from 'react';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import type { SankeyLink, SankeyNode } from 'd3-sankey';
import { topDirectedFlows } from '../domain/selectors';
import type { Cohort, FlowMeasure } from '../domain/selectors';
import type { FilterAction, Filters } from '../domain/types';
import { stateLabel } from '../components/stateNames';
import { formatInteger, formatPercentage } from '../components/format';
import { clockNow, recordTiming, recordUserAction, setDiagnosticView } from '../observability/diagnostics';

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
  const aggregation = useMemo(() => {
    const start=clockNow();
    return {value:topDirectedFlows(cohort,15,measure,filters.focusedFlows),ms:clockNow()-start};
  }, [cohort,measure,filters.focusedFlows]);
  const summary=aggregation.value;
  const layoutResult=useMemo(() => {
    const start=clockNow();return {value:makeFlowLayout(summary),ms:clockNow()-start};
  }, [summary]);
  const layout=layoutResult.value;
  useEffect(()=>recordTiming('sankey_aggregation',aggregation.ms),[aggregation]);
  useEffect(()=>recordTiming('sankey_layout',layoutResult.ms),[layoutResult]);
  const path = useMemo(() => sankeyLinkHorizontal<FlowNodeExtra,FlowLinkExtra>(), []);
  const focusKeys = useMemo(() => new Set(filters.focusedFlows.map(pair=>flowKey(pair.sellerState,pair.customerState))), [filters.focusedFlows]);
  const displayedKeys = useMemo(() => new Set(summary.links.map(link=>flowKey(link.sellerState,link.customerState))), [summary]);
  const hoveringVisible = hoveredPair !== null && displayedKeys.has(hoveredPair);
  const emphasized = hoveringVisible ? new Set([...focusKeys,hoveredPair!]) : focusKeys.size ? focusKeys : null;
  const selectPair = (sellerState: string, customerState: string, additive=false) => dispatch({type:additive?'toggle_flow_focus':'focus_flow',sellerState,customerState});

  return <div className="viz-body sankey-body">
    <div className="viz-controls"><span className="flow-topline"><strong>{formatWeight(summary.shownWeight,measure)}</strong> shown <span className="flow-summary-sep">/</span> <strong>{formatWeight(summary.mappableWeight,measure)}</strong> eligible mappable</span><span className="viz-meta">Top 15 directed pairs{summary.links.length > 15 ? ` + ${summary.links.length-15} selected` : ''}</span></div>
    <div className="sankey-measure-controls" role="group" aria-label="Sankey measurement">
      {(Object.keys(MEASURES) as FlowMeasure[]).map(key=><button key={key} type="button" aria-pressed={measure===key} className={measure===key?'is-active':''} onClick={()=>{recordUserAction('SANKEY_MEASURE_CHANGED','sankey');setDiagnosticView('sankeyMeasure',key);setMeasure(key);}}>{MEASURES[key]}</button>)}
    </div>
    <p className="viz-caption">Rank and size flows by {MEASURES[measure].toLowerCase()}. Click a ribbon to focus one flow, Ctrl/Cmd-click to add or remove flows. Use the selection list below to choose several without modifiers. Hover to preview; the overview stays intact. Relationships represent matching items, not physical delivery routes.</p>
    {filters.focusedFlows.length ? <div className="sankey-focus-details" role="status">
      <div><strong>{filters.focusedFlows.length} focused {filters.focusedFlows.length===1?'flow':'flows'}</strong><span>Matching items from any selected directed pair contribute once per order. The Sankey retains the global context.</span>
        <div className="sankey-focus-chips">{filters.focusedFlows.map(pair=>{
          const key=flowKey(pair.sellerState,pair.customerState);
          return <button type="button" key={key} aria-label={`Remove focused flow ${key}`} onClick={()=>selectPair(pair.sellerState,pair.customerState,true)}>{key} ×</button>;
        })}</div>
      </div>
      <button type="button" onClick={()=>dispatch({type:'clear_flow_focus'})}>Clear focus</button>
    </div> : null}
    {summary.links.length === 0 ? <div className="viz-empty" role="status">No mappable seller-to-customer item flows match the selected filters, or the selected measure has no positive valid amounts.</div> : <>
      <div className="sankey-scroll" role="region" tabIndex={0} aria-label="Scrollable seller to customer Sankey diagram">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Sankey diagram of the top 15 plus selected seller-origin to customer-destination flows weighted by ${MEASURES[measure].toLowerCase()}; accessible flow buttons are listed below`}>
          <title>Top seller-to-customer state flows by {MEASURES[measure]} (top 15 plus focused pairs when needed)</title>
          <text className="sankey-side-heading" x={134} y={16}>SELLER ORIGINS</text>
          <text className="sankey-side-heading" x={WIDTH-132} y={16} textAnchor="end">CUSTOMER DESTINATIONS</text>
          {layout.links.map((link,i) => {
            const key = flowKey(link.sellerState,link.customerState);
            const selected = focusKeys.has(key);
            const dim = emphasized !== null && !emphasized.has(key);
            const d = path(link) ?? '';
            // Paint ribbons underneath nodes, then add hit targets after nodes below.
            // The accessible hit targets own all pointer and keyboard interaction.
            return <path key={`${link.sellerState}-${link.customerState}-${i}`} d={d} fill="none"
              aria-hidden="true" pointerEvents="none"
              className={`sankey-ribbon${selected ? ' sankey-ribbon-active' : ''}${dim ? ' sankey-ribbon-dim' : ''}`}
              strokeWidth={Math.max(1, link.width ?? 1)} />;
          })}
          {layout.nodes.map(node => {
            const left = node.side === 'origin';
            const selectedByGlobal = left ? filters.sellerStates.includes(node.state) : filters.customerStates.includes(node.state);
            const selectedByFocus = filters.focusedFlows.some(pair => (left ? pair.sellerState : pair.customerState) === node.state);
            const dim = emphasized !== null && !layout.links.some(link=>
              emphasized.has(flowKey(link.sellerState,link.customerState)) &&
              (left ? link.sellerState : link.customerState) === node.state);
            const x0 = node.x0 ?? 0, y0 = node.y0 ?? 0, x1 = node.x1 ?? 0, y1 = node.y1 ?? 0;
            const count = node.value ?? 0;
            return <g key={node.id} className={dim ? 'sankey-node-dim' : ''}>
              <rect x={x0} y={y0} width={x1-x0} height={Math.max(1,y1-y0)} rx={2} className={`${left?'sankey-origin-node':'sankey-dest-node'}${selectedByGlobal||selectedByFocus?' sankey-node-active':''}`} />
              <text className="sankey-node-label" x={left ? x0-7 : x1+7} y={(y0+y1)/2+3.5} textAnchor={left?'end':'start'}>{node.state} · {formatInteger(count)}</text>
              <title>{left?'Seller origin':'Customer destination'}: {stateLabel(node.state)} — {formatWeight(count,measure)} of matching items</title>
            </g>;
          })}
          {/* Transparent hit targets are drawn ABOVE the node labels/rectangles, so
              ribbons remain clickable at their endpoints and when very narrow. */}
          {layout.links.map((link,i)=>{
            const key=flowKey(link.sellerState,link.customerState);
            const selected=focusKeys.has(key);
            const choose=(additive:boolean)=>selectPair(link.sellerState,link.customerState,additive);
            return <path key={`hit-${link.sellerState}-${link.customerState}-${i}`}
              d={path(link) ?? ''} fill="none" stroke="transparent"
                className="sankey-ribbon-hit"
              strokeWidth={Math.max(12,link.width ?? 1)} pointerEvents="stroke"
              role="button" tabIndex={0} aria-label={`Sankey flow ${key}`}
              aria-pressed={selected} style={{cursor:'pointer',outline:'none'}}
              onMouseEnter={()=>setHoveredPair(key)} onMouseLeave={()=>setHoveredPair(null)}
              onFocus={()=>setHoveredPair(key)} onBlur={()=>setHoveredPair(null)}
              onClick={event=>choose(event.ctrlKey||event.metaKey)}
              onKeyDown={event=>{
                if(event.key==='Enter'||event.key===' '){
                  event.preventDefault();
                  choose(event.ctrlKey||event.metaKey);
                }
              }}>
              <title>{stateLabel(link.sellerState)} → {stateLabel(link.customerState)}: {formatWeight(link.value,measure)}. Click to focus; Ctrl/Cmd-click to add/remove focus.</title>
            </path>;
          })}
        </svg>
      </div>
      <div className="sankey-coverage" role="status"><span><span className="legend-dot"/> Displaying {formatPercentage(summary.coverage)} of {formatWeight(summary.mappableWeight,measure)} eligible, mappable {MEASURES[measure].toLowerCase()}</span>{summary.unmappableItemCount ? <span>{formatInteger(summary.unmappableItemCount)} items with unknown seller/destination state excluded from the diagram</span> : null}{measure !== 'items' && summary.invalidWeightItems ? <span>{formatInteger(summary.invalidWeightItems)} items with missing/invalid {MEASURES[measure].toLowerCase()} excluded from monetary denominator</span> : null}</div>
      <div className="flow-action-head">Add or remove focused flows <span>KEYBOARD-ACCESSIBLE MULTI-SELECTION</span></div>
      <div className="flow-action-grid" role="group" aria-label="Focus a directed seller-to-customer state pair">
        {summary.links.map((link,i) => {
          const key = flowKey(link.sellerState,link.customerState);
          return <button type="button" key={`${link.source}-${link.target}`} aria-pressed={focusKeys.has(key)}
            className={`flow-choice${emphasized && !emphasized.has(key) ? ' flow-choice-dim' : ''}`}
            onMouseEnter={()=>setHoveredPair(key)} onMouseLeave={()=>setHoveredPair(null)} onFocus={()=>setHoveredPair(key)} onBlur={()=>setHoveredPair(null)}
            onClick={()=>selectPair(link.sellerState,link.customerState,true)}>
            <span className="flow-rank">{i+1}</span><span className="flow-pair">{link.sellerState} <span aria-hidden="true">→</span> {link.customerState}</span><span>{formatWeight(link.weight,measure)}</span>
          </button>;
        })}
      </div>
    </>}
    <p className="viz-smallprint">The overview always uses global multi-select filters, not the focused order cohort. A focused flow outside the current top 15 is pinned when its selected measure has positive weight; zero-value focused flows remain selected but cannot draw a monetary ribbon. SP → SP and other intra-state links remain distinct from source/destination nodes. Multiple items from one order contribute separately. Monetary modes use recorded valid item values, not carrier operating costs; zero-weight links do not appear.</p>
  </div>;
}
