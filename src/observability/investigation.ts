/** WU-08 investigative escalation. Deterministic hypotheses, never asserted root causes.
 * No raw exceptions, source records, URLs, identity, stacks, or free-form telemetry.
 */
import type {
  DiagnosticArea, DiagnosticBuild, DiagnosticDatasetInfo, DiagnosticEnvironment,
  DiagnosticEvent, DiagnosticSnapshot, EventCode, HealthCheckResult, HealthName,
  HealthState, OperationTrace, RecoveryDiagnosticRecord, SanitizedDashboardState,
  UserActionCode,
} from './diagnostics';
import { deriveRecoveryIssues } from './recovery';

const INCIDENT_CODES = new Set<EventCode>([
  'DATASET_LOAD_FAILED','GEOGRAPHY_LOAD_FAILED','CSV_EXPORT_FAILED','STORAGE_WRITE_FAILED',
  'STORAGE_READ_FAILED','RENDER_FAILED','UNHANDLED_ERROR','UNHANDLED_REJECTION',
  'DIAGNOSTICS_EXPORT_FAILED',
]);
const MAX_INCIDENTS=12;
const WINDOW_MS=120_000;

export type InvestigationStatus = 'unresolved' | 'not-confirmed-active' | 'recovery-observed';
export type EvidenceAssessment = 'supported-by-context' | 'plausible-unverified' | 'less-supported';
export interface IncidentCase {
  readonly id: string;
  readonly code: EventCode;
  readonly area: DiagnosticArea;
  readonly title: string;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly occurrences: number;
  readonly severity: 'error' | 'fatal';
  readonly status: InvestigationStatus;
}
export interface RootCauseHypothesis {
  readonly id: string;
  readonly title: string;
  readonly assessment: EvidenceAssessment;
  readonly supportingEvidence: readonly string[];
  readonly limitations: readonly string[];
  readonly investigativeSteps: readonly string[];
  readonly confirmationCriterion: string;
  readonly disconfirmationCriterion: string;
}
export interface IncidentEvidenceEvent {
  readonly timestamp: string;
  readonly code: EventCode | UserActionCode;
  readonly area: DiagnosticArea;
  readonly level: 'debug'|'info'|'warn'|'error'|'fatal';
  readonly relativeToFailure: 'before'|'during'|'after';
}
export interface DeveloperIncidentReport {
  readonly format: 'commerce-dashboard-developer-incident-v1';
  readonly generatedAt: string;
  readonly conclusion: 'root-cause-unconfirmed';
  readonly analysisMethod: 'offline-rule-based-hypothesis-review';
  readonly incident: IncidentCase;
  readonly session: {readonly id:string; readonly startedAt:string;readonly anonymous:true};
  readonly build: DiagnosticBuild;
  readonly environment: DiagnosticEnvironment;
  readonly dataset: DiagnosticDatasetInfo;
  readonly currentHealth: Readonly<Record<HealthName,HealthState>>;
  readonly healthChecks: readonly HealthCheckResult[];
  readonly healthCheckedAt: string | null;
  readonly errorState: SanitizedDashboardState | null;
  readonly errorView: DiagnosticEvent['view'] | null;
  readonly relatedAction: {readonly code:UserActionCode;readonly id:number}|null;
  readonly surroundingEvents: readonly IncidentEvidenceEvent[];
  readonly relatedTraces: readonly OperationTrace[];
  readonly recoveryAttempts: readonly RecoveryDiagnosticRecord[];
  readonly possibleCauses: readonly RootCauseHypothesis[];
  readonly suggestedSourceFiles: readonly string[];
  readonly nextSteps: readonly string[];
  readonly evidenceGaps: readonly string[];
  readonly privacy: string;
}

