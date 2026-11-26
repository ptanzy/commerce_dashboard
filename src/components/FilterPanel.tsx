import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Filter, RotateCcw, Search, X } from 'lucide-react';
import type { Dispatch } from 'react';
import { categoryLabel } from '../domain/selectors';
import type { FilterAction, Filters, MultiDimension } from '../domain/types';
import { stateLabel } from './stateNames';

export interface FilterOptions {
  customers: readonly string[];
  sellers: readonly string[];
  categories: readonly string[];
  dateMin: string | null;
  dateMax: string | null;
}

interface Props {
  filters: Filters;
  dispatch: Dispatch<FilterAction>;
  options: FilterOptions;
  matchedCount: number;
  totalCount: number;
  updating?: boolean;
}

function SelectedChip({ label, onClear }: {label: string; onClear: () => void}) {
  return <button type="button" className="filter-chip" onClick={onClear} aria-label={`Clear ${label} filter`}>
    <span>{label}</span><X size={13} strokeWidth={2.2} aria-hidden="true" />
  </button>;
}

interface MultiFilterProps {
  label: string;
  values: readonly string[];
  options: readonly string[];
  dimension: MultiDimension;
  dispatch: Dispatch<FilterAction>;
  display: (value: string) => string;
  searchable?: boolean;
}

function MultiFilter({ label, values, options, dimension, display, dispatch, searchable = false }: MultiFilterProps) {
  const [query,setQuery] = useState('');
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) details.open = false;
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);
  const filtered = searchable ? options.filter(value => display(value).toLowerCase().includes(query.trim().toLowerCase())) : options;
  return <div className="field multi-filter-field">
    <span className="field-label">{label} <span className="label-hint">(multi-select)</span></span>
    <details ref={detailsRef} className="multi-filter" onKeyDown={event=>{if(event.key==='Escape') (event.currentTarget as HTMLDetailsElement).open=false;}}>
      <summary className="field-control multi-filter-trigger" aria-label={label}>
        {values.length === 0 ? `All ${label.toLowerCase()}` : values.length === 1 ? display(values[0]) : `${values.length} selected`}
        <span aria-hidden="true" className="multi-filter-chevron">⌄</span>
      </summary>
      <div className="multi-filter-menu">
        <div className="multi-filter-toolbar"><span>{values.length} selected</span>{values.length ? <button type="button" onClick={()=>dispatch({type:'clear_dimension',dimension})}>Clear group</button> : null}</div>
        {searchable ? <label className="multi-filter-search"><Search size={15} aria-hidden="true"/><span className="sr-only">Search {label.toLowerCase()}</span><input aria-label={`Search ${label.toLowerCase()}`} type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Find a category…"/></label> : null}
        <div className="multi-filter-options" role="group" aria-label={`${label} options`}>
          {filtered.map(value => <label key={value} className="multi-filter-option">
            <input type="checkbox" aria-label={`${label}: ${display(value)}`} checked={values.includes(value)} onChange={()=>dispatch({type:'toggle_value',dimension,value})} />
            <span>{display(value)}</span>
          </label>)}
          {filtered.length === 0 ? <p className="multi-filter-no-options">No matching categories.</p> : null}
        </div>
      </div>
    </details>
  </div>;
}

