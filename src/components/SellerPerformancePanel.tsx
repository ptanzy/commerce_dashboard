import {useEffect,useMemo,useState} from 'react';
import {Store,ArrowUp,ArrowDown} from 'lucide-react';
import type {Cohort} from '../domain/selectors';
import type {ItemFact} from '../domain/types';
import {sellerPerformance} from '../domain/sellerPerformance';
import type {SellerPerformanceRow} from '../domain/sellerPerformance';

import {TablePageSizeControl,useTablePageSize} from './TablePageSizeControl';
import type {TablePageSize} from '../domain/dashboardTablePreferences';
const integer=new Intl.NumberFormat('en-US');
const count=(n:number)=>integer.format(n);
const percentage=(n:number|null)=>n===null?'N/A':`${(n*100).toFixed(1)}%`;
const days=(n:number|null)=>n===null?'N/A':`${n.toFixed(2)} d`;
type SortKey='orders'|'items'|'onTime'|'median'|'p95'|'handoff'|'freightRatio';
const COLUMNS: readonly {key:SortKey;label:string}[]=[
  {key:'orders',label:'Orders'},{key:'items',label:'Items'},
  {key:'onTime',label:'On-time'},{key:'median',label:'Median delivery'},
  {key:'p95',label:'P95 delivery'},{key:'handoff',label:'Handoff median'},
  {key:'freightRatio',label:'Freight / item value'},
];
const getValue=(r:SellerPerformanceRow,k:SortKey):number|null=>{
  switch(k){case 'orders':return r.distinctOrders;case 'items':return r.matchedItems;
    case 'onTime':return r.onTimeRate;case 'median':return r.medianDeliveryDays;
    case 'p95':return r.p95DeliveryDays;case 'handoff':return r.medianHandoffDays;
    case 'freightRatio':return r.freightToItemValueRatio;}
};
const showValue=(r:SellerPerformanceRow,k:SortKey)=>{
  switch(k){case 'orders':return count(r.distinctOrders);case 'items':return count(r.matchedItems);
    case 'onTime':return `${percentage(r.onTimeRate)} (${count(r.onTimeDenominator)})`;
    case 'median':return days(r.medianDeliveryDays);case 'p95':return days(r.p95DeliveryDays);
    case 'handoff':return `${days(r.medianHandoffDays)} (${count(r.handoffEligibleOrders)})`;
    case 'freightRatio':return percentage(r.freightToItemValueRatio);}
};

/** Restricted visualization of the 60 highest-volume sellers with >=30 on-time eligible orders. */
function SellerVolumeScatter({rows}:{rows:readonly SellerPerformanceRow[]}){
  const eligible=useMemo(()=>rows.filter(r=>r.onTimeDenominator>=30 && r.onTimeRate!==null)
    .sort((a,b)=>b.distinctOrders-a.distinctOrders || a.sellerId.localeCompare(b.sellerId)).slice(0,60),[rows]);
  if(!eligible.length)return <p className="seller-scatter-unavailable">No sellers have at least 30 qualifying delivery outcomes in this selection. A comparison chart would be misleading.</p>;
  const maxVolume=Math.max(1,...eligible.map(r=>r.distinctOrders));
  const x=(n:number)=>50+590*Math.log1p(n)/Math.log1p(maxVolume);
  const y=(rate:number)=>164-128*rate;
  return <div className="seller-scatter-wrap">
    <svg className="seller-scatter" viewBox="0 0 680 205" role="img" aria-label={`Order volume versus on-time rate for ${eligible.length} high-volume sellers with at least 30 eligible outcomes; order axis uses logarithmic scale`}>
      {[0,.5,1].map(rate=><g key={rate}><line x1="50" x2="640" y1={y(rate)} y2={y(rate)} className="seller-scatter-grid"/>
        <text x="43" y={y(rate)+4} textAnchor="end" className="seller-scatter-label">{Math.round(rate*100)}%</text></g>)}
      <line x1="50" y1="164" x2="640" y2="164" className="seller-scatter-axis"/>
      <text x="50" y="185" className="seller-scatter-label">Low volume</text><text x="640" y="185" textAnchor="end" className="seller-scatter-label">High volume</text>
      {eligible.map(row=><circle key={row.sellerId} cx={x(row.distinctOrders)} cy={y(row.onTimeRate!)} r="4" className="seller-scatter-point">
        <title>{`${row.sellerId}: ${count(row.distinctOrders)} associated orders, ${percentage(row.onTimeRate)} on-time across ${count(row.onTimeDenominator)} eligible orders`}</title>
      </circle>)}
    </svg>
    <p className="viz-smallprint">Top {eligible.length} sellers by associated order volume, requiring ≥30 on-time-eligible orders. The horizontal scale is logarithmic. Order-level outcomes are associations, not seller fault.</p>
  </div>;
}