const TITLES: Partial<Record<EventCode,string>>={
  DATASET_LOAD_FAILED:'Dataset load or validation failed',
  GEOGRAPHY_LOAD_FAILED:'Brazil geography unavailable',
  CSV_EXPORT_FAILED:'Filtered CSV export failed',
  STORAGE_WRITE_FAILED:'Browser storage write failed',
  STORAGE_READ_FAILED:'Browser storage read failed',
  RENDER_FAILED:'Dashboard section rendering failure',
  UNHANDLED_ERROR:'Uncaught browser error',
  UNHANDLED_REJECTION:'Unhandled asynchronous rejection',
  DIAGNOSTICS_EXPORT_FAILED:'Diagnostic report export failed',
};
const SUCCESS: Partial<Record<EventCode,EventCode>>={
  DATASET_LOAD_FAILED:'DATASET_LOADED',GEOGRAPHY_LOAD_FAILED:'GEOGRAPHY_LOADED',
  CSV_EXPORT_FAILED:'CSV_EXPORTED',
};
function isIncident(e:DiagnosticEvent): e is DiagnosticEvent & {code:EventCode} {
  return (e.level==='error'||e.level==='fatal')&&INCIDENT_CODES.has(e.code as EventCode);
}

/** Fingerprints contain allowlisted subsystem/code only. Aggregate recurrences without storing inputs. */
export function listIncidentCases(snapshot:DiagnosticSnapshot): IncidentCase[] {
  const rows = new Map<string,{code:EventCode;area:DiagnosticArea;first:string;last:string;lastIndex:number;count:number;severity:'error'|'fatal'}>();
  for(const [idx,e] of snapshot.events.entries()){
    if(!isIncident(e))continue;
    const id=`${e.code}:${e.area}`;
    const existing=rows.get(id);
    if(existing){existing.count++;if(e.timestamp<existing.first)existing.first=e.timestamp;
      existing.last=e.timestamp;existing.lastIndex=idx;
      if(e.level==='fatal')existing.severity='fatal';
    } else rows.set(id,{code:e.code,area:e.area,first:e.timestamp,last:e.timestamp,lastIndex:idx,count:1,severity:e.level==='fatal'?'fatal':'error'});
  }
  const active=new Set(deriveRecoveryIssues(snapshot).map(issue=>issue.key));
  return [...rows].map(([id,row])=>{
    const laterEvents=snapshot.events.slice(row.lastIndex+1);
    const recovered=SUCCESS[row.code]&&laterEvents.some(e=>e.code===SUCCESS[row.code]&&e.area===row.area) ||
      (row.code==='RENDER_FAILED'&&laterEvents.some(e=>e.code==='RECOVERY_VERIFIED'&&e.area===row.area));
    return Object.freeze({id,code:row.code,area:row.area,title:TITLES[row.code]??'Unexpected application failure',
      firstSeen:row.first,lastSeen:row.last,occurrences:row.count,severity:row.severity,
      status:recovered?'recovery-observed':active.has(id)?'unresolved':'not-confirmed-active'} as IncidentCase);
  }).sort((a,b)=>b.lastSeen.localeCompare(a.lastSeen)).slice(0,MAX_INCIDENTS);
}

type HypothesisTemplate={id:string;title:string;steps:readonly string[];confirm:string;refute:string};
function template(id:string,title:string,steps:string[],confirm:string,refute:string):HypothesisTemplate {
  return {id,title,steps,confirm,refute};
}
const NETWORK=template('request','Missing, inaccessible, or temporarily unavailable local asset',[
  'Open browser Developer Tools → Network and reload the failing dataset or geography request.',
  'Check the HTTP status and response type for the corresponding public asset, without copying raw records into the report.',
  'Compare the request path with the generated file on disk; regenerate missing assets using the repository preparation script.'
],'The request fails, or the required file is absent; it succeeds after the asset/server problem is corrected.',
 'The request returns valid JSON with the expected shape, and the failure persists after independent validation.');
const DATA_SHAPE=template('schema','Export version, JSON parsing, or validation mismatch',[
  'Inspect the validation failure locally and check metadata.json schemaVersion, orderCount, and itemCount.',
  'Run the ETL tests and rebuild the ignored JSON exports using scripts/prepare_data.py.',
  'Load the regenerated assets and verify that the dashboard reports dataset health as ready.'
],'An isolated schema/count/JSON mismatch is reproduced and disappears after valid exports are regenerated.',
 'All exported files pass validation and an equivalent load still fails before validation.');
const TOPOLOGY=template('topology','Invalid or incompatible state topology',[
  'Verify public/geo/brazil-states.topojson exists and is valid JSON.',
  'Run the existing topology parser and confirm 27 distinct Brazil state identifiers.',
  'Regenerate with scripts/prepare_geo.py and check map rendering in both themes.'
],'The topology parser rejects the asset or geography validation fails, then succeeds with a verified asset.',
 'Topology passes the 27-state parser and the map fails for a different reason.');
