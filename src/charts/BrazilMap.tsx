import { useEffect, useMemo, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { FeatureCollection, Geometry } from 'geojson';
import { MapPin, RefreshCcw } from 'lucide-react';
import type { Dispatch } from 'react';
import type { DataIndex } from '../data/indexes';
import { selectCohort } from '../domain/selectors';
import { stateDeliveryStats } from '../domain/selectors';
import type { StateDeliveryStats } from '../domain/selectors';
import type { FilterAction, Filters } from '../domain/types';
import { BRAZIL_STATES, stateLabel } from '../components/stateNames';
import { formatDays, formatInteger, formatPercentage } from '../components/format';
import { fetchWithTransientRetry, registerRecoveryHandler, retryAndVerifyHealth } from '../observability/recovery';
import { clockNow, recordEvent, recordUserAction, recordTiming, setHealth, setDiagnosticView } from '../observability/diagnostics';

const UF_CODES = Object.keys(BRAZIL_STATES).sort();
const topologyUrl = `${import.meta.env.BASE_URL}geo/brazil-states.topojson`;
type MapMode = 'origin' | 'destination';
type MapMetric = 'orders' | 'onTime' | 'median';
const MIN_SAMPLE = 30;
const MAP_METRICS: Record<MapMetric,string> = { orders:'Order volume', onTime:'On-time rate', median:'Median delivery' };
function measureValue(stat: StateDeliveryStats | undefined, metric: MapMetric): number | null {
  if (!stat) return null;
  return metric === 'orders' ? stat.distinctOrders : metric === 'onTime' ? stat.onTimeRate : stat.medianDeliveryDays;
}
function formatMapValue(stat: StateDeliveryStats | undefined, metric: MapMetric): string {
  if (metric === 'orders') return `${formatInteger(stat?.distinctOrders ?? 0)} orders`;
  return metric === 'onTime' ? formatPercentage(stat?.onTimeRate ?? null) : formatDays(stat?.medianDeliveryDays ?? null);
}
type LoadedMap = { status: 'ready'; geography: FeatureCollection<Geometry> };
type MapStatus = { status: 'loading' } | { status: 'error'; message: string } | LoadedMap;

/** Validate the generated P0 asset before attempting to render it. */
export function parseBrazilTopology(input: unknown): FeatureCollection<Geometry> {
  if (!input || typeof input !== 'object') throw new Error('Brazil topology is not a JSON object.');
  const candidate = input as Partial<Topology>;
  if (candidate.type !== 'Topology' || !candidate.objects || !('estados' in candidate.objects)) {
    throw new Error('Expected a Topology with the estados geometry collection.');
  }
  const geometry = candidate.objects.estados as GeometryCollection;
  if (geometry?.type !== 'GeometryCollection' || !Array.isArray(geometry.geometries)) {
    throw new Error('Invalid estados collection.');
  }
  const codes = geometry.geometries.map((item) => item.id);
  if (codes.length !== 27 || codes.some((code) => typeof code !== 'string' || !UF_CODES.includes(code)) || new Set(codes).size !== 27) {
    throw new Error('Map must contain all 27 distinct Brazilian UF identifiers.');
  }
  // The WU-01 converter originally omitted the required ring nesting for Polygon.
  // Reject that legacy artifact explicitly instead of letting topojson-client fail obscurely.
  for (const shape of geometry.geometries as Array<{type:string;arcs?:unknown}>) {
    if (shape.type === 'Polygon' && (!Array.isArray(shape.arcs) ||
      !shape.arcs.every(ring => Array.isArray(ring)))) {
      throw new Error('Map topology has legacy polygon arc nesting. Regenerate with python scripts/prepare_geo.py.');
    }
    if (shape.type === 'MultiPolygon' && (!Array.isArray(shape.arcs) ||
      !shape.arcs.every(polygon => Array.isArray(polygon) && polygon.every(ring => Array.isArray(ring))))) {
      throw new Error('Map topology has legacy multipolygon arc nesting. Regenerate with python scripts/prepare_geo.py.');
    }
  }
  const collection = feature(candidate as Topology, geometry) as FeatureCollection<Geometry>;
  if (collection.features.length !== 27 || collection.features.some((item) => !item.geometry)) {
    throw new Error('State boundary geometries are missing or corrupt.');
  }
  return collection;
}

function useBrazilGeography(): MapStatus & {retry:()=>void} {
  const [attempt,setAttempt] = useState(0);
  const [result, setResult] = useState<MapStatus>({status:'loading'});
  useEffect(() => {
    const controller = new AbortController();
    setResult({status:'loading'});
    const started=clockNow();
    setHealth('geography','pending');
    Promise.resolve().then(() => fetchWithTransientRetry(topologyUrl, controller.signal, fetch, 'map')).then(async (response) => {
      if (!response.ok) throw new Error(`Map asset returned HTTP ${response.status}. Generate it with python scripts/prepare_geo.py.`);
      return parseBrazilTopology(await response.json());
    }).then(geography => {if (!controller.signal.aborted) {
        setHealth('geography','ready');
        recordTiming('geography_load',clockNow()-started);
        recordEvent('info','GEOGRAPHY_LOADED','map',geography.features.length);
        setResult({status:'ready',geography});
      }})
      .catch(error => {if (!controller.signal.aborted) {
        setHealth('geography','degraded');
        recordTiming('geography_load',clockNow()-started);
        recordEvent('error','GEOGRAPHY_LOAD_FAILED','map');
        setResult({status:'error', message:error instanceof Error ? error.message : 'Map loading failed.'});
      }});
    return () => controller.abort();
  }, [attempt]);
  return {...result,retry:()=>setAttempt(current=>current+1)};
}

export function BrazilMap({index, filters, dispatch}: {index: DataIndex; filters: Filters; dispatch: Dispatch<FilterAction>}) {
  const [mode, setMode] = useState<MapMode>('origin');
  const [metric, setMetric] = useState<MapMetric>('orders');
  const geo = useBrazilGeography();
  useEffect(()=>registerRecoveryHandler('geography','retry',()=>retryAndVerifyHealth('geography',geo.retry)),[geo.retry]);
  // Ignore only the displayed dimension, so users can add another state without its count disappearing.
  // A focused Sankey flow is visual emphasis, not a constraint on this context map.
  const context = useMemo(() => selectCohort(index, {
    ...filters, focusedFlows: [],
    ...(mode === 'origin' ? {sellerStates: []} : {customerStates: []}),
  }), [index, filters.purchaseDateFrom, filters.purchaseDateTo, filters.customerStates, filters.sellerStates, filters.categories, mode]);
  const statsResult=useMemo(()=>{
    const start=clockNow();
    return {value:stateDeliveryStats(context,mode),ms:clockNow()-start};
  },[context,mode]);
  const stats=statsResult.value;
  useEffect(()=>recordTiming('map_aggregation',statsResult.ms),[statsResult]);
  const max = useMemo(() => Math.max(0, ...[...stats.values()].map(stat =>
    metric === 'orders' ? stat.distinctOrders : metric === 'onTime' ? (stat.onTimeDenominator >= MIN_SAMPLE ? stat.onTimeRate ?? 0 : 0) : (stat.durationCount >= MIN_SAMPLE ? stat.medianDeliveryDays ?? 0 : 0))), [stats,metric]);
  const rankedVolume = useMemo(() => [...stats.values()]
    .sort((a,b) => b.distinctOrders - a.distinctOrders || a.state.localeCompare(b.state)).slice(0,5), [stats]);
  const rankedPunctuality = useMemo(() => [...stats.values()]
    .filter(stat => stat.onTimeRate !== null && stat.onTimeDenominator >= MIN_SAMPLE)
    .sort((a,b) => a.onTimeRate! - b.onTimeRate! || b.onTimeDenominator - a.onTimeDenominator || a.state.localeCompare(b.state)).slice(0,5), [stats]);
  const active = mode === 'origin' ? filters.sellerStates : filters.customerStates;
  const focusedStates = new Set(filters.focusedFlows.map(pair=>mode==='origin'?pair.sellerState:pair.customerState));
  const rows = useMemo(() => UF_CODES.map(code => ({code, name: BRAZIL_STATES[code], stat: stats.get(code)})), [stats]);
  const metricDescription = metric === 'orders' ? 'Darker means more distinct orders.' : metric === 'onTime'
    ? 'Darker means higher on-time rate. Fewer than 30 eligible deliveries are shown neutral.'
    : 'Darker means longer median delivery duration. Fewer than 30 valid durations are shown neutral.';
  const paths = useMemo(() => {
    if (geo.status !== 'ready') return [];
    const projection = geoMercator().fitExtent([[18, 12], [506, 427]], geo.geography);
    const path = geoPath(projection);
    return geo.geography.features.map(f => ({code: String(f.id ?? f.properties?.SIGLA), d: path(f) ?? ''}));
  }, [geo]);

  const selectState = (code: string) => {
    dispatch({type:'toggle_value', dimension: mode === 'origin' ? 'sellerStates' : 'customerStates', value:code});
  };
  const modeLabel = mode === 'origin' ? 'Seller origins' : 'Customer destinations';
  const modeExplanation = mode === 'origin'
    ? 'Contextual performance by seller origin. Click multiple states to add/remove selections; other origin states stay visible.'
    : 'Contextual performance by customer destination. Click multiple states to add/remove selections.';

  return <div className="viz-body map-body">
    <div className="viz-controls"><div className="pill-switch" role="group" aria-label="Map geography view">
      <button type="button" aria-pressed={mode === 'origin'} className={mode === 'origin' ? 'is-active' : ''} onClick={() => {recordUserAction('MAP_VIEW_CHANGED','map');setDiagnosticView('mapMode','origin');setMode('origin');}}>Seller origins</button>
      <button type="button" aria-pressed={mode === 'destination'} className={mode === 'destination' ? 'is-active' : ''} onClick={() => {recordUserAction('MAP_VIEW_CHANGED','map');setDiagnosticView('mapMode','destination');setMode('destination');}}>Destinations</button>
    </div><span className="viz-meta">27 states · {MAP_METRICS[metric]}</span></div>
    <div className="map-measure-controls" role="group" aria-label="Map measurement">
      {(Object.keys(MAP_METRICS) as MapMetric[]).map(key => <button key={key} type="button" aria-pressed={metric===key}
        className={metric===key?'is-active':''} onClick={()=>{recordUserAction('MAP_MEASURE_CHANGED','map');setDiagnosticView('mapMeasure',key);setMetric(key);}}>{MAP_METRICS[key]}</button>)}
    </div>
    <p className="viz-caption">{modeExplanation} {metricDescription}</p>
    {geo.status === 'loading' ? <div className="viz-loading" role="status"><RefreshCcw size={16} className="spin-slow" aria-hidden="true"/> Loading verified state boundaries…</div> : null}
    {geo.status === 'error' ? <div role="alert" className="viz-error"><MapPin size={17} aria-hidden="true"/> {geo.message} <button type="button" onClick={geo.retry}>Retry loading map</button></div> : null}
    {geo.status === 'ready' ? <div className="map-layout">
      <div className="map-canvas"><svg viewBox="0 0 524 445" role="img" aria-label={`Map of Brazil showing ${modeLabel.toLowerCase()} by ${MAP_METRICS[metric].toLowerCase()}`}>
        <title>Brazil — {modeLabel} · {MAP_METRICS[metric]}</title>
        {paths.map(({code,d}) => {
          const stat = stats.get(code);
          const sample = metric === 'onTime' ? (stat?.onTimeDenominator ?? 0) : (stat?.durationCount ?? 0);
          const lowSample = metric !== 'orders' && sample > 0 && sample < MIN_SAMPLE;
          const value = measureValue(stat,metric);
          const bucket = value === null || (metric === 'orders' && value === 0) || (metric !== 'orders' && sample < MIN_SAMPLE)
            ? 0 : Math.min(5, Math.max(1, Math.ceil((value / (max || 1)) ** 0.58 * 5)));
          return <path key={code} d={d} className={`brazil-region map-bucket-${bucket}${active.includes(code) ? ' map-selected' : ''}${focusedStates.has(code) ? ' map-focus' : ''}`} onClick={() => selectState(code)}>
            <title>{stateLabel(code)} — {formatMapValue(stat,metric)}; {formatInteger(stat?.distinctOrders ?? 0)} distinct orders; {metric === 'onTime' ? `${sample} punctuality-eligible deliveries` : metric === 'median' ? `${sample} valid durations` : 'matching seller/customer state'}${lowSample ? ' (small sample — neutral fill)' : ''}{active.includes(code) ? ' (selected; click to remove)' : ' (click to add to selection)'}</title>
          </path>;
        })}
      </svg><div className="map-legend"><span>{metric==='orders'?'No matching orders':'Unavailable / fewer than 30'}</span><span className="map-swatches">{[0,1,2,3,4,5].map(i => <i key={i} className={`map-bucket-${i}`} aria-hidden="true" />)}</span><span>{metric==='onTime'?'Higher rate':metric==='median'?'Longer time':'Higher count'}</span></div></div>
      <div className="state-list-panel"><div className="state-list-title">{modeLabel} <span>SELECT A STATE</span></div>
        <div className="state-list" role="group" aria-label={`${modeLabel} state selection`}>
          {rows.map(({code,name,stat}) => <button type="button" className={`state-option${active.includes(code) ? ' state-option-active' : ''}${focusedStates.has(code) ? ' state-option-focused' : ''}`} aria-pressed={active.includes(code)} key={code} onClick={() => selectState(code)} title={`${name}: ${formatMapValue(stat,metric)}; ${formatInteger(stat?.onTimeDenominator ?? 0)} punctuality-eligible`}>
            <span><strong>{code}</strong> {name}</span><span className="state-measure-value">{formatMapValue(stat,metric)}{metric !== 'orders' ? <small>n={metric === 'onTime' ? (stat?.onTimeDenominator ?? 0) : (stat?.durationCount ?? 0)}{(metric === 'onTime' ? (stat?.onTimeDenominator ?? 0) : (stat?.durationCount ?? 0)) < MIN_SAMPLE ? ' · low N' : ''}</small> : null}</span>
          </button>)}
        </div>
        {active.length ? <button type="button" className="viz-clear" onClick={()=>dispatch({type:'clear_dimension',dimension:mode === 'origin' ? 'sellerStates' : 'customerStates'})}>Clear selected {mode === 'origin' ? 'origins' : 'destinations'}</button> : null}
      </div>
    </div> : null}
    <div className="state-rankings" role="region" aria-label="State performance rankings">
      <section><h4>Highest order volume <small>distinct orders</small></h4>
        {rankedVolume.length ? <ol>{rankedVolume.map(stat => <li key={stat.state}><span>{stat.state} · {BRAZIL_STATES[stat.state]}</span><strong>{formatInteger(stat.distinctOrders)}</strong></li>)}</ol> : <p>No eligible state orders.</p>}
      </section>
      <section><h4>Lowest on-time rate <small>at least {MIN_SAMPLE} eligible deliveries</small></h4>
        {rankedPunctuality.length ? <ol>{rankedPunctuality.map(stat => <li key={stat.state}><span>{stat.state} · {BRAZIL_STATES[stat.state]}</span><strong>{formatPercentage(stat.onTimeRate)} <small>n={formatInteger(stat.onTimeDenominator)}</small></strong></li>)}</ol> : <p>No states meet the minimum sample size.</p>}
      </section>
    </div>
    <p className="viz-smallprint">State geography only, not GPS routes. Seller-origin counts can overlap across states; they should not be summed into the national order KPI.</p>
  </div>;
}
