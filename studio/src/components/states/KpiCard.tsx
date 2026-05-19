import type { ReactNode } from 'react';

type KpiStatus = 'default' | 'success' | 'warning' | 'error' | 'info';

interface KpiCardProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  trend?: string;
  status?: KpiStatus;
  loading?: boolean;
}

const statusColors: Record<KpiStatus, { bg: string; text: string }> = {
  default: { bg: 'var(--color-secondary-container)', text: 'var(--color-on-secondary-container)' },
  success: { bg: 'var(--color-success-container)', text: 'var(--color-on-success-container)' },
  warning: { bg: 'var(--color-warning-container)', text: 'var(--color-on-warning-container)' },
  error: { bg: 'var(--color-error-container)', text: 'var(--color-on-error-container)' },
  info: { bg: 'var(--color-info-container)', text: 'var(--color-on-info-container)' },
};

const trendColors: Record<KpiStatus, string> = {
  default: 'var(--color-on-surface-variant)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  info: 'var(--color-info)',
};

export function KpiCard({ icon, value, label, trend, status = 'default', loading }: KpiCardProps) {
  const colors = statusColors[status];
  const trendColor = trendColors[status];

  if (loading) {
    return (
      <div
        className="min-h-[96px] p-4 rounded-xl"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-outline-variant)',
          boxShadow: 'var(--elevation-1)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg animate-pulse"
            style={{ background: 'var(--color-outline-variant)' }}
          />
          <div className="flex-1 space-y-2">
            <div
              className="h-7 w-16 rounded animate-pulse"
              style={{ background: 'var(--color-outline-variant)' }}
            />
            <div
              className="h-3 w-20 rounded animate-pulse"
              style={{ background: 'var(--color-outline-variant)' }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[96px] p-4 rounded-xl flex items-center gap-3"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-outline-variant)',
        boxShadow: 'var(--elevation-1)',
      }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: colors.bg, color: colors.text }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className="text-[28px] font-semibold leading-tight"
            style={{ color: 'var(--color-on-surface)' }}
          >
            {value}
          </span>
          {trend && (
            <span
              className="text-xs font-medium"
              style={{ color: trendColor }}
            >
              {trend}
            </span>
          )}
        </div>
        <span
          className="text-xs"
          style={{ color: 'var(--color-on-surface-variant)' }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