const RENDER_DATA=template('render-data','Visualization data or layout edge case',[
  'Reproduce with the affected global filter scope and focused-flow count, if available.',
  'Switch chart measurement and compare whether the failure is specific to one mode.',
  'Run relevant selector/chart regression tests, including zero-item, null-amount, and directed-pair cases.'
],'A specific, reproducible dataset shape or chart mode triggers the failure in an isolated regression test.',
 'The component fails with a minimal valid fixture independently of the data or chart mode.');
const RENDER_RUNTIME=template('render-runtime','UI render lifecycle or browser compatibility problem',[
  'Check the browser developer console locally for the exception class and component stack; review sensitive content before sharing.',
  'Compare behavior in an unmodified supported browser and a clean profile.',
  'Inspect the affected React component and retry/isolation lifecycle; add a regression test for the reproducible case.'
],'The failure is reproduced by a particular render/lifecycle transition or browser condition and corrected by a targeted change.',
 'The failure occurs entirely in data preparation before the component mounts.');
const ASYNC=template('async','Unhandled asynchronous operation, abort race, or stale result',[
  'Inspect the rejected promise locally in Developer Tools without exporting sensitive exception text.',
  'Test rapid changes of filters and chart modes, route reloads, and component unmounts.',
  'Audit asynchronous requests for AbortSignal handling, stale-success handling, and explicit catch paths.'
],'A specific rejected operation or stale result is reproduced and no longer rejects after the handler is corrected.',
 'All asynchronous operations settle normally and the failure is synchronous in a component.');
const STORAGE=template('storage','Browser storage denied, unavailable, or over quota',[
  'Run WU-08 non-destructive storage health checks.',
  'Verify browser storage settings, private browsing restrictions, and available quota.',
  'Retry the saved-view operation only after diagnosing availability; never clear existing saved views without approval.'
],'A repeatable storage read/write probe fails and passes after the environment restriction is corrected.',
 'The storage probe passes consistently and the failing operation is traced to an unrelated validation path.');
const STORAGE_FORMAT=template('saved-format','Saved-view serialization or stored-data compatibility issue',[
  'Inspect the local saved-view validation path using a sanitized fixture, not a user-provided storage dump.',
  'Run saved-view corruption and backward-compatibility regression tests.',
  'If stored data is invalid, offer a preview and explicit user-approved reset; never automatically delete preferences.'
],'A malformed snapshot triggers the failure and a valid sanitized snapshot does not.',
 'A valid stored snapshot fails only when the browser denies storage access.');
const EXPORT=template('export-memory','CSV generation, memory pressure, or download API failure',[
  'Try exporting a small filtered cohort, then the same operation on the full cohort.',
  'Inspect browser memory and Blob/object URL behavior using Developer Tools.',
  'Verify generated CSV row counts and safe cleanup of temporary URLs after failures.'
],'A reproducible size threshold or browser API failure is demonstrated, and the relevant mitigation removes the failure.',
 'CSV creation and the download API both succeed on the affected cohort.');
const DOWNLOAD=template('download-policy','Browser download settings or permissions blocked the transfer',[
  'Confirm whether a Blob URL and anchor click were successfully initiated.',
  'Check the browser Downloads panel, blocked-download permissions, and file save location.',
  'Compare the same prepared CSV on another supported browser, without uploading customer data.'
],'The browser blocks the initiated download and succeeds after a permission/policy change.',
 'The export fails before a Blob or download action is attempted.');
const UNKNOWN=template('unknown-runtime','Undiagnosed application defect or browser/runtime conflict',[
  'Review the preceding sanitized session events and identify the smallest repeatable action sequence.',
  'Inspect the local browser console for the original exception and component information; redact before sharing.',
  'Check whether the issue reproduces in production preview, another browser, and a clean profile.',
  'Add a focused failing test before modifying the relevant component.'
],'An exact triggering operation is reproduced and a targeted code or environment change prevents it.',
 'The failure is explained conclusively by a different, independently verified investigation.');
