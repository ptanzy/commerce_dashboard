import { useEffect, useMemo, useState } from 'react';
import type { Dispatch } from 'react';
import { ArrowDown, ArrowUp, Clock3, Route } from 'lucide-react';
import type { Cohort } from '../domain/selectors';
import { fulfillmentLifecycle, shippingCorridorScorecard } from '../domain/operationalPerformance';
import type { CorridorSort, ShippingCorridorRow } from '../domain/operationalPerformance';
import type { FilterAction, Filters } from '../domain/types';

const integer = new Intl.NumberFormat('en-US');
const fmtDays = (value: number|null) => value === null ? 'N/A' : `${value.toFixed(2)} d`;
const fmtRate = (value: number|null) => value === null ? 'N/A' : `${(value*100).toFixed(1)}%`;
const fmtN = (n: number) => integer.format(n);
import {TablePageSizeControl,useTablePageSize} from './TablePageSizeControl';
import type {TablePageSize} from '../domain/dashboardTablePreferences';

/** Stage durations belong to the current focused order cohort. Never infer a missing timestamp as zero. */
export function FulfillmentLifecyclePanel({cohort}:{cohort:Cohort}) {
  const summary = useMemo(()=>fulfillmentLifecycle(cohort),[cohort]);
  const maximum = Math.max(1,...summary.stages.map(stage=>stage.p95Days ?? 0));
  const hasMilestones = summary.stages.some(stage=>stage.id!=='purchaseToDelivery' && stage.milestoneFieldsExported);
  return <section className="viz-card operational-card" aria-labelledby="lifecycle-title">
    <div className="viz-heading"><span className="future-icon"><Clock3 size={19} aria-hidden="true"/></span>
      <div><h3 id="lifecycle-title">Fulfillment lifecycle</h3><p>From order purchase to customer delivery · stage durations</p></div></div>
    <div className="viz-body operational-body">
      <p className="viz-caption">{fmtN(summary.cohortOrders)} matching orders · Median and P95 are calculated from valid order-level milestones (days).</p>
      {!hasMilestones && summary.cohortOrders>0 ? <p className="operational-notice" role="status">Approval and carrier-handoff timestamps are not in this export. Re-run the local Olist preparation script to unlock complete stage analysis. Missing milestones are not counted as zero.</p> : null}
      {summary.cohortOrders===0 ? <p className="viz-empty">No fulfillment-stage records in this selection. Adjust the dashboard filters to examine delivery stages.</p> :
        <div className="lifecycle-rows" aria-label="Fulfillment stage durations">
          {summary.stages.map(stage => <div className="lifecycle-row" key={stage.id}>
            <div className="lifecycle-row-header"><strong>{stage.label}</strong><span>{stage.milestoneFieldsExported ? `${fmtN(stage.eligibleOrders)} / ${fmtN(summary.cohortOrders)} eligible` : 'Source unavailable'}</span></div>
            {stage.medianDays===null ? <div className="lifecycle-unavailable">{!stage.milestoneFieldsExported ? 'Milestone not exported' : 'No valid completed intervals'}</div> :
              <div className="lifecycle-track" role="img" aria-label={`${stage.label}: median ${fmtDays(stage.medianDays)} and P95 ${fmtDays(stage.p95Days)} among ${stage.eligibleOrders} valid orders`}>
                <div className="lifecycle-p95" style={{width:`${100*(stage.p95Days??0)/maximum}%`}}/>
                <div className="lifecycle-median" style={{width:`${100*stage.medianDays/maximum}%`}}/>
              </div>}
            <div className="lifecycle-statline"><span>Median: {fmtDays(stage.medianDays)}</span><span>P95: {fmtDays(stage.p95Days)}</span>
              {stage.invalidSequenceOrders>0 ? <span>{fmtN(stage.invalidSequenceOrders)} invalid sequences</span> : null}</div>
          </div>)}
        </div>}
      <div className="operational-legend"><span><i className="operational-legend-p95"/> P95 duration</span><span><i className="operational-legend-median"/> Median duration</span></div>
      <p className="viz-smallprint">Durations describe elapsed time, not responsibility for delay. Stage denominators differ when events are missing or invalid. Promise accuracy is distinct from time in transit. {summary.promiseEligibleOrders>0 ? `Among ${fmtN(summary.promiseEligibleOrders)} orders with a valid delivery promise, the median calendar-day difference between actual and promised delivery was ${fmtDays(summary.medianDaysPastPromise)} (positive means later than promised).` : ''}</p>
    </div>
  </section>;
}

