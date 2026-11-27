import { useState } from 'react';
import type { Dispatch } from 'react';
import { Bookmark, ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { SAVED_VIEWS_LIMIT } from '../domain/savedViews';
import type { FilterAction, Filters } from '../domain/types';
import type { FilterOptions } from './FilterPanel';
import { FilterPanel } from './FilterPanel';
import { ActiveFilterContext } from './ActiveFilterContext';
import { SavedViews } from './SavedViews';
import '../styles/wu11_filters_views.css';

interface Props {
  filters: Filters;
  dispatch: Dispatch<FilterAction>;
  options: FilterOptions;
  matchedCount: number;
  totalCount: number;
  updating: boolean;
  /** The dashboard owns this setting. Collapsing the UI never changes it. */
  filterPanelVisible: boolean;
  onShowFilterPanel: () => void;
}

/** One disclosure for the three related filtering tools, without merging their persistence. */
export function FiltersAndViews({ filters, dispatch, options, matchedCount, totalCount, updating, filterPanelVisible, onShowFilterPanel }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  return <section className="filters-views" aria-label="Filters & Views">
    <div className="filters-views-toolbar">
      <button type="button" className="filters-views-toggle" aria-label="Filters & Views"
        aria-expanded={expanded} aria-controls="filters-views-content" onClick={() => setExpanded(open => !open)}>
        <Filter size={17} aria-hidden="true" />
        <span className="filters-views-heading">Filters &amp; Views</span>

        {expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
      </button>
      <span className="filters-views-result" role="status" aria-live="polite">
        {updating ? 'Updating results…' : `${matchedCount.toLocaleString('en-US')} of ${totalCount.toLocaleString('en-US')} orders`}
      </span>
    </div>

    {/* This summary is outside the disclosure so hidden controls never conceal active constraints. */}
    <div className="filters-views-active">
      <ActiveFilterContext filters={filters} dispatch={dispatch} filterPanelVisible={filterPanelVisible}
        onShowFilterPanel={() => { setExpanded(true); onShowFilterPanel(); }} />
    </div>

    {/* Keep the children mounted so collapsing does not discard partially entered preset names or selections. */}
    <div id="filters-views-content" className="filters-views-content" hidden={!expanded}>
      {filterPanelVisible ? <FilterPanel filters={filters} dispatch={dispatch} options={options}
        matchedCount={matchedCount} totalCount={totalCount} updating={updating} /> :
        <p className="filters-views-controls-hidden">Full filter controls are hidden in this dashboard. Active filters remain applied; use “Show filter controls” above to restore them.</p>}
      <details className="filters-views-presets">
        <summary><Bookmark size={16} aria-hidden="true"/><strong>Saved filter views</strong><span>{savedCount}/{SAVED_VIEWS_LIMIT} · Reusable filter presets, separate from dashboard layouts</span></summary>
        <SavedViews filters={filters} dispatch={dispatch} onCountChange={setSavedCount}/>
      </details>
    </div>
  </section>;
}