const DIAGNOSTIC_EXPORT=template('diagnostic-download','Diagnostic Blob download or object URL handling failed',[
  'Check browser download restrictions and whether createObjectURL and link.click succeed.',
  'Try exporting diagnostics after reducing retained history with user approval.',
  'Inspect cleanup of temporary object URLs and test a smaller diagnostic object.'
],'The download API or memory failure is reproduced and the repair allows a valid local report to be saved.',
 'The same diagnostic export succeeds in the same environment without any relevant changes.');

function templatesFor(code:EventCode):HypothesisTemplate[] {
  if(code==='DATASET_LOAD_FAILED')return [NETWORK,DATA_SHAPE,template('resources','Insufficient browser resources while parsing the dataset',[
    'Measure initial JSON parsing time and memory on a full local export.',
    'Compare against the small validated test fixture and check available browser memory.'
  ],'Full-size data reliably fails with resource pressure while a small valid dataset loads.',
  'Memory and parsing remain healthy at the failure point.')];
  if(code==='GEOGRAPHY_LOAD_FAILED')return [NETWORK,TOPOLOGY,RENDER_RUNTIME];
  if(code==='CSV_EXPORT_FAILED')return [EXPORT,DOWNLOAD,RENDER_DATA];
  if(code==='STORAGE_READ_FAILED'||code==='STORAGE_WRITE_FAILED')return [STORAGE,STORAGE_FORMAT];
  if(code==='RENDER_FAILED')return [RENDER_DATA,RENDER_RUNTIME,ASYNC];
  if(code==='UNHANDLED_REJECTION')return [ASYNC,NETWORK,UNKNOWN];
  if(code==='UNHANDLED_ERROR')return [RENDER_RUNTIME,UNKNOWN,ASYNC];
  if(code==='DIAGNOSTICS_EXPORT_FAILED')return [DIAGNOSTIC_EXPORT,DOWNLOAD,EXPORT];
  return [UNKNOWN];
}

/** Known repository entry points only. These are investigation hints, not suspect-line findings. */
const SOURCE_FILES: Readonly<Record<DiagnosticArea,readonly string[]>>={
  app:['src/main.tsx','src/app/App.tsx','src/app/useDashboardData.ts','src/observability/UiErrorBoundary.tsx'],
  dashboard:['src/app/App.tsx','src/app/filterReducer.ts','src/domain/selectors.ts'],
  map:['src/charts/BrazilMap.tsx','src/data/loader.ts','src/data/validate.ts'],
  trends:['src/charts/DeliveryTrends.tsx','src/domain/selectors.ts'],
  sankey:['src/charts/ShippingSankey.tsx','src/domain/selectors.ts','src/domain/exploration.ts'],
  orders:['src/features/orders/OrderExplorer.tsx','src/domain/orderExplorer.ts'],
  analytics:['src/components/AdvancedExploration.tsx','src/domain/exportCsv.ts'],
};
function sourceHints(code:EventCode,area:DiagnosticArea):readonly string[]{
  const extra=code==='DATASET_LOAD_FAILED'?['scripts/prepare_data.py','src/data/validate.ts','src/data/loader.ts']:
    code==='GEOGRAPHY_LOAD_FAILED'?['scripts/prepare_geo.py','src/charts/BrazilMap.tsx']:
    code==='STORAGE_READ_FAILED'||code==='STORAGE_WRITE_FAILED'?['src/components/SavedViews.tsx','src/domain/savedViews.ts','src/app/theme.ts']:
    code==='DIAGNOSTICS_EXPORT_FAILED'?['src/components/DiagnosticsPanel.tsx','src/observability/diagnostics.ts']:
    code==='UNHANDLED_REJECTION'||code==='UNHANDLED_ERROR'?['src/observability/UiErrorBoundary.tsx','src/observability/diagnostics.ts']:[];
  return Object.freeze([...new Set([...SOURCE_FILES[area],...extra])]);
}

