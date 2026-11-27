import { clockNow, recordEvent, recordUserAction, recordTiming, setDiagnosticView } from '../observability/diagnostics';
import { useEffect, useMemo, useState } from 'react';
import { registerRecoveryHandler } from '../observability/recovery';
import { BarChart3, Download, FileText, Layers3, TrendingUp } from 'lucide-react';
import type { DataIndex } from '../data/indexes';
import type { Cohort, Metrics } from '../domain/selectors';
import type { Filters } from '../domain/types';
import { categoryLeaderboard, delayDistribution, metricDelta, previousPeriod } from '../domain/exploration';
import type { CategoryMeasure } from '../domain/exploration';
import type { DashboardChartViews } from '../domain/dashboardWorkspace';
import { categoryLabel } from '../domain/selectors';
import { exportCohortCsv } from '../domain/exportCsv';
import { formatInteger, formatPercentage, formatDays } from './format';

const brl=new Intl.NumberFormat('en-US',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const pctPoints=(v:number|null)=>v===null?'N/A':`${v>0?'+':''}${(v*100).toFixed(1)} pp`;
const days=(v:number|null)=>v===null?'N/A':`${v>0?'+':''}${v.toFixed(1)} d`;
const CATEGORY_METRICS:Record<CategoryMeasure,string>={orders:'Distinct orders',value:'Item value',freight:'Freight charged',onTime:'On-time rate'};
function showCategoryValue(row:ReturnType<typeof categoryLeaderboard>[number],metric:CategoryMeasure){
  return metric==='orders'?formatInteger(row.distinctOrders):metric==='value'?row.itemValueBRL===null?'—':brl.format(row.itemValueBRL):
    metric==='freight'?row.freightBRL===null?'—':brl.format(row.freightBRL):formatPercentage(row.onTimeRate);
}
export function CategoryLeaderboard({cohort,view,onViewChange}: {cohort:Cohort;
  view?:DashboardChartViews['category'];onViewChange?:(value:DashboardChartViews['category'])=>void}){
  const [localMetric,setLocalMetric]=useState<CategoryMeasure>('orders');
  const metric=view?.measure ?? localMetric;
  const chooseMetric=(next:CategoryMeasure)=>{if(view)onViewChange?.({measure:next});else setLocalMetric(next);};
  const rows=useMemo(()=>categoryLeaderboard(cohort,metric,10),[cohort,metric]);
  const maximum=Math.max(0,...rows.map(row=>metric==='orders'?row.distinctOrders:metric==='value'?row.itemValueBRL??0:metric==='freight'?row.freightBRL??0:row.onTimeDenominator>=30?row.onTimeRate??0:0));
  return <section className="viz-card insight-card" aria-labelledby="category-ranking-title">
    <div className="viz-heading"><span className="future-icon"><Layers3 size={18} aria-hidden="true"/></span><div><h3 id="category-ranking-title">Product category leaderboard</h3><p>Matching items · order-level performance</p></div></div>
    <div className="viz-body insight-body">
      <div className="insight-measures" role="group" aria-label="Category ranking measurement">{(Object.keys(CATEGORY_METRICS) as CategoryMeasure[]).map(key=><button type="button" key={key} aria-pressed={metric===key} className={metric===key?'is-active':''} onClick={()=>{recordUserAction('CATEGORY_MEASURE_CHANGED','analytics');setDiagnosticView('categoryMeasure',key);chooseMetric(key);}}>{CATEGORY_METRICS[key]}</button>)}</div>
      {rows.length ? <ol className="category-bars">{rows.map((row,i)=>{
        const weight=metric==='orders'?row.distinctOrders:metric==='value'?row.itemValueBRL??0:metric==='freight'?row.freightBRL??0:row.onTimeDenominator>=30?row.onTimeRate??0:0;
        const eligible=metric!=='onTime'||row.onTimeDenominator>=30;
        return <li key={row.category} className="category-row" title={`${row.distinctOrders} distinct orders, ${row.itemCount} matching items, ${row.onTimeDenominator} eligible deliveries`}>
          <span className="category-rank">{i+1}</span><span className="category-name" title={categoryLabel(row.category)}>{categoryLabel(row.category)}</span>
          <div className="category-track" aria-hidden="true"><div style={{width:`${eligible && maximum>0?100*weight/maximum:0}%`}}/></div>
          <span className="category-value">{metric==='onTime'&&!eligible?'Low N':showCategoryValue(row,metric)}</span>
        </li>;
      })}</ol> : <p className="viz-empty">No matching item categories in this cohort.</p>}
      <p className="viz-smallprint">A category counts each order once, even when several items belong to that category. Money sums matching item contributions only; missing values are not zero. On-time rankings require ≥30 punctuality-eligible deliveries per category. A multi-category order can appear in multiple categories.</p>
    </div>
  </section>;
}

export function DelayDistributionChart({cohort}: {cohort:Cohort}) {
  const data=useMemo(()=>delayDistribution(cohort),[cohort]);
  const max=Math.max(1,...data.buckets.map(b=>b.count));
  return <section className="viz-card insight-card" aria-labelledby="delay-chart-title">
    <div className="viz-heading"><span className="future-icon"><BarChart3 size={18} aria-hidden="true"/></span><div><h3 id="delay-chart-title">Delivery timing distribution</h3><p>Calendar days relative to the promised delivery date</p></div></div>
    <div className="viz-body insight-body">
      <div className="insight-summary"><strong>{formatInteger(data.observed)}</strong> deliveries with a valid promise and actual delivery</div>
      {data.observed ? <div className="delay-bars" role="img" aria-label={`Delivery timing histogram of ${data.observed} valid deliveries, with ${data.withoutDelta} unknown or excluded orders`}>
        {data.buckets.map(bin=><div key={bin.id} className="delay-row"><span>{bin.label}</span><div className="delay-track"><div className={`delay-fill delay-${bin.kind}`} style={{width:`${bin.count/max*100}%`}}/></div><strong>{formatInteger(bin.count)}</strong><small>{formatPercentage(bin.share)}</small></div>)}
      </div> : <div className="viz-empty">No orders have a valid promised-versus-actual date difference.</div>}
      <p className="viz-smallprint">{formatInteger(data.withoutDelta)} orders lack a comparable delivery day delta or were not delivered; they are excluded. This uses calendar-day lateness, not the fractional purchase-to-delivery KPI.</p>
    </div>
  </section>;
}

function comparisonValue(current:number|null,prior:number|null,formatter:'days'|'points'|'percent',smallerBetter:boolean){
  const diff=metricDelta(current,prior);
  if(diff===null)return <span>N/A</span>;
  const display=formatter==='days'?days(diff):formatter==='points'?pctPoints(diff):
    prior===null||prior===0?'N/A':`${diff>0?'+':''}${(100*diff/prior).toFixed(1)}%`;
  const improvement=Math.abs(diff)<1e-9?'neutral':(diff<0)===smallerBetter?'positive':'negative';
  return <span className={`period-delta delta-${improvement}`}>{display}</span>;
}
export function PeriodComparisonPanel({index,filters,metrics}: {index:DataIndex;filters:Filters;metrics:Metrics}){
  const prior=useMemo(()=>previousPeriod(index,filters),[index,filters]);
  const complete=Boolean(filters.purchaseDateFrom&&filters.purchaseDateTo);
  const lines: Array<{label:string;current:number|null;previous:number|null;mode:'percent'|'points'|'days';lower:boolean;format:(value:number|null)=>string}> = prior ? [
    {label:'Distinct orders',current:metrics.distinctOrders,previous:prior.previousMetrics.distinctOrders,mode:'percent' as const,lower:false,format:(value:number|null)=>value===null?'N/A':formatInteger(value)},
    {label:'On-time rate',current:metrics.onTimeRate,previous:prior.previousMetrics.onTimeRate,mode:'points' as const,lower:false,format:formatPercentage},
    {label:'Median delivery',current:metrics.medianDeliveryDays,previous:prior.previousMetrics.medianDeliveryDays,mode:'days' as const,lower:true,format:formatDays},
    {label:'P95 delivery',current:metrics.p95DeliveryDays,previous:prior.previousMetrics.p95DeliveryDays,mode:'days' as const,lower:true,format:formatDays},
    {label:'Freight / price',current:metrics.freightToPriceRatio,previous:prior.previousMetrics.freightToPriceRatio,mode:'points' as const,lower:true,format:formatPercentage},
  ]:[];
  return <section className="viz-card period-panel" aria-labelledby="period-title"><div className="viz-heading"><span className="future-icon"><TrendingUp size={18} aria-hidden="true"/></span><div><h3 id="period-title">Previous-period comparison</h3><p>Same length, immediately preceding the selected purchase dates</p></div></div>
    <div className="viz-body insight-body">
      {!prior ? <p className="viz-caption">{complete?'A full equal-length preceding period is not available inside the historical dataset.':'Set both purchase dates to compare against the preceding period.'}</p> : <>
        <p className="viz-caption">Current: {prior.from} → {prior.to} · Previous: {prior.previousFrom} → {prior.previousTo} ({prior.days} calendar days each). All non-date filters and focused flows are retained.</p>
        <div className="period-grid" role="table" aria-label="Current versus previous period metrics">
          <div role="row" className="period-grid-head"><span role="columnheader">Metric</span><span role="columnheader">Current</span><span role="columnheader">Previous</span><span role="columnheader">Change</span></div>
          {lines.map(line=><div role="row" className="period-grid-row" key={line.label}><span role="cell">{line.label}</span><strong role="cell">{line.format(line.current)}</strong><span role="cell">{line.format(line.previous)}</span><span role="cell">{comparisonValue(line.current,line.previous,line.mode,line.lower)}</span></div>)}
        </div>
        <p className="viz-smallprint">Changes use percentage points for rates, days for durations, and relative percent for order count. Unavailable denominators remain N/A; comparisons are descriptive, not evidence of causation.</p>
      </>}
    </div>
  </section>;
}

/** Export selected DASHBOARD cohort (not the explorer's local search query). */
export function CsvExportButton({cohort}: {cohort:Cohort}){
  const [status,setStatus]=useState('');
  function download():boolean{
    recordUserAction('CSV_EXPORT_REQUESTED','analytics');
    const started=clockNow();
    let objectUrl:string|undefined;
    let cleanupScheduled=false;
    let link:HTMLAnchorElement|undefined;
    try {
      const csv=exportCohortCsv(cohort);
      objectUrl=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
      link=document.createElement('a');
      link.href=objectUrl;
      link.download='olist-filtered-orders.csv';
      document.body.appendChild(link);
      link.click();
      const url=objectUrl;
      const revoke=URL.revokeObjectURL.bind(URL);
      window.setTimeout(()=>revoke(url),1000);
      cleanupScheduled=true;
      recordTiming('csv_export',clockNow()-started);
      recordEvent('info','CSV_EXPORTED','analytics',cohort.eligibleOrders.length);
      setStatus(`Prepared ${formatInteger(cohort.eligibleOrders.length)} filtered order rows.`);
      return true;
    } catch {
      recordTiming('csv_export',clockNow()-started);
      recordEvent('error','CSV_EXPORT_FAILED','analytics');
      setStatus('CSV export failed. Try again from the dashboard.');
      return false;
    } finally {
      link?.remove();
      if (objectUrl && !cleanupScheduled) {
        try {URL.revokeObjectURL(objectUrl);} catch { /* cleanup best-effort */ }
      }
    }
  }
  useEffect(()=>registerRecoveryHandler('csv','retry',download),[cohort]);
  return <div className="csv-export"><button type="button" className="csv-export-button" onClick={download} disabled={!cohort.eligibleOrders.length}><Download size={15} aria-hidden="true"/>Export filtered orders (CSV)</button>
    <span className="csv-export-meta"><FileText size={13} aria-hidden="true"/> {formatInteger(cohort.eligibleOrders.length)} orders · all matching dashboard filters and focused flows</span>
    {status?<span role="status" className="csv-export-meta">{status}</span>:null}
  </div>;
}
