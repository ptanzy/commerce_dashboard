/** Optional full-source WU-04 measurement: run after `npm run test:node` and ETL. */
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { buildDataIndex } = require('../dist-test/data/indexes.js');
const { selectCohort } = require('../dist-test/domain/selectors.js');
const { selectExplorerOrders, selectOrderDetail } = require('../dist-test/domain/orderExplorer.js');
const dir = path.resolve(__dirname,'../public/data');
function load(name) {
  const file=path.join(dir,name);
  if(!fs.existsSync(file)) throw new Error(`Missing ${file}. Run the Python Olist ETL first.`);
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
const t0=performance.now();
const orders=load('orders.json'),items=load('items.json'),manifest=load('metadata.json');
const parsedMs=performance.now()-t0;
const t1=performance.now();
const index=buildDataIndex(orders,items);
const indexedMs=performance.now()-t1;
const f={purchaseDateFrom:null,purchaseDateTo:null,customerState:null,sellerState:null,category:null};
const t2=performance.now();
const cohort=selectCohort(index,f);
const rows=selectExplorerOrders(cohort);
const builtMs=performance.now()-t2;
const t3=performance.now();
const spFilter={...f,sellerState:'SP'};
const spCohort=selectCohort(index,spFilter);
const spRows=selectExplorerOrders(spCohort);
const filterMs=performance.now()-t3;
if(rows.length!==cohort.eligibleOrders.length||rows.length!==manifest.orderCount) throw new Error('Wrong order table grain/count');
if(spRows.length!==spCohort.eligibleOrders.length) throw new Error('Wrong seller-cohort order count');
if(spRows.length){
  const example=selectOrderDetail(index,spCohort,spFilter,spRows[0].orderId);
  if(!example||example.fullItems.length<example.matchingTotals.matchedItemCount)throw new Error('Invalid full/matching order detail');
}
console.log(JSON.stringify({
  source:'local production JSON',orderCount:rows.length,itemCount:items.length,sellerSPOrders:spRows.length,
  parseMs:Math.round(parsedMs),indexMs:Math.round(indexedMs),initialExplorerMs:Math.round(builtMs),
  sellerFilterAndExplorerMs:Math.round(filterMs),
  dataBytes:Object.fromEntries(['orders.json','items.json','metadata.json'].map(n=>[n,fs.statSync(path.join(dir,n)).size])),
  note:'Node measurements only. Browser interaction latency and rendering require manual verification.'
},null,2));