const COMPONENT_TIMINGS: Readonly<Record<DiagnosticArea,readonly string[]>>={
  app:['dataset_load','dataset_validation'],dashboard:['cohort_filter','kpi_calculation','flow_focus'],
  map:['geography_load','map_aggregation'],trends:['trend_context','trend_focus'],
  sankey:['sankey_aggregation','sankey_layout'],orders:['explorer_rows','explorer_sort'],
  analytics:['csv_export'],
};
function scoreEvidence(template:HypothesisTemplate,record:IncidentCase,snapshot:DiagnosticSnapshot,
  traces:readonly OperationTrace[],recovery:readonly RecoveryDiagnosticRecord[]):RootCauseHypothesis {
  const evidence:string[]=[];
  const gaps:string[]=[];
  const health=snapshot.health;
  if(template.id==='request'&&snapshot.events.some(e=>e.code==='RECOVERY_AUTO_RETRY' && e.area===record.area))
    evidence.push('An automatic transient-request retry was recorded for the affected subsystem.');
  if((template.id==='schema'||template.id==='resources')&&health.dataset==='degraded')
    evidence.push('Dataset health is currently degraded; this does not distinguish parsing from file or validation failures.');
  if(template.id==='topology'&&health.geography==='degraded')
    evidence.push('Geography health is currently degraded; asset integrity still needs direct validation.');
  if(template.id==='storage'&&snapshot.healthChecks.some(h=>(h.code==='local_storage'||h.code==='session_storage')&&h.status==='fail'))
    evidence.push('A recent non-destructive storage health check failed.');
  if(template.id==='render-data'&&record.area==='sankey'){
    const lastError=[...snapshot.events].reverse().find(e=>e.code===record.code&&e.area===record.area&&e.level==='fatal');
    if(lastError?.view?.sankeyMeasure)evidence.push(`Sankey measure at the last recorded rendering failure: ${lastError.view.sankeyMeasure}.`);
    if(lastError?.relatedAction==='FLOW_SELECTION_CHANGED'||lastError?.relatedAction==='SANKEY_MEASURE_CHANGED')
      evidence.push('A Sankey interaction occurred within 30 seconds before the error; temporal association only.');
  }
  if((template.id==='render-runtime'||template.id==='render-data'||template.id==='resources')&&
    traces.some(t=>t.slow&&COMPONENT_TIMINGS[record.area].includes(t.operation)))
    evidence.push('A related component operation exceeded its provisional slow-operation threshold near the error.');
  if((template.id==='download-policy'||template.id==='diagnostic-download')&&snapshot.environment.browser!=='Other')
    evidence.push(`The affected browser family is ${snapshot.environment.browser}; browser configuration has not been inspected.`);
  if(recovery.some(r=>r.action==='retry'&&r.outcome==='failed'))
    gaps.push('One or more retry attempts failed; the current telemetry does not say why.');
  if(!evidence.length)gaps.push('No distinctive supporting observation was captured for this hypothesis.');
  gaps.push('Original exception messages and stack traces are deliberately excluded from automatic diagnostic reports.');
  return Object.freeze({id:template.id,title:template.title,
    assessment:evidence.length?'supported-by-context':'plausible-unverified',
    supportingEvidence:Object.freeze(evidence),limitations:Object.freeze(gaps),
    investigativeSteps:Object.freeze([...template.steps]),confirmationCriterion:template.confirm,
    disconfirmationCriterion:template.refute});
}

