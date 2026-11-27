import {useEffect,useMemo,useState} from 'react';
import {Star} from 'lucide-react';
import type {Cohort} from '../domain/selectors';
import {customerExperience} from '../domain/customerExperience';
import type {ReviewGroup,ReviewSegment} from '../domain/customerExperience';

const number=new Intl.NumberFormat('en-US');
const fmt=(x:number)=>number.format(x);
const rating=(x:number|null)=>x===null?'N/A':`${x.toFixed(2)} / 5`;
const pct=(x:number|null)=>x===null?'N/A':`${(x*100).toFixed(1)}%`;
import {TablePageSizeControl,useTablePageSize} from './TablePageSizeControl';
import type {TablePageSize} from '../domain/dashboardTablePreferences';
const TABS:readonly {key:ReviewSegment;label:string}[]=[
  {key:'category',label:'Categories'},{key:'corridor',label:'Shipping corridors'},{key:'seller',label:'Sellers'}
];
export function CustomerExperiencePanel({cohort,reviewsAvailable,pageSize:configuredPageSize,onPageSizeChange}:{
  cohort:Cohort;reviewsAvailable:boolean;pageSize?:TablePageSize;
  onPageSizeChange?:(value:TablePageSize)=>void;
}){
  const [pageSize,changePageSize]=useTablePageSize(configuredPageSize,onPageSizeChange);
  const summary=useMemo(()=>customerExperience(reviewsAvailable?cohort:{eligibleOrders:[],eligibleItems:[],eligibleOrderIds:new Set<string>()}),[cohort,reviewsAvailable]);
  const [segment,setSegment]=useState<ReviewSegment>('category');
  const [search,setSearch]=useState('');
  const [minReviews,setMinReviews]=useState(30);
  const [sort,setSort]=useState<'orders'|'rating'|'onTime'>('orders');
  const [ascending,setAscending]=useState(false);
  const [page,setPage]=useState(0);
  useEffect(()=>setPage(0),[segment,search,minReviews,sort,ascending,cohort]);
  const groups=segment==='category'?summary.byCategory:segment==='corridor'?summary.byCorridor:summary.bySeller;
  const rows=useMemo(()=>groups.filter(r=>r.reviewedOrders>=minReviews &&
    r.id.toLocaleLowerCase('en-US').includes(search.trim().toLocaleLowerCase('en-US')))
    .sort((a,b)=>{
      const av=sort==='orders'?a.reviewedOrders:sort==='rating'?a.meanOrderRating:a.onTimeRateAmongReviewed;
      const bv=sort==='orders'?b.reviewedOrders:sort==='rating'?b.meanOrderRating:b.onTimeRateAmongReviewed;
      if(av===null)return bv===null?a.id.localeCompare(b.id):1;
      if(bv===null)return -1;
      return (ascending?1:-1)*(av-bv)||a.id.localeCompare(b.id);
    }),[groups,minReviews,search,sort,ascending]);
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));
  const currentPage=Math.min(page,pages-1);
  const onSort=(value:typeof sort)=>{if(value===sort)setAscending(!ascending);else{setSort(value);setAscending(value==='rating');}};
  const outcomeOrder=['early','on_time','late','unknown'];
  const outcomeLabels:{[name:string]:string}={early:'Early',on_time:'On time',late:'Late',unknown:'Unknown / undelivered'};
  const outcomes=outcomeOrder.map(k=>summary.byOutcome.find(r=>r.id===k)).filter((r):r is ReviewGroup=>Boolean(r));
  return <section className="viz-card operational-card customer-experience" aria-labelledby="customer-experience-title">
    <div className="viz-heading"><span className="future-icon"><Star size={19} aria-hidden="true"/></span>
      <div><h3 id="customer-experience-title">Customer experience &amp; satisfaction</h3><p>Review scores associated with delivery outcomes and order segments</p></div></div>
    <div className="viz-body operational-body">
      {!reviewsAvailable ? <div className="operational-notice" role="status">
        <strong>Customer review data is not included in this export.</strong>
        <p>Rebuild the local dataset using the original Olist archive containing <code>olist_order_reviews_dataset.csv</code> to unlock ratings. Existing delivery and financial data remain unchanged.</p>
      </div> : <>
        <div className="operational-summary"><strong>{fmt(summary.reviewedOrders)} reviewed orders</strong>
          <span>{fmt(summary.reviewCount)} valid reviews · {pct(summary.coverageRate)} of selected orders reviewed · Mean review score {rating(summary.meanReviewScore)}</span></div>
        <p className="viz-smallprint">Ratings describe only reviewed orders and may be subject to response bias. Review scores are linked to whole orders, not individual sellers or products. Where an order has multiple reviews, segment averages use one mean rating per order. No review text or reviewer identity is imported.</p>
        {summary.eligibleOrders===0?<p className="operational-notice">No orders in this selection. Adjust the dashboard filters.</p>:
         summary.reviewedOrders===0?<p className="operational-notice">No reviewed orders in this selection; satisfaction metrics are unavailable.</p>:<>
          <div className="customer-review-grid">
            <section aria-label="Review score distribution">
              <h4>Review score distribution</h4>
              <p className="viz-smallprint">Counts of valid individual reviews (not distinct orders)</p>
              {summary.scoreCounts.map((n,i)=><div key={i} className="customer-rating-row">
                <span>{i+1} ★</span><div className="customer-rating-track" role="img" aria-label={`${i+1} stars: ${fmt(n)} reviews`}>
                  <div style={{width:`${summary.reviewCount?100*n/summary.reviewCount:0}%`}}/></div><strong>{fmt(n)}</strong>
              </div>)}
            </section>
            <section aria-label="Review scores by delivery outcome">
              <h4>Satisfaction by delivery outcome</h4>
              <p className="viz-smallprint">Mean order score for reviewed orders; association only</p>
              <table className="customer-outcome-table"><thead><tr><th scope="col">Outcome</th><th scope="col">Reviewed orders</th><th scope="col">Mean score</th></tr></thead>
                <tbody>{outcomes.map(r=><tr key={r.id}><th scope="row">{outcomeLabels[r.id]??r.id}</th><td>{fmt(r.reviewedOrders)}</td><td>{rating(r.meanOrderRating)}</td></tr>)}</tbody></table>
            </section>
          </div>
          <section aria-label="Satisfaction segments" className="customer-segments">
            <h4>Satisfaction by segment</h4>
            <div className="customer-segment-controls">
              <div role="group" aria-label="Satisfaction segment dimension">{TABS.map(t=><button type="button" key={t.key} aria-pressed={segment===t.key} onClick={()=>setSegment(t.key)}>{t.label}</button>)}</div>
              <label>Find segment <input type="search" aria-label="Find satisfaction segment" value={search} onChange={e=>setSearch(e.target.value)} /></label>
              <label>Minimum reviewed orders <select aria-label="Minimum reviewed orders" value={minReviews} onChange={e=>setMinReviews(Number(e.target.value))}>
                {[1,10,30,100].map(n=><option value={n} key={n}>{n}</option>)}</select></label>
            </div>
            <div className="corridor-table-wrap"><table className="corridor-table customer-segment-table" aria-label="Customer satisfaction segment scorecard">
              <thead><tr><th scope="col">{segment==='category'?'Category':segment==='corridor'?'Shipping corridor':'Seller ID'}</th>
                <th scope="col" aria-sort={sort==='orders'?(ascending?'ascending':'descending'):'none'}><button onClick={()=>onSort('orders')}>Reviewed orders</button></th>
                <th scope="col" aria-sort={sort==='rating'?(ascending?'ascending':'descending'):'none'}><button onClick={()=>onSort('rating')}>Mean rating</button></th>
                <th scope="col" aria-sort={sort==='onTime'?(ascending?'ascending':'descending'):'none'}><button onClick={()=>onSort('onTime')}>On-time among reviewed</button></th></tr></thead>
              <tbody>{rows.slice(currentPage*pageSize,(currentPage+1)*pageSize).map(r=><tr key={r.id}><th scope="row">{r.id}</th><td>{fmt(r.reviewedOrders)}</td><td>{rating(r.meanOrderRating)}</td><td>{pct(r.onTimeRateAmongReviewed)} <small>({fmt(r.onTimeEligibleReviewedOrders)} eligible)</small></td></tr>)}</tbody>
            </table></div>
            {rows.length===0?<p className="viz-smallprint">No segments meet the search and minimum sample requirements.</p>:null}
            <div className="corridor-pagination"><TablePageSizeControl label="Customer satisfaction rows per page" value={pageSize} onChange={size=>{setPage(0);changePageSize(size);}}/><span>{fmt(rows.length)} matching segments · Page {currentPage+1} of {pages}</span>
              <button type="button" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous</button>
              <button type="button" disabled={currentPage>=pages-1} onClick={()=>setPage(currentPage+1)}>Next</button></div>
            <p className="viz-smallprint">Segment membership can overlap: multi-item or multi-seller orders appear in each associated segment, but only once within each segment. On-time rates exclude unknown delivery outcomes. Seller/corridor associations do not prove causation. Small samples are suppressed by the selected minimum.</p>
          </section>
        </>}
      </>}
    </div>
  </section>;
}
