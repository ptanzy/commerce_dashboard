import { memo, useMemo } from 'react';
import type { Dispatch, ReactNode } from 'react';
import { ArrowDownRight, BarChart3, GitBranch, MapPinned } from 'lucide-react';
import type { DashboardDataset } from '../data/loader';
import type { Cohort, Metrics } from '../domain/selectors';
import type { Filters, FilterAction } from '../domain/types';
import type { DashboardChartViews, DashboardDefinition, DashboardSectionId } from '../domain/dashboardWorkspace';
import { visibleDashboardSections } from '../domain/dashboardWorkspace';
import { groupDashboardSections } from '../domain/dashboardSectionLayout';
import { KpiCards } from '../components/KpiCards';
import { BrazilMap } from '../charts/BrazilMap';
import { DeliveryTrends } from '../charts/DeliveryTrends';
import { ShippingSankey } from '../charts/ShippingSankey';
import { OrderExplorer } from '../features/orders/OrderExplorer';
import { CategoryLeaderboard, DelayDistributionChart, PeriodComparisonPanel } from '../components/AdvancedExploration';
import { UiErrorBoundary } from '../observability/UiErrorBoundary';

// WU-10 memoization remains around each expensive analytical section.
const MemoBrazilMap = memo(BrazilMap);
const MemoDeliveryTrends = memo(DeliveryTrends);
const MemoShippingSankey = memo(ShippingSankey);
const MemoKpiCards = memo(KpiCards);
const MemoPeriodComparison = memo(PeriodComparisonPanel);
const MemoCategoryLeaderboard = memo(CategoryLeaderboard);
const MemoDelayDistribution = memo(DelayDistributionChart);
const MemoOrderExplorer = memo(OrderExplorer);

export interface DashboardSectionsProps {
  definition: DashboardDefinition;
  dataset: DashboardDataset;
  cohort: Cohort;
  contextCohort: Cohort;
  metrics: Metrics;
  analyticalFilters: Filters;
  selectionFilters: Filters;
  dispatch: Dispatch<FilterAction>;
  onChartViewChange?: <K extends keyof DashboardChartViews>(key: K, value: DashboardChartViews[K]) => void;
}

type ViewHandlers = {
  geographic: (value: DashboardChartViews['geographic']) => void;
  sankey: (value: DashboardChartViews['sankey']) => void;
  trends: (value: DashboardChartViews['trends']) => void;
  category: (value: DashboardChartViews['category']) => void;
};

/** Fixed registry: user configuration selects IDs, never components or executable markup. */
function sectionContent(id: DashboardSectionId, props: DashboardSectionsProps, handlers: ViewHandlers, expandTrends = false): ReactNode {
  const {dataset,cohort,contextCohort,metrics,analyticalFilters,selectionFilters,dispatch} = props;
  const views = props.definition.analysis.views;
  switch(id) {
    case 'kpis': return <MemoKpiCards metrics={metrics} cohort={cohort}/>;
    case 'periodComparison': return <UiErrorBoundary area="analytics"><MemoPeriodComparison index={dataset.index} filters={analyticalFilters} metrics={metrics}/></UiErrorBoundary>;
    case 'geographicDistribution': return <section className="viz-card" aria-labelledby="map-heading">
      <div className="viz-heading"><span className="future-icon"><MapPinned size={19} aria-hidden="true"/></span><div><h3 id="map-heading">Geographic distribution</h3><p>Seller origins & customer destinations</p></div></div>
      <UiErrorBoundary area="map"><MemoBrazilMap index={dataset.index} filters={analyticalFilters} dispatch={dispatch}
        view={views.geographic} onViewChange={handlers.geographic}/></UiErrorBoundary>
    </section>;
    case 'deliveryTrends': return <section className="viz-card" aria-labelledby="trend-heading">
      <div className="viz-heading"><span className="future-icon"><BarChart3 size={19} aria-hidden="true"/></span><div><h3 id="trend-heading">Delivery trends</h3><p>Historical order volume and punctuality</p></div></div>
      <UiErrorBoundary area="trends"><MemoDeliveryTrends index={dataset.index} filters={analyticalFilters} dispatch={dispatch}
        expandToFill={expandTrends} view={views.trends} onViewChange={props.onChartViewChange ? handlers.trends : undefined}/></UiErrorBoundary>
    </section>;
    case 'shippingSankey': return <section className="viz-card viz-sankey" aria-labelledby="flow-heading">
      <div className="viz-heading"><span className="future-icon"><GitBranch size={19} aria-hidden="true"/></span><div><h3 id="flow-heading">Where orders originate—and where they go</h3><p>Top 15 seller-to-customer state relationships</p></div>
        {visibleDashboardSections(props.definition).includes('orderExplorer')?<a className="explore-orders-link" href="#order-explorer">View matching orders <ArrowDownRight size={15} aria-hidden="true"/></a>:null}</div>
      <UiErrorBoundary area="sankey"><MemoShippingSankey cohort={contextCohort} filters={analyticalFilters} selectionFilters={selectionFilters} dispatch={dispatch}
        view={views.sankey} onViewChange={handlers.sankey}/></UiErrorBoundary>
    </section>;
    case 'categoryLeaderboard': return <MemoCategoryLeaderboard cohort={cohort}
      view={views.category} onViewChange={handlers.category}/>;
    case 'delayDistribution': return <MemoDelayDistribution cohort={cohort}/>;
    case 'orderExplorer': return <UiErrorBoundary area="orders"><MemoOrderExplorer index={dataset.index} cohort={cohort} filters={analyticalFilters}/></UiErrorBoundary>;
  }
}

