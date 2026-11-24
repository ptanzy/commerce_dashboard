import { useEffect, useMemo, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { FeatureCollection, Geometry } from 'geojson';
import { MapPin, RefreshCcw } from 'lucide-react';
import type { Dispatch } from 'react';
import type { DataIndex } from '../data/indexes';
import { selectCohort } from '../domain/selectors';
import { destinationStateOrderCounts, originStateOrderCounts } from '../domain/selectors';
import type { FilterAction, Filters } from '../domain/types';
import { BRAZIL_STATES, stateLabel } from '../components/stateNames';
import { formatInteger } from '../components/format';

const UF_CODES = Object.keys(BRAZIL_STATES).sort();
const topologyUrl = `${import.meta.env.BASE_URL}geo/brazil-states.topojson`;
type MapMode = 'origin' | 'destination';
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

function useBrazilGeography(): MapStatus {
  const [result, setResult] = useState<MapStatus>({status:'loading'});
  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => fetch(topologyUrl, { signal: controller.signal })).then(async (response) => {
      if (!response.ok) throw new Error(`Map asset returned HTTP ${response.status}. Generate it with python scripts/prepare_geo.py.`);
      return parseBrazilTopology(await response.json());
    }).then(geography => setResult({status:'ready', geography}))
      .catch(error => {if (!controller.signal.aborted) setResult({status:'error', message: error instanceof Error ? error.message : String(error)});});
    return () => controller.abort();
  }, []);
  return result;
}

export function BrazilMap({index, filters, dispatch}: {index: DataIndex; filters: Filters; dispatch: Dispatch<FilterAction>}) {
  const [mode, setMode] = useState<MapMode>('origin');
  const geo = useBrazilGeography();
  // Ignore only the displayed dimension, so users can add another state without its count disappearing.
  // A focused Sankey flow is visual emphasis, not a constraint on this context map.
  const context = useMemo(() => selectCohort(index, {
    ...filters, focusedFlow: null,
    ...(mode === 'origin' ? {sellerStates: []} : {customerStates: []}),
  }), [index, filters.purchaseDateFrom, filters.purchaseDateTo, filters.customerStates, filters.sellerStates, filters.categories, mode]);
  const counts = useMemo(() => mode === 'origin' ? originStateOrderCounts(context) : destinationStateOrderCounts(context), [context, mode]);
  const max = useMemo(() => Math.max(0, ...counts.values()), [counts]);
  const active = mode === 'origin' ? filters.sellerStates : filters.customerStates;
  const focusedState = mode === 'origin' ? filters.focusedFlow?.sellerState : filters.focusedFlow?.customerState;
  const rows = useMemo(() => UF_CODES.map(code => ({code, name: BRAZIL_STATES[code], count: counts.get(code) ?? 0})), [counts]);
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
    ? 'Contextual order counts by seller state. Click multiple states to add/remove selections; other origin states stay visible.'
    : 'Contextual order counts by customer destination. Click multiple states to add/remove selections.';

  return <div className="viz-body map-body">
    <div className="viz-controls"><div className="pill-switch" role="group" aria-label="Map geography view">
      <button type="button" aria-pressed={mode === 'origin'} className={mode === 'origin' ? 'is-active' : ''} onClick={() => setMode('origin')}>Seller origins</button>
      <button type="button" aria-pressed={mode === 'destination'} className={mode === 'destination' ? 'is-active' : ''} onClick={() => setMode('destination')}>Destinations</button>
    </div><span className="viz-meta">27 states · Distinct orders</span></div>
    <p className="viz-caption">{modeExplanation}</p>
    {geo.status === 'loading' ? <div className="viz-loading" role="status"><RefreshCcw size={16} className="spin-slow" aria-hidden="true"/> Loading verified state boundaries…</div> : null}
    {geo.status === 'error' ? <div role="alert" className="viz-error"><MapPin size={17} aria-hidden="true"/> {geo.message}</div> : null}
    {geo.status === 'ready' ? <div className="map-layout">
      <div className="map-canvas"><svg viewBox="0 0 524 445" role="img" aria-label={`Map of Brazil showing ${modeLabel.toLowerCase()} as state-level distinct order counts`}>
        <title>Brazil — {modeLabel} · distinct order count</title>
        {paths.map(({code,d}) => {
          const count = counts.get(code) ?? 0;
          const bucket = count === 0 ? 0 : Math.min(5, Math.max(1, Math.ceil((count / (max || 1)) ** 0.58 * 5)));
          return <path key={code} d={d} className={`brazil-region map-bucket-${bucket}${active.includes(code) ? ' map-selected' : ''}${focusedState === code ? ' map-focus' : ''}`} onClick={() => selectState(code)}>
            <title>{stateLabel(code)} — {formatInteger(count)} {mode === 'origin' ? 'orders with matching seller items' : 'customer orders'}{active.includes(code) ? ' (selected; click to remove)' : ' (click to add to selection)'}</title>
          </path>;
        })}
      </svg><div className="map-legend"><span>No matching records</span><span className="map-swatches">{[0,1,2,3,4,5].map(i => <i key={i} className={`map-bucket-${i}`} aria-hidden="true" />)}</span><span>Higher count</span></div></div>
      <div className="state-list-panel"><div className="state-list-title">{modeLabel} <span>SELECT A STATE</span></div>
        <div className="state-list" role="group" aria-label={`${modeLabel} state selection`}>
          {rows.map(({code,name,count}) => <button type="button" className={`state-option${active.includes(code) ? ' state-option-active' : ''}${focusedState === code ? ' state-option-focused' : ''}`} aria-pressed={active.includes(code)} key={code} onClick={() => selectState(code)} title={`${name}: ${formatInteger(count)} distinct orders`}>
            <span><strong>{code}</strong> {name}</span><span>{formatInteger(count)}</span>
          </button>)}
        </div>
        {active.length ? <button type="button" className="viz-clear" onClick={()=>dispatch({type:'clear_dimension',dimension:mode === 'origin' ? 'sellerStates' : 'customerStates'})}>Clear selected {mode === 'origin' ? 'origins' : 'destinations'}</button> : null}
      </div>
    </div> : null}
    <p className="viz-smallprint">State geography only, not GPS routes. Seller-origin counts can overlap across states; they should not be summed into the national order KPI.</p>
  </div>;
}
