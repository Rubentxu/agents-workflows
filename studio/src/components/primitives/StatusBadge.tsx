type BadgeStatus =
  | 'running'
  | 'success'
  | 'failed'
  | 'queued'
  | 'aborted'
  | 'paused'
  | 'cancelled'
  | 'unknown'
  | 'active'
  | 'inactive';

interface StatusBadgeProps {
  status: BadgeStatus;
  label?: string;
  size?: 'sm' | 'md';
}

const statusConfig: Record<
  BadgeStatus,
  { bg: string; color: string; icon: 'check' | 'x' | 'clock' | 'spinner' | 'dot' | 'pulse' | 'pause' }
> = {
  running: { bg: 'var(--color-primary-container)', color: 'var(--color-primary)', icon: 'spinner' },
  success: { bg: 'var(--color-success-container)', color: 'var(--color-success)', icon: 'check' },
  failed: { bg: 'var(--color-error-container)', color: 'var(--color-error)', icon: 'x' },
  queued: { bg: 'var(--color-warning-container)', color: 'var(--color-warning)', icon: 'clock' },
  aborted: { bg: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', icon: 'x' },
  paused: { bg: 'var(--color-tertiary-container)', color: 'var(--color-on-tertiary-container)', icon: 'pause' },
  cancelled: { bg: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', icon: 'x' },
  unknown: { bg: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', icon: 'dot' },
  active: { bg: 'var(--color-success-container)', color: 'var(--color-success)', icon: 'pulse' },
  inactive: { bg: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', icon: 'dot' },
};

const defaultLabels: Record<BadgeStatus, string> = {
  running: 'Running',
  success: 'Success',
  failed: 'Failed',
  queued: 'Queued',
  aborted: 'Aborted',
  paused: 'Paused',
  cancelled: 'Cancelled',
  unknown: 'Unknown',
  active: 'Active',
  inactive: 'Inactive',
};

function StatusIcon({ type, color }: { type: string; color: string }) {
  switch (type) {
    case 'check':
      return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6L5 8.5L9.5 3.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'x':
      return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 3L9 9M9 3L3 9" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'clock':
      return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke={color} strokeWidth="1.2" />
          <path d="M6 3.5V6L7.5 7" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'spinner':
      return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="status-badge__spinner">
          <circle cx="6" cy="6" r="4.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="14" strokeDashoffset="5" opacity="0.8" />
        </svg>
      );
    case 'pulse':
      return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="3" fill={color} className="status-badge__pulse-dot" />
        </svg>
      );
    case 'pause':
      return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="3" y="2.5" width="2" height="7" rx="0.5" fill={color} />
          <rect x="7" y="2.5" width="2" height="7" rx="0.5" fill={color} />
        </svg>
      );
    default:
      return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="3" fill={color} />
        </svg>
      );
  }
}

export function StatusBadge({ status, label, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status];
  const displayLabel = label ?? defaultLabels[status];
  const sizeClass = size === 'sm' ? 'status-badge--sm' : 'status-badge--md';

  return (
    <span
      className={`status-badge ${sizeClass}`}
      style={{ background: config.bg, color: config.color }}
      role="status"
      aria-label={displayLabel}
    >
      <StatusIcon type={config.icon} color={config.color} />
      <span className="status-badge__label">{displayLabel}</span>
    </span>
  );
}

export type { StatusBadgeProps, BadgeStatus };
