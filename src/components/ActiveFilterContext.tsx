import { useState } from 'react';
import type { Dispatch } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { categoryLabel } from '../domain/selectors';
import type { FilterAction, Filters } from '../domain/types';
import { stateLabel } from './stateNames';

/** Always truthful about the global cohort even if the control that set a filter is hidden. */
export function ActiveFilterContext({filters,dispatch,filterPanelVisible,onShowFilterPanel}: {
  filters:Filters; dispatch:Dispatch<FilterAction>;filterPanelVisible:boolean;onShowFilterPanel:()=>void;
}) {
  const [expanded,setExpanded]=useState(false);
  const dateActive=filters.purchaseDateFrom!==null||filters.purchaseDateTo!==null;
  const count=filters.sellerStates.length+filters.customerStates.length+filters.categories.length+
    filters.focusedFlows.length+Number(dateActive);
  return <section className="workspace-filter-context" aria-label="Active dashboard filter context">
    <div className="workspace-filter-context-top">
      {count>0 ? <button type="button" className="workspace-filter-disclosure" aria-expanded={expanded}
        aria-controls="workspace-filter-details" onClick={()=>setExpanded(value=>!value)}>
        Filters Active <span className="workspace-filter-count">{count}</span>
        {expanded?<ChevronDown size={15} aria-hidden="true"/>:<ChevronRight size={15} aria-hidden="true"/>}
      </button> : <span className="workspace-filter-inactive">No filters active</span>}
      {filters.focusedFlows.length ? <button type="button" className="workspace-filter-clear" onClick={()=>dispatch({type:'clear_flow_focus'})}>Clear flow focus</button> : null}
      {!filterPanelVisible ? <button type="button" className="workspace-filter-show" onClick={onShowFilterPanel}>Show filter controls</button> : null}
    </div>
    {count>0 && expanded ? <div id="workspace-filter-details" className="workspace-filter-details">
      <p>These constraints remain applied even when the chart or filter controls that selected them are hidden.</p>
      <ul>
        {filters.sellerStates.map(code=><li key={`s-${code}`}><span>Seller origin: {stateLabel(code)}</span><button type="button" aria-label={`Remove seller origin ${code}`} onClick={()=>dispatch({type:'toggle_value',dimension:'sellerStates',value:code})}><X size={13} aria-hidden="true"/></button></li>)}
        {filters.customerStates.map(code=><li key={`d-${code}`}><span>Customer destination: {stateLabel(code)}</span><button type="button" aria-label={`Remove customer destination ${code}`} onClick={()=>dispatch({type:'toggle_value',dimension:'customerStates',value:code})}><X size={13} aria-hidden="true"/></button></li>)}
        {filters.categories.map(category=><li key={`c-${category}`}><span>Category: {categoryLabel(category)}</span><button type="button" aria-label={`Remove category ${categoryLabel(category)}`} onClick={()=>dispatch({type:'toggle_value',dimension:'categories',value:category})}><X size={13} aria-hidden="true"/></button></li>)}
        {dateActive?<li><span>Purchase date: {filters.purchaseDateFrom??'Start'} – {filters.purchaseDateTo??'End'}</span><button type="button" aria-label="Remove purchase date filter" onClick={()=>dispatch({type:'set_date_range',from:null,to:null})}><X size={13} aria-hidden="true"/></button></li>:null}
        {filters.focusedFlows.map(pair=><li key={`f-${pair.sellerState}-${pair.customerState}`}><span>Focused flow: {pair.sellerState} → {pair.customerState}</span><button type="button" aria-label={`Remove active flow filter ${pair.sellerState}→${pair.customerState}`} onClick={()=>dispatch({type:'toggle_flow_focus',sellerState:pair.sellerState,customerState:pair.customerState})}><X size={13} aria-hidden="true"/></button></li>)}
      </ul>
    </div>:null}
  </section>;
}
