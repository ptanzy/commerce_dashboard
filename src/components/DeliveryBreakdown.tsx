import { deliveryBreakdown } from '../domain/selectors';
import type { Cohort } from '../domain/selectors';
import { formatInteger, formatPercentage } from './format';

/** Order-grain status distribution. Unknown includes all orders without punctuality-eligible evidence. */
export function DeliveryBreakdown({cohort}: {cohort:Cohort}) {
  const values = deliveryBreakdown(cohort);
  const groups = [
    {key:'early',label:'Early',count:values.early,color:'early'},
    {key:'on-time',label:'On promised date',count:values.onTime,color:'on-time'},
    {key:'late',label:'Late',count:values.late,color:'late'},
  ];
  return <section className="delivery-breakdown" aria-labelledby="delivery-breakdown-title">
    <div className="breakdown-header"><div>
      <h3 id="delivery-breakdown-title">Delivery outcomes</h3>
      <p>Mutually exclusive outcomes for delivered orders with valid dates and an estimate.</p>
    </div><span className="breakdown-count">{formatInteger(values.eligible)} eligible deliveries</span></div>
    {values.eligible ? <div role="img" aria-label={`Early ${values.early}, on promised date ${values.onTime}, late ${values.late}; ${values.unknown} other or unknown orders`} className="breakdown-bar">
      {groups.filter(group => group.count).map(group => <div key={group.key} className={`breakdown-slice breakdown-${group.color}`} style={{width:`${group.count / values.eligible * 100}%`}} title={`${group.label}: ${formatInteger(group.count)} (${formatPercentage(group.count / values.eligible)})`} />)}
    </div> : <div className="breakdown-empty">No deliveries have sufficient date information for an outcome classification.</div>}
    <div className="breakdown-legend">
      {groups.map(group=><div className="breakdown-legend-item" key={group.key}><span className={`breakdown-dot breakdown-${group.color}`}/><span>{group.label}</span><strong>{formatInteger(group.count)}</strong><small>{formatPercentage(values.eligible ? group.count / values.eligible : null)}</small></div>)}
    </div>
    <p className="breakdown-footnote">{formatInteger(values.unknown)} of {formatInteger(values.totalOrders)} eligible orders are undelivered, lack a valid promise, or have an unknown/invalid delivery outcome. They are excluded from the colored bar and on-time denominator.</p>
  </section>;
}
