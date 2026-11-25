const test=require('node:test');
const assert=require('node:assert/strict');
const ops=require('../dist-test/observability/diagnostics.js');
const recovery=require('../dist-test/observability/recovery.js');
const investigation=require('../dist-test/observability/investigation.js');
function reset(){recovery.resetRecoveryForTests();ops.resetDiagnosticsForTests();}
function select(code,area){return investigation.listIncidentCases(ops.getDiagnosticsSnapshot()).find(c=>c.code===code&&c.area===area);}

test('WU-08 investigation groups repeated unknown errors by allowlisted fingerprint',()=>{
  reset();
  ops.recordEvent('error','UNHANDLED_REJECTION','app');
  ops.recordEvent('error','UNHANDLED_REJECTION','app');
  ops.recordEvent('error','UNHANDLED_ERROR','app');
  const cases=investigation.listIncidentCases(ops.getDiagnosticsSnapshot());
  assert.equal(cases.length,2);
  assert.equal(select('UNHANDLED_REJECTION','app').occurrences,2);
  assert.equal(select('UNHANDLED_REJECTION','app').status,'unresolved');
  assert.ok(cases.every(c=>!c.id.includes('raw')));
});

test('WU-08 investigation generates ranked, falsifiable hypotheses for dataset failures',()=>{
  reset();
  ops.setHealth('dataset','degraded');
  ops.recordEvent('error','DATASET_LOAD_FAILED','app');
  const report=investigation.investigateIncident(ops.getDiagnosticsSnapshot(),select('DATASET_LOAD_FAILED','app').id);
  assert.equal(report.conclusion,'root-cause-unconfirmed');
  assert.ok(report.possibleCauses.length>=2);
  assert.ok(report.possibleCauses.some(h=>h.assessment==='supported-by-context'));
  assert.ok(report.possibleCauses.every(h=>h.investigativeSteps.length && h.confirmationCriterion && h.disconfirmationCriterion));
  assert.ok(report.possibleCauses.some(h=>h.id==='schema'));
});

test('WU-08 report correlates action, error-time state, near trace and recent recovery without claiming causality',()=>{
  reset();
  ops.setHealth('dataset','ready');ops.setHealth('geography','ready');
  ops.updateDashboardState({origins:3,destinations:4,categories:1,focusedFlows:2,dateFiltered:false,eligibleOrders:50});
  ops.setDiagnosticView('sankeyMeasure','freight');
  ops.recordUserAction('FLOW_SELECTION_CHANGED','sankey');
  ops.recordTiming('sankey_layout',650);
  ops.recordEvent('fatal','RENDER_FAILED','sankey');
  const issue=recovery.deriveRecoveryIssues(ops.getDiagnosticsSnapshot())[0];
  assert.equal(issue.area,'sankey');
  const report=investigation.investigateIncident(ops.getDiagnosticsSnapshot(),select('RENDER_FAILED','sankey').id);
  assert.equal(report.errorState.eligibleOrders,50);
  assert.equal(report.errorView.sankeyMeasure,'freight');
  assert.equal(report.relatedAction.code,'FLOW_SELECTION_CHANGED');
  assert.ok(report.relatedTraces.some(t=>t.slow));
  assert.ok(report.possibleCauses[0].supportingEvidence.length>0);
  const md=investigation.incidentReportMarkdown(report);
  assert.match(md,/Root cause: unconfirmed/);
  assert.match(md,/timing alone|temporal association only/i);
  assert.match(md,/Confirm if:/);
  assert.match(md,/Weaken if:/);
});

test('WU-08 recovery success does not imply a confirmed root cause',()=>{
  reset();
  ops.recordEvent('error','DATASET_LOAD_FAILED','app');
  ops.recordEvent('info','DATASET_LOADED','app');
  const report=investigation.investigateIncident(ops.getDiagnosticsSnapshot(),select('DATASET_LOAD_FAILED','app').id);
  assert.equal(report.incident.status,'recovery-observed');
  assert.equal(report.conclusion,'root-cause-unconfirmed');
});

test('WU-08 unknown errors remain inconclusive; troubleshooting never requires raw record export',()=>{
  reset();
  ops.recordEvent('error','UNHANDLED_ERROR','app');
  const report=investigation.investigateIncident(ops.getDiagnosticsSnapshot(),select('UNHANDLED_ERROR','app').id);
  assert.equal(report.conclusion,'root-cause-unconfirmed');
  assert.equal(report.relatedAction,null);
  assert.ok(report.possibleCauses.every(h=>h.assessment==='plausible-unverified'));
  assert.ok(report.evidenceGaps.some(x=>x.includes('stack trace')));
});

test('WU-08 investigative outputs remain redacted even if thrown error text contains secrets',()=>{
  reset();
  const secret='PRIVATE-ORDER-ID-012345';
  ops.recordEvent('error','UNHANDLED_REJECTION','app');
  const report=investigation.investigateIncident(ops.getDiagnosticsSnapshot(),select('UNHANDLED_REJECTION','app').id);
  const bundle=investigation.incidentReportBundle(report,ops.getDiagnosticsSnapshot());
  const parsed=JSON.parse(bundle);
  assert.equal(parsed.report.analysisMethod,'offline-rule-based-hypothesis-review');
  assert.doesNotMatch(bundle, new RegExp(secret));
  assert.doesNotMatch(investigation.incidentReportMarkdown(report),new RegExp(secret));
  assert.equal(parsed.diagnostics.events[0].code,'UNHANDLED_REJECTION');
});

test('WU-08 invalid fingerprints are never used to materialize arbitrary incident content',()=>{
  reset();
  ops.recordEvent('error','UNHANDLED_ERROR','app');
  assert.equal(investigation.investigateIncident(ops.getDiagnosticsSnapshot(),'CUSTOM ERROR: /Users/private'),null);
});
