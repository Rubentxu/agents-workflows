

interface NotificationBellProps {
  count?: number;
  hasCritical?: boolean;
  onClick?: () => void;
}

export function NotificationBell({ count = 0, hasCritical = false, onClick }: NotificationBellProps) {
  const showBadge = count > 0;
  const badgeClass = hasCritical ? 'notification-bell__badge notification-bell__badge--critical' : 'notification-bell__badge';
  const displayCount = count > 99 ? '99+' : String(count);

  return (
    <button
      className="notification-bell"
      onClick={onClick}
      type="button"
      aria-label={`${showBadge ? displayCount + ' notifications' : 'No notifications'}`}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="notification-bell__icon">
        <path
          d="M10 2C7.24 2 5 4.24 5 7V11L3.5 12.85C3.18 13.27 3.47 13.88 4 13.88H16C16.53 13.88 16.82 13.27 16.5 12.85L15 11V7C15 4.24 12.76 2 10 2Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M8 15.88C8 16.99 8.9 17.88 10 17.88C11.1 17.88 12 16.99 12 15.88"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      {showBadge && <span className={badgeClass}>{displayCount}</span>}
    </button>
  );
}

export type { NotificationBellProps };
