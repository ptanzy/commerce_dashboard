import { ArrowUpRight, Clock3, PackageCheck, Percent, ShoppingBag } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Metrics } from '../domain/selectors';
import { formatDays, formatInteger, formatPercentage } from './format';

interface CardProps {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
  tone: 'indigo' | 'mint' | 'amber' | 'blue';
  caption: string;
}

function KpiCard({ label, value, note, icon, tone, caption }: CardProps) {
  return <article className={`kpi-card kpi-${tone}`} aria-label={`${label}: ${value}`}>
    <div className="kpi-topline">
      <span className="kpi-icon" aria-hidden="true">{icon}</span>
      <span className="kpi-meta"><ArrowUpRight size={15} aria-hidden="true" /> Historical</span>
    </div>
    <h3 className="kpi-label">{label}</h3>
    <div className="kpi-value" data-testid={`kpi-${tone}`}>{value}</div>
    <p className="kpi-note">{note}</p>
    <div className="kpi-bottom">{caption}</div>
  </article>;
}

export function KpiCards({ metrics }: {metrics: Metrics}) {
  return <section aria-labelledby="kpi-heading" className="metrics-section">
    <div className="section-headline">
      <div>
        <div className="section-eyebrow">01 / PERFORMANCE OVERVIEW</div>
        <h2 id="kpi-heading" className="content-heading">The numbers at a glance</h2>
      </div>
      <span className="metric-note">Calculated from your active filters</span>
    </div>
    <div className="kpi-grid">
      <KpiCard label="Distinct orders" value={formatInteger(metrics.distinctOrders)} icon={<ShoppingBag size={22} />}
        note="Each eligible order counted once" tone="indigo" caption="Order-grain metric" />
      <KpiCard label="On-time delivery" value={formatPercentage(metrics.onTimeRate)} icon={<PackageCheck size={22} />}
        note={`${formatInteger(metrics.onTimeNumerator)} of ${formatInteger(metrics.onTimeDenominator)} eligible deliveries`}
        tone="mint" caption="Delivered by promised calendar date" />
      <KpiCard label="Median delivery" value={formatDays(metrics.medianDeliveryDays)} icon={<Clock3 size={22} />}
        note={`${formatInteger(metrics.deliveredDurationCount)} valid durations`} tone="amber" caption="Purchase → customer delivery" />
      <KpiCard label="Freight / item price" value={formatPercentage(metrics.freightToPriceRatio)} icon={<Percent size={22} />}
        note="Customer freight charges ÷ matching item price" tone="blue"
        caption={metrics.invalidPriceItems || metrics.invalidFreightItems
          ? `${formatInteger(metrics.invalidPriceItems)} invalid prices · ${formatInteger(metrics.invalidFreightItems)} invalid freight`
          : 'Item-grain metric · BRL amounts'} />
    </div>
  </section>;
}

export function KpiSkeletons() {
  return <section aria-label="Loading dashboard metrics" className="metrics-section">
    <div className="section-headline"><div><div className="section-eyebrow">01 / PERFORMANCE OVERVIEW</div><h2 className="content-heading">The numbers at a glance</h2></div></div>
    <div className="kpi-grid">{[0,1,2,3].map(i => <div className="kpi-card" key={i} aria-hidden="true"><div className="skeleton skeleton-icon"/><div className="skeleton skeleton-line"/><div className="skeleton skeleton-number"/><div className="skeleton skeleton-line"/></div>)}</div>
  </section>;
}