function relative(timestamp:string,failure:string): 'before'|'during'|'after' {
  return timestamp<failure?'before':timestamp>failure?'after':'during';
}
/** Generate an incident dossier from already-sanitized signals; health checks can be run first by the caller. */
export function investigateIncident(snapshot:DiagnosticSnapshot,incidentId:string):DeveloperIncidentReport|null {
  const incident=listIncidentCases(snapshot).find(c=>c.id===incidentId);
  if(!incident)return null;
  const latest=[...snapshot.events].reverse().find(e=>isIncident(e)&&e.code===incident.code&&e.area===incident.area);
  if(!latest)return null;
  const at=Date.parse(incident.lastSeen);
  const relevant=snapshot.events.filter(e=>Math.abs(Date.parse(e.timestamp)-at)<=WINDOW_MS);
  const before=relevant.filter(e=>e.timestamp<=incident.lastSeen).slice(-12);
  const after=relevant.filter(e=>e.timestamp>incident.lastSeen).slice(0,4);
  const timeline:IncidentEvidenceEvent[]=[...before,...after].map(e=>({
    timestamp:e.timestamp,code:e.code,area:e.area,level:e.level,
    relativeToFailure:relative(e.timestamp,incident.lastSeen),
  }));
  const traceCandidates=snapshot.traces.filter(t=>Math.abs(Date.parse(t.timestamp)-at)<=WINDOW_MS);
  const traces=traceCandidates.filter(t=>COMPONENT_TIMINGS[incident.area].includes(t.operation)||
    (latest.relatedActionId!==undefined&&t.relatedActionId===latest.relatedActionId)).slice(-10);
  const recovery=snapshot.recoveryAttempts.filter(a=>a.area===incident.area &&
    Date.parse(a.timestamp)>=Date.parse(incident.firstSeen)).slice(-10);
  const hypotheses=templatesFor(incident.code).map(t=>scoreEvidence(t,incident,snapshot,traces,recovery));
  hypotheses.sort((a,b)=>Number(b.supportingEvidence.length>0)-Number(a.supportingEvidence.length>0));
  const gaps=[
    'No raw exception, stack trace, error message, user identity, URL, or source record is collected automatically.',
    'The available error history is bounded to the most recent 200 events and may omit earlier failures.',
    'Correlation with a preceding action or slow operation does not establish causation.',
    'Latest health checks reflect inspection time, not necessarily the moment of failure.',
  ];
  if(!snapshot.healthCheckedAt)gaps.push('No explicit health-check run is available for this session.');
  if(!latest.state)gaps.push('No aggregate dashboard-state snapshot was captured with this error.');
  const step=incident.status==='recovery-observed'?
    'The immediate operation appears recovered; verify that it stays healthy across repeated use.':
    'The issue is unresolved or unverified; investigate the first hypothesis using its confirmation and disconfirmation checks.';
  return Object.freeze({
    format:'commerce-dashboard-developer-incident-v1',generatedAt:new Date().toISOString(),
    conclusion:'root-cause-unconfirmed',analysisMethod:'offline-rule-based-hypothesis-review',incident,
    session:Object.freeze({...snapshot.session}),build:snapshot.build,environment:snapshot.environment,
    dataset:snapshot.datasetInfo,currentHealth:snapshot.health,
    healthChecks:Object.freeze([...snapshot.healthChecks]),healthCheckedAt:snapshot.healthCheckedAt,
    errorState:latest.state??null,errorView:latest.view??null,
    relatedAction:latest.relatedAction&&latest.relatedActionId?{code:latest.relatedAction,id:latest.relatedActionId}:null,
    surroundingEvents:Object.freeze(timeline),relatedTraces:Object.freeze([...traces]),
    recoveryAttempts:Object.freeze([...recovery]),possibleCauses:Object.freeze(hypotheses),
    suggestedSourceFiles:sourceHints(incident.code,incident.area),
    nextSteps:Object.freeze([
      step,
      'Reproduce safely on the same application version and a known validated local dataset.',
      'Record which checks confirm or refute each cause. Do not label a root cause confirmed without a reproducible result.',
      'If needed, inspect the original exception locally and share only a reviewed, redacted excerpt.',
      'Run relevant regression tests, typecheck and production build after a fix; repeat the original failure scenario.',
    ]),
    evidenceGaps:Object.freeze(gaps),
    privacy:'Local-only report. Contains bounded allowlisted diagnostic events, aggregate state counts, coarse environment and operation timings. Review before sharing.',
  });
}

