import { useMemo, useState } from 'react';
import type { Dispatch } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import type { DataIndex } from '../data/indexes';
import type { FilterAction, Filters } from '../domain/types';
import { monthDateRange, monthlyTrendContext } from '../domain/selectors';
import { formatInteger, formatPercentage } from '../components/format';

type TrendMeasure = 'orders' | 'onTime';
const W = 860, H = 294, L = 62, R = 18, T = 22, B = 51;

export function DeliveryTrends({index, filters, dispatch}: {index: DataIndex; filters: Filters; dispatch: Dispatch<FilterAction>}) {
  const [measure, setMeasure] = useState<TrendMeasure>('orders');
  const months = useMemo(() => monthlyTrendContext(index,filters), [index,filters]);
  const x = useMemo(() => scaleBand<string>().domain(months.map(m => m.month)).range([L, W-R]).paddingInner(.20).paddingOuter(.08), [months]);
  const maxOrders = Math.max(1,...months.map(m => m.distinctOrders));
  const y = scaleLinear().domain([0, measure === 'orders' ? maxOrders * 1.08 : 1]).nice(measure === 'orders' ? 5 : 4).range([H-B,T]);
  const selectedDates = filters.purchaseDateFrom !== null || filters.purchaseDateTo !== null;
  const selectedMonth = months.find(m => m.selected && selectedDates && filters.purchaseDateFrom === monthDateRange(m.month).from && filters.purchaseDateTo === monthDateRange(m.month).to)?.month;
  const chooseMonth = (month:string) => dispatch({type:'set_date_range', ...monthDateRange(month)});

  return <div className="viz-body trend-body">
    <div className="viz-controls"><div className="pill-switch" role="group" aria-label="Monthly trend metric">
      <button type="button" aria-pressed={measure === 'orders'} className={measure === 'orders' ? 'is-active' : ''} onClick={() => setMeasure('orders')}>Order volume</button>
      <button type="button" aria-pressed={measure === 'onTime'} className={measure === 'onTime' ? 'is-active' : ''} onClick={() => setMeasure('onTime')}>On-time rate</button>
    </div><span className="viz-meta">{months.length} historical months</span></div>
    <p className="viz-caption">Historical context keeps all months visible under the current seller, destination and category filters. The highlighted dates filter KPIs, map and flows.</p>
    {months.length === 0 ? <div className="viz-empty" role="status">No valid historical purchase dates are available.</div> : <>
      <div className="trend-plot"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${measure === 'orders' ? 'Monthly order count' : 'Monthly on-time delivery rate'} across the full historical purchase period. Selected date intervals are highlighted.`}>
        <title>Olist {measure === 'orders' ? 'monthly order volume' : 'monthly on-time percentage'} — full date context</title>
        {y.ticks(4).map(tick => <g key={tick}><line x1={L} x2={W-R} y1={y(tick)} y2={y(tick)} className="trend-gridline"/><text x={L-12} y={y(tick)+4} className="trend-axis-label" textAnchor="end">{measure === 'orders' ? formatInteger(tick) : `${Math.round(tick*100)}%`}</text></g>)}
        {months.map((month,i) => {
          const value = measure === 'orders' ? month.distinctOrders : month.onTimeRate;
          const from = y(value ?? 0), barWidth = x.bandwidth();
          const xPos = x(month.month) ?? L;
          const partialEdge = i === 0 || i === months.length-1;
          const sparse = (measure === 'onTime' ? month.onTimeDenominator : month.distinctOrders) < 30;
          const title = `${month.month}: ${formatInteger(month.distinctOrders)} orders; ${formatPercentage(month.onTimeRate)} on time (${formatInteger(month.onTimeDenominator)} eligible)${sparse ? '; small sample' : ''}${partialEdge ? '; edge month may be partial' : ''}. ${month.selected ? 'Within selected date range' : 'Outside selected date range'}`;
          return <g key={month.month}>
            {month.selected && selectedDates ? <rect className="trend-selected-column" x={xPos-2} y={T-8} width={barWidth+4} height={H-B-T+16} rx={3}/> : null}
            {value !== null && value > 0 ? <rect x={xPos} y={from} width={barWidth} height={Math.max(1,y(0)-from)} className={`trend-bar${month.selected ? '' : ' trend-muted'}${sparse ? ' trend-sparse' : ''}`} rx={Math.min(2,barWidth/3)} /> : null}
            <rect x={xPos-2} y={T} width={barWidth+4} height={H-B-T} fill="transparent" className="trend-hit" onClick={() => chooseMonth(month.month)}><title>{title} Click to filter to this month.</title></rect>
            {(i===0 || i===months.length-1 || i%3===0) ? <text className="trend-axis-label" x={xPos+barWidth/2} y={H-31} textAnchor="middle">{month.month.slice(5)}</text> : null}
            {(i===0 || month.month.endsWith('-01')) ? <text className="trend-year-label" x={xPos+barWidth/2} y={H-12} textAnchor="middle">{month.month.slice(0,4)}</text> : null}
            {sparse && value !== null && value > 0 ? <circle cx={xPos+barWidth/2} cy={Math.max(T+4,from-7)} r={2.5} className="trend-low-marker"><title>Low sample: {measure === 'orders' ? month.distinctOrders : month.onTimeDenominator} observations</title></circle> : null}
          </g>;
        })}
      </svg></div>
      <div className="trend-bottom"><label className="trend-month-select">Select month <select value={selectedMonth ?? ''} onChange={e=>e.target.value && chooseMonth(e.target.value)} aria-label="Select purchase month">
        <option value="">Choose a month</option>{months.map(m => <option value={m.month} key={m.month}>{m.month} · {formatInteger(m.distinctOrders)} orders</option>)}
      </select></label>
      <span className="trend-note"><span className="legend-dot"/> Highlight = current date selection · Small dots = low sample</span>
      {selectedDates ? <button type="button" className="viz-clear" onClick={()=>dispatch({type:'set_date_range',from:null,to:null})}>Clear date selection</button> : null}</div>
    </>}
    <p className="viz-smallprint">Rates count only delivered orders with valid delivery and promised dates. Empty-rate months are not shown as 0%; first/last historical months may be partial. Click a bar or use month selection to change the active date range.</p>
  </div>;
}
