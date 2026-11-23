import { CalendarDays, Filter, RotateCcw, X } from 'lucide-react';
import type { Dispatch } from 'react';
import { categoryLabel } from '../domain/selectors';
import type { FilterAction, Filters } from '../domain/types';
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
}

function SelectedChip({ label, onClear }: {label: string; onClear: () => void}) {
  return <button type="button" className="filter-chip" onClick={onClear} aria-label={`Clear ${label} filter`}>
    <span>{label}</span><X size={13} strokeWidth={2.2} aria-hidden="true" />
  </button>;
}

export function FilterPanel({ filters, dispatch, options, matchedCount, totalCount }: Props) {
  const dateActive = filters.purchaseDateFrom !== null || filters.purchaseDateTo !== null;
  const active = Number(dateActive) + Number(Boolean(filters.customerState)) + Number(Boolean(filters.sellerState)) + Number(Boolean(filters.category));
  const handleDateFrom = (from: string | null) => dispatch({type: 'set_date_range', from, to: filters.purchaseDateTo && from && from > filters.purchaseDateTo ? null : filters.purchaseDateTo});
  const handleDateTo = (to: string | null) => dispatch({type: 'set_date_range', from: filters.purchaseDateFrom && to && to < filters.purchaseDateFrom ? null : filters.purchaseDateFrom, to});

  return <section className="panel filters-panel" aria-label="Dashboard filters">
    <div className="filter-heading">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="section-icon"><Filter size={16} aria-hidden="true" /></span>
        <div>
          <h2 className="section-title">Refine your view</h2>
          <p className="section-subtitle">All filters apply across the same order cohort</p>
        </div>
      </div>
      <button className="reset-button" type="button" onClick={() => dispatch({type:'clear_all'})} disabled={active === 0}>
        <RotateCcw size={14} aria-hidden="true" /> Reset all
      </button>
    </div>

    <div className="filter-grid">
      <label className="field">
        <span className="field-label">Seller origin <span className="label-hint">(UF)</span></span>
        <select aria-label="Seller origin" className="field-control" value={filters.sellerState ?? ''}
          onChange={(event) => dispatch({type:'set_seller_state',state:event.target.value || null})}>
          <option value="">All seller states</option>
          {options.sellers.map((state) => <option key={state} value={state}>{stateLabel(state)}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Customer destination <span className="label-hint">(UF)</span></span>
        <select aria-label="Customer destination" className="field-control" value={filters.customerState ?? ''}
          onChange={(event) => dispatch({type:'set_customer_state',state:event.target.value || null})}>
          <option value="">All customer states</option>
          {options.customers.map((state) => <option key={state} value={state}>{stateLabel(state)}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Product category</span>
        <select aria-label="Product category" className="field-control" value={filters.category ?? ''}
          onChange={(event) => dispatch({type:'set_category',category:event.target.value || null})}>
          <option value="">All categories</option>
          {options.categories.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}
        </select>
      </label>
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
          {filters.sellerState && <SelectedChip label={`Origin: ${filters.sellerState}`} onClear={() => dispatch({type:'set_seller_state',state:null})} />}
          {filters.customerState && <SelectedChip label={`Destination: ${filters.customerState}`} onClear={() => dispatch({type:'set_customer_state',state:null})} />}
          {filters.category && <SelectedChip label={`Category: ${categoryLabel(filters.category)}`} onClear={() => dispatch({type:'set_category',category:null})} />}
          {dateActive && <SelectedChip label={`Date: ${filters.purchaseDateFrom ?? 'Start'} – ${filters.purchaseDateTo ?? 'End'}`} onClear={() => dispatch({type:'set_date_range',from:null,to:null})} />}
        </>}
      </div>
      <span className="result-count" role="status" aria-live="polite">{matchedCount.toLocaleString('en-US')} <span>of {totalCount.toLocaleString('en-US')} orders</span></span>
    </div>
  </section>;
}
