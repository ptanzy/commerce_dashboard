// Optional real-data acceptance check AFTER running the DuckDB ETL locally.
// Usage: npm run test:node && node tests/check_olist.cjs
const fs=require('node:fs');
const {performance}=require('node:perf_hooks');
const {validateDataset}=require('../dist-test/data/validate.js');
const {DEFAULT_FILTERS}=require('../dist-test/domain/types.js');
const {selectCohort,computeMetrics,topDirectedFlows,monthlyTrendContext}=require('../dist-test/domain/selectors.js');
const start=performance.now();
const dataDir='public/data';
const manifest=JSON.parse(fs.readFileSync(`${dataDir}/metadata.json`,'utf8'));
const orders=JSON.parse(fs.readFileSync(`${dataDir}/orders.json`,'utf8'));
const items=JSON.parse(fs.readFileSync(`${dataDir}/items.json`,'utf8'));
const parsed=performance.now();
const {index}=validateDataset(orders,items,manifest);
const cohort=selectCohort(index,DEFAULT_FILTERS);
const metrics=computeMetrics(cohort);
const flows=topDirectedFlows(cohort);
const monthly=monthlyTrendContext(index,DEFAULT_FILTERS);
const result={jsonParseMs:Math.round(parsed-start),indexSelectorsMs:Math.round(performance.now()-parsed),
  orderCount:metrics.distinctOrders,itemCount:cohort.eligibleItems.length,
  onTimeEligible:metrics.onTimeDenominator,onTimeCount:metrics.onTimeNumerator,onTimeRate:metrics.onTimeRate,
  medianDays:metrics.medianDeliveryDays,freightRatio:metrics.freightToPriceRatio,
  sankeyTop15Coverage:flows.coverage,trendMonths:monthly.length};
console.log(JSON.stringify(result,null,2));
const expectedHash='967e41e04fc306fe604e2a693f488995a8b41e5047418f8a5c8e4abd6deca784';
if (manifest.sourceArchiveSha256 === expectedHash) {
  const assert=require('node:assert/strict');
  assert.equal(result.orderCount,99441);
  assert.equal(result.itemCount,112650);
  assert.equal(result.onTimeEligible,96470);
  assert.equal(result.onTimeCount,89936);
  console.log('WU-00 full-source benchmark reconciliation PASS');
} else {
  console.log('Source SHA differs from inspected upload; no source-specific counts asserted.');
}