const SORT_COLUMNS: readonly {key:CorridorSort;label:string}[] = [
  {key:'orders',label:'Orders'}, {key:'items',label:'Items'}, {key:'onTime',label:'On-time'},
  {key:'median',label:'Median'}, {key:'p95',label:'P95'}, {key:'freightRatio',label:'Freight / item value'},
];
function sortValue(row:ShippingCorridorRow,sort:CorridorSort):number|null {
  switch(sort){
    case 'orders':return row.distinctOrders; case 'items':return row.matchedItems;
    case 'onTime':return row.onTimeRate; case 'median':return row.medianDeliveryDays;
    case 'p95':return row.p95DeliveryDays; case 'freightRatio':return row.freightToPriceRatio;
  }
}
function showValue(row:ShippingCorridorRow,sort:CorridorSort):string {
  switch(sort){
    case 'orders':return fmtN(row.distinctOrders); case 'items':return fmtN(row.matchedItems);
    case 'onTime':return fmtRate(row.onTimeRate); case 'median':return fmtDays(row.medianDeliveryDays);
    case 'p95':return fmtDays(row.p95DeliveryDays); case 'freightRatio':return fmtRate(row.freightToPriceRatio);
  }
}

/** Preselected global cohort: Sankey's contextual flow list must remain unaffected by focused pairs. */
export function ShippingCorridorScorecardPanel({cohort,selectionFilters,dispatch,pageSize:configuredPageSize,onPageSizeChange}: {
  cohort:Cohort;selectionFilters:Filters;dispatch:Dispatch<FilterAction>;
  pageSize?:TablePageSize;onPageSizeChange?:(value:TablePageSize)=>void;
}) {
  const summary=useMemo(()=>shippingCorridorScorecard(cohort),[cohort]);
  const [pageSize,changePageSize]=useTablePageSize(configuredPageSize,onPageSizeChange);
  const [search,setSearch]=useState('');
  const [sort,setSort]=useState<CorridorSort>('orders');
  const [descending,setDescending]=useState(true);
  const [page,setPage]=useState(0);
  const [minOrders,setMinOrders]=useState(1);
  const rows=useMemo(()=>{
    const term=search.trim().toUpperCase();
    return summary.rows.filter(row=>row.distinctOrders>=minOrders &&
      (!term || `${row.sellerState} ${row.customerState} ${row.sellerState}→${row.customerState}`.toUpperCase().includes(term)))
      .sort((a,b)=>{
        const av=sortValue(a,sort),bv=sortValue(b,sort);
        if(av===null)return bv===null?0:1;
        if(bv===null)return -1;
        return (descending?-1:1)*(av-bv) || a.sellerState.localeCompare(b.sellerState) || a.customerState.localeCompare(b.customerState);
      });
  },[summary,search,minOrders,sort,descending]);
  useEffect(()=>setPage(0),[search,minOrders,sort,descending,cohort]);
  const pageCount=Math.max(1,Math.ceil(rows.length/pageSize));
  const safePage=Math.min(page,pageCount-1);
  const visibleRows=rows.slice(safePage*pageSize,(safePage+1)*pageSize);
  const chooseSort=(key:CorridorSort)=>{if(key===sort)setDescending(!descending);else{setSort(key);setDescending(key!=='median'&&key!=='p95');}};
  const focus=(row:ShippingCorridorRow)=>dispatch({type:'focus_flow',sellerState:row.sellerState,customerState:row.customerState});
  return <section className="viz-card operational-card" aria-labelledby="corridor-title">
    <div className="viz-heading"><span className="future-icon"><Route size={19} aria-hidden="true"/></span>
      <div><h3 id="corridor-title">Shipping corridor scorecard</h3><p>Every mappable seller-origin → customer-destination state corridor</p></div></div>
    <div className="viz-body operational-body">
      <div className="operational-summary"><strong>{fmtN(summary.totalCorridors)} directed corridors</strong><span>{fmtN(summary.mappableItems)} matched, mappable items · {fmtN(summary.unmappableItems)} unmappable</span></div>
      <div className="corridor-controls">
        <label>Find corridor <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="e.g. SP MG" aria-label="Find shipping corridor"/></label>
        <label>Minimum orders <select value={minOrders} onChange={e=>setMinOrders(Number(e.target.value))} aria-label="Minimum corridor orders"><option value="1">1+</option><option value="30">30+</option><option value="100">100+</option><option value="1000">1,000+</option></select></label>
      </div>
      <div className="corridor-table-wrap"><table className="corridor-table" aria-label="Shipping corridor performance scorecard">
        <thead><tr><th scope="col">Corridor</th>{SORT_COLUMNS.map(column=><th scope="col" key={column.key} aria-sort={sort===column.key?(descending?'descending':'ascending'):'none'}><button type="button" onClick={()=>chooseSort(column.key)} aria-label={`Sort by ${column.label}${sort===column.key?(descending?', descending':', ascending'):''}`}>{column.label} {sort===column.key?(descending?<ArrowDown size={12} aria-hidden="true"/>:<ArrowUp size={12} aria-hidden="true"/>):null}</button></th>)}<th scope="col">Investigate</th></tr></thead>
        <tbody>{visibleRows.map(row=>{
          const active=selectionFilters.focusedFlows.some(pair=>pair.sellerState===row.sellerState&&pair.customerState===row.customerState);
          const compatible=(!selectionFilters.sellerStates.length||selectionFilters.sellerStates.includes(row.sellerState)) && (!selectionFilters.customerStates.length||selectionFilters.customerStates.includes(row.customerState));
          return <tr key={`${row.sellerState}-${row.customerState}`} className={active?'corridor-focused':''}>
            <th scope="row">{row.sellerState}→{row.customerState}</th>{SORT_COLUMNS.map(col=><td key={col.key} title={col.key==='onTime'?`${fmtN(row.onTimeDenominator)} on-time eligible orders`:col.key==='median'||col.key==='p95'?`${fmtN(row.deliveredDurationCount)} duration eligible orders`:col.key==='freightRatio'?`${fmtN(row.missingPriceItems)} missing price and ${fmtN(row.missingFreightItems)} missing freight items`:undefined}>
              {showValue(row,col.key)}{col.key==='onTime'?<small> n={fmtN(row.onTimeDenominator)}{row.onTimeDenominator<30?' · low N':''}</small>:null}
            </td>)}<td><button className="corridor-focus" type="button" aria-pressed={active} disabled={!compatible} onClick={()=>focus(row)} aria-label={`${active?'Clear':'Focus'} shipping corridor ${row.sellerState} to ${row.customerState}`} title="Apply exact directed flow to KPI and order drill-down">{active?'Clear focus':'Focus flow'}</button></td>
          </tr>;
        })}</tbody>
      </table></div>
      {rows.length===0?<p className="viz-empty">No corridors match the search and minimum order count.</p>:null}
      <div className="corridor-pagination" aria-label="Corridor scorecard pagination">
        <TablePageSizeControl label="Shipping corridor rows per page" value={pageSize} onChange={size=>{setPage(0);changePageSize(size);}}/>
        <span>{rows.length ? `${fmtN(safePage*pageSize+1)}–${fmtN(Math.min((safePage+1)*pageSize,rows.length))} of ${fmtN(rows.length)}` : '0 results'}</span>
        <button type="button" onClick={()=>setPage(Math.max(0,safePage-1))} disabled={safePage===0}>Previous</button>
        <span>Page {safePage+1} of {pageCount}</span>
        <button type="button" onClick={()=>setPage(safePage+1)} disabled={safePage>=pageCount-1}>Next</button>
      </div>
      <p className="viz-smallprint">Each corridor counts distinct orders, but multi-seller orders can appear in several corridors; do not sum order counts across rows. On-time rates and delivery durations exclude unknown outcomes. Freight is the customer's charged amount relative to matched item value, not carrier operating cost. Focus flow changes the KPI/Order Explorer cohort but not this global-context scorecard.</p>
    </div>
  </section>;
}