export function SellerPerformancePanel({cohort,allItems,pageSize:configuredPageSize,onPageSizeChange}:{
  cohort:Cohort;allItems:readonly ItemFact[];pageSize?:TablePageSize;
  onPageSizeChange?:(value:TablePageSize)=>void;
}){
  const [pageSize,changePageSize]=useTablePageSize(configuredPageSize,onPageSizeChange);
  const summary=useMemo(()=>sellerPerformance(cohort,allItems),[cohort,allItems]);
  const [search,setSearch]=useState('');
  const [minOrders,setMinOrders]=useState(1);
  const [sort,setSort]=useState<SortKey>('orders');
  const [desc,setDesc]=useState(true);
  const [page,setPage]=useState(0);
  const [detailId,setDetailId]=useState<string|null>(null);
  const rows=useMemo(()=>{
    const term=search.trim().toLocaleLowerCase('en-US');
    return summary.rows.filter(r=>r.distinctOrders>=minOrders &&
      (!term || r.sellerId.toLocaleLowerCase('en-US').includes(term) || (r.sellerState??'').toLocaleLowerCase('en-US').includes(term)))
      .sort((a,b)=>{
        const av=getValue(a,sort),bv=getValue(b,sort);
        if(av===null)return bv===null?a.sellerId.localeCompare(b.sellerId):1;
        if(bv===null)return -1;
        return (desc?-1:1)*(av-bv) || a.sellerId.localeCompare(b.sellerId);
      });
  },[summary,search,minOrders,sort,desc]);
  useEffect(()=>setPage(0),[search,minOrders,sort,desc,cohort]);
  useEffect(()=>setDetailId(null),[cohort]);
  const totalPages=Math.max(1,Math.ceil(rows.length/pageSize));
  const currentPage=Math.min(page,totalPages-1);
  const pageRows=rows.slice(currentPage*pageSize,(currentPage+1)*pageSize);
  const detail=rows.find(r=>r.sellerId===detailId);
  const changeSort=(key:SortKey)=>{
    if(key===sort)setDesc(!desc);
    else {setSort(key);setDesc(!['median','p95','handoff','freightRatio'].includes(key));}
  };
  return <section className="viz-card operational-card seller-performance" aria-labelledby="seller-performance-title">
    <div className="viz-heading"><span className="future-icon"><Store size={19} aria-hidden="true"/></span>
      <div><h3 id="seller-performance-title">Seller performance</h3><p>Seller-associated volume, service outcomes, and matched freight charges</p></div></div>
    <div className="viz-body operational-body">
      <div className="operational-summary"><strong>{count(summary.totalSellers)} sellers</strong><span>{count(summary.matchedItems)} matched items · {count(summary.itemsWithoutSeller)} without a seller ID</span></div>
      <p className="viz-smallprint">Uses the global date, origin, destination, and category filters; Sankey directed-flow focus does not narrow this overview. Delivery outcomes are recorded per order. Orders involving multiple sellers are included in every associated seller's row; do not add seller order counts together. Seller-specific causality cannot be established.</p>
      <SellerVolumeScatter rows={summary.rows}/>
      {!summary.handoffFieldsExported && summary.totalSellers>0 ? <p className="operational-notice" role="status">Approval/carrier-handoff milestones are not exported in this dataset. Re-export with the updated local ETL to unlock single-seller handoff durations; unavailable values are not zero.</p>:null}
      <div className="corridor-controls">
        <label>Find seller <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Seller ID or state" aria-label="Find seller"/></label>
        <label>Minimum orders <select value={minOrders} onChange={e=>setMinOrders(Number(e.target.value))} aria-label="Minimum seller orders"><option value="1">1+</option><option value="10">10+</option><option value="30">30+</option><option value="100">100+</option></select></label>
      </div>
      <div className="corridor-table-wrap"><table className="corridor-table seller-table" aria-label="Seller performance scorecard">
        <thead><tr><th scope="col">Seller</th><th scope="col">Origin</th>{COLUMNS.map(col=><th scope="col" key={col.key} aria-sort={sort===col.key?(desc?'descending':'ascending'):'none'}>
          <button type="button" onClick={()=>changeSort(col.key)} aria-label={`Sort sellers by ${col.label}`}>{col.label} {sort===col.key?(desc?<ArrowDown size={13} aria-hidden="true"/>:<ArrowUp size={13} aria-hidden="true"/>):null}</button>
        </th>)}<th scope="col">Details</th></tr></thead>
        <tbody>{pageRows.map(row=><tr key={row.sellerId}>
          <th scope="row"><code className="seller-id" title={row.sellerId}>{row.sellerId}</code></th><td>{row.sellerState??'N/A'}</td>
          {COLUMNS.map(col=><td key={col.key}>{showValue(row,col.key)}</td>)}
          <td><button type="button" aria-expanded={detailId===row.sellerId} aria-label={`${detailId===row.sellerId?'Close':'Inspect'} seller ${row.sellerId}`} onClick={()=>setDetailId(detailId===row.sellerId?null:row.sellerId)}>{detailId===row.sellerId?'Close':'Inspect'}</button></td>
        </tr>)}</tbody></table></div>
      {!rows.length?<p className="viz-empty">No sellers satisfy this search and minimum-order threshold.</p>:null}
      <div className="corridor-pagination" aria-label="Seller scorecard pages">
        <TablePageSizeControl label="Seller rows per page" value={pageSize} onChange={size=>{setPage(0);changePageSize(size);}}/>
        <span>{rows.length?`${count(currentPage*pageSize+1)}–${count(Math.min((currentPage+1)*pageSize,rows.length))} of ${count(rows.length)}`:'0 sellers'} · Page {currentPage+1} of {totalPages}</span>
        <div><button type="button" onClick={()=>setPage(Math.max(0,currentPage-1))} disabled={currentPage===0}>Previous</button>
          <button type="button" onClick={()=>setPage(Math.min(totalPages-1,currentPage+1))} disabled={currentPage>=totalPages-1}>Next</button></div>
      </div>
      {detail?<section className="seller-detail" aria-label={`Seller ${detail.sellerId} details`}>
        <div className="seller-detail-heading"><strong>Seller {detail.sellerId}</strong><button type="button" onClick={()=>setDetailId(null)}>Close details</button></div>
        <p>{count(detail.singleSellerOrders)} single-seller orders · {count(detail.multiSellerOrders)} multi-seller orders · {count(detail.onTimeDenominator)} on-time eligible · {count(detail.deliveryDurationCount)} delivery durations</p>
        <p>Handoff timing: {days(detail.medianHandoffDays)} median from {count(detail.handoffEligibleOrders)} qualifying single-seller orders. This is order-level elapsed time, not proof of seller delay.</p>
        <div className="seller-detail-grid"><div><strong>Top matched categories</strong><ul>{detail.topCategories.map(c=><li key={c.category}>{c.category}: {count(c.items)} items</li>)}</ul></div>
          <div><strong>Top delivery destinations</strong><ul>{detail.topDestinationStates.map(d=><li key={d.state}>{d.state}: {count(d.orders)} associated orders</li>)}</ul></div></div>
      </section>:null}
      <p className="viz-smallprint">On-time rate denominator is eligible delivered orders (n shown in parentheses). Handoff median uses only single-seller orders with valid approval and handoff timestamps. Freight is the charge recorded on matched items, not actual logistics cost; missing financial values remain unavailable.</p>
    </div>
  </section>;
}
