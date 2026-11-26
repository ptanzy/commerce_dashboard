/** WU-10 repeatable full-Olist domain benchmark. Run after `npm run test:node`.
 * Measures synchronous compute time, not React paint or browser responsiveness.
 * No strict time threshold: machines vary, and a benchmark should not be a flaky gate.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { buildDataIndex } = require('../dist-test/data/indexes.js');
const { selectCohort, selectFocusedFlowCohort, computeMetrics, topDirectedFlows } = require('../dist-test/domain/selectors.js');
const { DEFAULT_FILTERS } = require('../dist-test/domain/types.js');
const root = path.join(__dirname, '..', 'public', 'data');
const pointerFile=path.join(root,'current.json');
const base=fs.existsSync(pointerFile)?path.join(root,'generations',JSON.parse(fs.readFileSync(pointerFile,'utf8')).generation):root;
function read(name) {return JSON.parse(fs.readFileSync(path.join(base, name), 'utf8'));}
function percentile(sorted,p) { const pos=(sorted.length-1)*p; const lo=Math.floor(pos),hi=Math.ceil(pos);return sorted[lo]+(sorted[hi]-sorted[lo])*(pos-lo); }
function benchmark(label, run, cycles=12) {
  const times=[];
  for (let i=0;i<cycles+2;i++) {
    const start=performance.now(); const result=run(); const ms=performance.now()-start;
    if(i>=2) times.push(ms);
    if (!result || typeof result.distinctOrders!=='number') throw new Error(`Invalid result: ${label}`);
  }
  times.sort((a,b)=>a-b);
  return {name:label,medianMs:+percentile(times,0.5).toFixed(2),p95Ms:+percentile(times,0.95).toFixed(2)};
}
const loadStart=performance.now();
const index=buildDataIndex(read('orders.json'),read('items.json'));
const loadMs=performance.now()-loadStart;
const scenarios=[
  ['unfiltered',{}],
  ['customer states',{customerStates:['SP','RJ','MG','BA','PR']}],
  ['seller and category',{sellerStates:['SP','RJ','MG','RS','PR'],categories:['bed_bath_table','health_beauty','sports_leisure','computers_accessories']}],
  ['date and destination',{purchaseDateFrom:'2018-01-01',purchaseDateTo:'2018-06-30',customerStates:['SP','RJ','MG']}],
  ['narrow cohort',{sellerStates:['AC'],customerStates:['RR'],categories:['toys']}],
  ['focused flow',{focusedFlows:[{sellerState:'SP',customerState:'RJ'},{sellerState:'MG',customerState:'SP'}]}],
];
// Historical WU-09 selector shape for an apples-to-apples domain baseline.
function previousSelectCohort(index,filters) {
  const baseOrders=index.orders.filter(order=>{
    const date=order.purchaseDate;
    return date!==null && (filters.purchaseDateFrom===null || date>=filters.purchaseDateFrom) &&
      (filters.purchaseDateTo===null || date<=filters.purchaseDateTo) &&
      (filters.customerStates.length===0 || (order.customerState!==null && filters.customerStates.includes(order.customerState)));
  });
  const ids=new Set(baseOrders.map(o=>o.orderId));
  const items=index.items.filter(item=> ids.has(item.orderId) &&
    (filters.sellerStates.length===0 || (item.sellerState!==null && filters.sellerStates.includes(item.sellerState))) &&
    (filters.categories.length===0 || filters.categories.includes(item.category)));
  const filtered=filters.sellerStates.length>0 || filters.categories.length>0;
  const eligibleOrderIds=filtered?new Set(items.map(i=>i.orderId)):ids;
  return {eligibleOrders:filtered?baseOrders.filter(o=>eligibleOrderIds.has(o.orderId)):baseOrders,eligibleItems:items,eligibleOrderIds};
}
function compareSelectors(label,extra) {
  const filters={...DEFAULT_FILTERS,...extra};
  const run=fn=>benchmark(label,()=>({distinctOrders:fn(index,filters).eligibleOrders.length}));
  const previous=run(previousSelectCohort), optimized=run(selectCohort);
  return {name:label,previousMedianMs:previous.medianMs,optimizedMedianMs:optimized.medianMs,
    relativeImprovementPct:+((1-optimized.medianMs/Math.max(previous.medianMs,.001))*100).toFixed(1)};
}
const selectorComparison=scenarios.map(([label,extra])=>compareSelectors(label,extra));
const results=scenarios.map(([name, extra])=>benchmark(name,()=>{
  const filters={...DEFAULT_FILTERS,...extra};
  const context=selectCohort(index,filters);
  const cohort=selectFocusedFlowCohort(context,filters.focusedFlows);
  const metrics=computeMetrics(cohort);
  topDirectedFlows(context,15,'freight',filters.focusedFlows);
  return metrics;
}));
const result={selectorComparison,data:{orders:index.orders.length,items:index.items.length,indexAndParseMs:+loadMs.toFixed(1)},results,
  heapUsedMiB:+(process.memoryUsage().heapUsed/1048576).toFixed(1),
  note:'Node domain calculation only; does not measure browser paint, render, input response, or FPS. Run on the same machine with unchanged data to compare revisions.'};
console.log(JSON.stringify(result,null,2));