/** Developer-facing narrative plus testable hypotheses and falsification steps. */
export function incidentReportMarkdown(report:DeveloperIncidentReport):string {
  const lines:string[]=[
    `# Developer incident: ${report.incident.title}`,
    '',
    `- Incident fingerprint: \`${report.incident.id}\``,
    `- Generated: ${report.generatedAt}`,
    `- Status: ${report.incident.status} | Severity: ${report.incident.severity}`,
    `- Occurrences in retained history: ${report.incident.occurrences}`,
    `- First observed: ${report.incident.firstSeen}`,
    `- Last observed: ${report.incident.lastSeen}`,
    `- Anonymous session: ${report.session.id}`,
    `- Application version: ${report.build.version} | Commit: ${report.build.commit} | Mode: ${report.build.mode}`,
    `- Runtime: ${report.environment.browser} / ${report.environment.os}`,
    `- Data schema: ${report.dataset.schemaVersion??'unknown'} | Processing version: ${report.dataset.processingVersion}`,
    '',
    '## Assessment',
    '**Root cause: unconfirmed.** This is an offline, deterministic hypothesis review—not autonomous code analysis or a verified diagnosis.',
    `Related action: ${report.relatedAction?`${report.relatedAction.code} (#${report.relatedAction.id}; temporal association only)`:'none recorded'}.`,
    `Health at report time: ${Object.entries(report.currentHealth).map(([k,v])=>`${k}=${v}`).join(', ')}.`,
    '',
    '## Error-time configuration',
    ...(report.errorState?[
      `Eligible orders: ${report.errorState.eligibleOrders}; selected origins: ${report.errorState.origins}; selected destinations: ${report.errorState.destinations}; selected categories: ${report.errorState.categories}; focused flows: ${report.errorState.focusedFlows}; date filtered: ${report.errorState.dateFiltered}.`,
    ]:['- No error-time aggregate state was captured.']),
    ...(report.errorView?[`Chart modes: ${Object.entries(report.errorView).map(([k,v])=>`${k}=${v}`).join(', ')}.`]:['- Error-time chart modes are unavailable.']),
    '',
    '## Health checks (at investigation time)',
    ...(report.healthChecks.length?report.healthChecks.map(h=>`- ${h.code}: ${h.status} (${h.detail})`):['- No explicit health-check results are available.']),
    '',
    '## Related operation traces',
    ...(report.relatedTraces.length?report.relatedTraces.map(t=>`- ${t.timestamp}: ${t.operation} ${t.elapsedMs.toFixed(2)} ms${t.slow?' (slow)':''}${t.relatedAction?` after ${t.relatedAction} (#${t.relatedActionId}; correlation only)`:''}`):['- No associated measured operation was retained.']),
    '',
    '## Possible causes and troubleshooting',
  ];
  report.possibleCauses.forEach((h,i)=>{
    lines.push('',`### ${i+1}. ${h.title}`,`Assessment: ${h.assessment}.`,'',
      'Supporting context:',...(h.supportingEvidence.length?h.supportingEvidence.map(x=>`- ${x}`):['- No distinctive supporting evidence recorded.']),
      'Tests to distinguish this cause:',...h.investigativeSteps.map((x,j)=>`${j+1}. ${x}`),
      `Confirm if: ${h.confirmationCriterion}`,`Weaken if: ${h.disconfirmationCriterion}`);
  });
  lines.push('','## Recovery attempts',...(report.recoveryAttempts.length?
    report.recoveryAttempts.map(a=>`- ${a.timestamp}: ${a.area} ${a.action} → ${a.outcome}`):['- None recorded for this incident.']),
    '','## Nearby evidence',...(report.surroundingEvents.length?
      report.surroundingEvents.map(e=>`- ${e.timestamp}: ${e.relativeToFailure} · ${e.level} · ${e.area}/${e.code}`):['- None retained.']),
    '','## Suggested source entry points (not confirmed defective)',...report.suggestedSourceFiles.map(x=>`- \`${x}\``),
    '','## Recommended next actions',...report.nextSteps.map((x,i)=>`${i+1}. ${x}`),
    '','## Evidence limitations',...report.evidenceGaps.map(x=>`- ${x}`),'',
    '## Privacy and escalation','No report is transmitted automatically. Review the JSON diagnostic bundle and any manually gathered console data before sharing.');
  return lines.join('\n')+'\n';
}

/** An explicit, exportable, entirely local evidence package with the existing sanitized diagnostics. */
export function incidentReportBundle(report:DeveloperIncidentReport,snapshot:DiagnosticSnapshot):string {
  return JSON.stringify({format:'commerce-dashboard-developer-incident-bundle-v1',
    generatedAt:new Date().toISOString(),report,
    diagnostics:{session:snapshot.session,events:snapshot.events,metrics:snapshot.metrics,
      build:snapshot.build,environment:snapshot.environment,datasetInfo:snapshot.datasetInfo,
      health:snapshot.health,healthChecks:snapshot.healthChecks,traces:snapshot.traces,
      recoveryAttempts:snapshot.recoveryAttempts}},null,2);
}