/**
 * Only visible section IDs are mounted. Hide/show preserves shared filters and
 * focus while keeping high-cost chart-specific effects and calculations absent.
 * The complete order is honored so Phase 4 can add ordering controls without
 * changing how a definition is rendered.
 */
export function DashboardSections(props: DashboardSectionsProps) {
  // Stable callback props preserve WU-10 memoization for charts unaffected by a tab change.
  const handlers = useMemo<ViewHandlers>(()=>({
    geographic:value=>props.onChartViewChange?.('geographic',value),
    sankey:value=>props.onChartViewChange?.('sankey',value),
    trends:value=>props.onChartViewChange?.('trends',value),
    category:value=>props.onChartViewChange?.('category',value),
  }),[props.onChartViewChange]);
  const visible = visibleDashboardSections(props.definition);
  if (!visible.length) return <section className="workspace-empty" role="status">
    <LayoutGridEmptyIcon/>
    <h2>No analytical sections are visible</h2>
    <p>Expand Dashboard Workspace to show the panels you want. Your filters and export remain available above and below this message.</p>
  </section>;
  const blocks = groupDashboardSections(visible);
  return <>{blocks.map((block,index)=>{
    // Group position is independent of unrelated groups being hidden.
    const ordinal = blocks.slice(0,index).filter(other=>other.group===block.group).length;
    const stableGroupKey = `${block.group}-${ordinal}`;
    // Phase 2C's responsive chart expansion is enabled only when trends and the
    // geographic map share a grid row. A standalone chart keeps natural height.
    const expandTrends = block.group==='charts' && block.sections.some((id,index)=>
      id==='deliveryTrends' && (block.sections[index-1]==='geographicDistribution' || block.sections[index+1]==='geographicDistribution'));
    const content = block.sections.map(id=><div
      className={block.group==='charts'&&id==='shippingSankey'?'workspace-wide-section':(id==='deliveryTrends'&&expandTrends?'workspace-section-slot workspace-trend-fill':'workspace-section-slot')}
      key={id} data-dashboard-section={id}>{sectionContent(id,props,handlers,expandTrends)}</div>);
    // Section groups are structural grids only. Fixed numbered story headings
    // would become misleading when a dashboard is reordered.
    if (block.group==='charts') return <section className="workspace-visualization-group" aria-label="Analytical charts" key={stableGroupKey}>
      <div className={`chart-grid workspace-chart-grid${block.sections.length===1?' workspace-single-chart':''}${expandTrends?' workspace-geo-trend-pair':''}`}>{content}</div>
    </section>;
    if (block.group==='advanced') return <section className="workspace-visualization-group workspace-detail-group" aria-label="Detailed analytics" key={stableGroupKey}>
      <div className={`advanced-grid${block.sections.length===1?' workspace-single-advanced':''}`}>{content}</div>
    </section>;
    return <div key={stableGroupKey} data-dashboard-section={block.sections[0]}>{sectionContent(block.sections[0],props,handlers)}</div>;
  })}</>;
}

function LayoutGridEmptyIcon(){return <BarChart3 size={27} aria-hidden="true"/>;}
