'use client';

import { ReactNode } from 'react';

type Tone = 'neutral' | 'primary' | 'accent';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type HeaderAction = {
  label: string;
  onClick?: () => void;
  variant?: ButtonVariant;
};

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: HeaderAction[];
};

export function PageHeader({ title, subtitle, actions = [] }: PageHeaderProps) {
  return (
    <div className="ui-page-header">
      <div className="ui-header-info">
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions.length > 0 ? (
        <div className="ui-header-actions">
          {actions.map((action, index) => (
            <button
              key={`${action.label}-${index}`}
              type="button"
              className={`ui-btn ${getButtonClass(action.variant)}`}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type SectionCardProps = {
  title?: string;
  subtitle?: string;
  badge?: string;
  tone?: Tone;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function SectionCard({
  title,
  subtitle,
  badge,
  tone = 'neutral',
  actions,
  children,
  className,
}: SectionCardProps) {
  return (
    <section className={`ui-card ui-card-${tone} ${className ?? ''}`.trim()}>
      {title || badge || actions ? (
        <header className="ui-card-head">
          <div>
            {badge ? <span className={`ui-chip ${tone === 'accent' ? 'accent' : 'primary'}`}>{badge}</span> : null}
            {title ? <h3>{title}</h3> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className="ui-card-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div>{children}</div>
    </section>
  );
}

type MetricCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
};

export function MetricCard({ label, value, hint, tone = 'neutral' }: MetricCardProps) {
  return (
    <article className={`ui-metric ui-card-${tone}`}>
      <span className="ui-metric-label">{label}</span>
      <strong className="stat-number">{value}</strong>
      {hint ? <small className="ui-metric-hint">{hint}</small> : null}
    </article>
  );
}

type DataTableProps = {
  children: ReactNode;
};

export function DataTable({ children }: DataTableProps) {
  return (
    <div className="table-wrap ui-table-wrap">
      <table className="data-table ui-table">{children}</table>
    </div>
  );
}

type ChartCardProps = {
  title: string;
  subtitle?: string;
  badge?: string;
  children: ReactNode;
};

export function ChartCard({ title, subtitle, badge, children }: ChartCardProps) {
  return (
    <SectionCard title={title} subtitle={subtitle} badge={badge} tone="primary">
      <div className="ui-chart-area">{children}</div>
    </SectionCard>
  );
}

type ActionButtonProps = {
  label: string;
  onClick?: () => void;
  variant?: ButtonVariant;
  type?: 'button' | 'submit';
  disabled?: boolean;
  icon?: string;
};

export function ActionButton({
  label,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled = false,
  icon,
}: ActionButtonProps) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`ui-btn ${getButtonClass(variant)}`}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{label}</span>
    </button>
  );
}

type AvatarBadgeProps = {
  name: string;
  tone?: 'green' | 'orange' | 'slate';
};

export function AvatarBadge({ name, tone = 'green' }: AvatarBadgeProps) {
  const initials = String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'PG';

  return <span className={`ui-avatar ${tone}`}>{initials}</span>;
}

type StatusBadgeProps = {
  status: string;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = status
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  const tone =
    normalized.includes('NAO ENVIADO') || normalized.includes('NAO_ENVIADO')
      ? 'danger'
      : normalized.includes('SUCCESS') || normalized.includes('SENT') || normalized === 'ENVIADO'
        ? 'success'
        : normalized.includes('ERROR') || normalized.includes('FAILED')
          ? 'danger'
          : normalized.includes('PENDING') || normalized.includes('PROCESS')
            ? 'warning'
            : 'neutral';

  return <span className={`status-pill ${tone}`}>{status}</span>;
}

function getButtonClass(variant: ButtonVariant = 'primary'): string {
  if (variant === 'secondary') return 'secondary';
  if (variant === 'ghost') return 'ghost';
  if (variant === 'danger') return 'danger';
  return 'primary';
}