export function FilterPanel({ filters, dispatch, options, matchedCount, totalCount, updating = false }: Props) {
  const dateActive = filters.purchaseDateFrom !== null || filters.purchaseDateTo !== null;
  const active = Number(dateActive) + filters.customerStates.length + filters.sellerStates.length + filters.categories.length + filters.focusedFlows.length;
  const handleDateFrom = (from: string | null) => dispatch({type: 'set_date_range', from, to: filters.purchaseDateTo && from && from > filters.purchaseDateTo ? null : filters.purchaseDateTo});
  const handleDateTo = (to: string | null) => dispatch({type: 'set_date_range', from: filters.purchaseDateFrom && to && to < filters.purchaseDateFrom ? null : filters.purchaseDateFrom, to});

  return <section className="panel filters-panel" aria-label="Dashboard filters">
    <div className="filter-heading">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="section-icon"><Filter size={16} aria-hidden="true" /></span>
        <div>
          <h2 className="section-title">Refine your view</h2>
          <p className="section-subtitle">OR within each group · AND between groups · Focus a Sankey flow without losing context</p>
        </div>
      </div>
      <button className="reset-button" type="button" onClick={() => dispatch({type:'clear_all'})} disabled={active === 0}>
        <RotateCcw size={14} aria-hidden="true" /> Reset all
      </button>
    </div>

    <div className="filter-grid">
      <MultiFilter label="Seller origins" values={filters.sellerStates} options={options.sellers} dimension="sellerStates" dispatch={dispatch} display={stateLabel}/>
      <MultiFilter label="Customer destinations" values={filters.customerStates} options={options.customers} dimension="customerStates" dispatch={dispatch} display={stateLabel}/>
      <MultiFilter label="Product categories" values={filters.categories} options={options.categories} dimension="categories" dispatch={dispatch} display={categoryLabel} searchable />
      <fieldset className="date-fieldset">
        <legend className="field-label">Purchase date <span className="label-hint">(inclusive)</span></legend>
        <div className="date-fields">
          <label className="date-input-wrap">
            <span className="sr-only">Purchase date from</span>
            <CalendarDays size={14} aria-hidden="true" />
            <input aria-label="Purchase date from" type="date" className="date-input" value={filters.purchaseDateFrom ?? ''}
              min={options.dateMin ?? undefined} max={options.dateMax ?? undefined}
              onChange={(event) => handleDateFrom(event.target.value || null)} />
          </label>
          <span className="date-divider" aria-hidden="true">to</span>
          <label className="date-input-wrap">
            <span className="sr-only">Purchase date to</span>
            <input aria-label="Purchase date to" type="date" className="date-input" value={filters.purchaseDateTo ?? ''}
              min={options.dateMin ?? undefined} max={options.dateMax ?? undefined}
              onChange={(event) => handleDateTo(event.target.value || null)} />
          </label>
        </div>
      </fieldset>
    </div>

    <div className="filter-footer">
      <div className="flex min-h-8 flex-1 flex-wrap items-center gap-2" aria-label="Active filters">
        {active === 0 ? <span className="all-data-pill"><span className="live-dot" /> All historical data · No filters applied</span> : <>
          <span className="active-label">Active filters</span>
          {filters.sellerStates.map(code=><SelectedChip key={`o-${code}`} label={`Origin: ${code}`} onClear={()=>dispatch({type:'toggle_value',dimension:'sellerStates',value:code})}/>)}
          {filters.customerStates.map(code=><SelectedChip key={`d-${code}`} label={`Destination: ${code}`} onClear={()=>dispatch({type:'toggle_value',dimension:'customerStates',value:code})}/>)}
          {filters.categories.map(category=><SelectedChip key={`c-${category}`} label={`Category: ${categoryLabel(category)}`} onClear={()=>dispatch({type:'toggle_value',dimension:'categories',value:category})}/>)}
          {dateActive && <SelectedChip label={`Date: ${filters.purchaseDateFrom ?? 'Start'} – ${filters.purchaseDateTo ?? 'End'}`} onClear={() => dispatch({type:'set_date_range',from:null,to:null})} />}
          {filters.focusedFlows.length > 0 && <SelectedChip
            label={`${filters.focusedFlows.length} focused ${filters.focusedFlows.length === 1 ? 'flow' : 'flows'}`}
            onClear={() => dispatch({type:'clear_flow_focus'})}
          />}
        </>}
      </div>
      <span className="result-count" role="status" aria-live="polite">{updating ? <span className="filter-updating">Updating results… · </span> : null}{matchedCount.toLocaleString('en-US')} <span>of {totalCount.toLocaleString('en-US')} orders</span></span>
    </div>
  </section>;
}
