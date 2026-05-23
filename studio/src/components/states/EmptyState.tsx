import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  testId?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  testId = 'empty-state',
}: EmptyStateProps) {
  return (
    <div
      className="min-h-[180px] grid place-items-center text-center p-8"
      style={{ background: 'var(--color-surface)' }}
      data-testid={testId}
    >
      <div className="flex flex-col items-center gap-3 max-w-[440px]">
        {icon && (
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-secondary-container)', color: 'var(--color-on-secondary-container)' }}
          >
            {icon}
          </div>
        )}
        <h3
          className="text-base font-medium"
          style={{ color: 'var(--color-on-surface)' }}
        >
          {title}
        </h3>
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--color-secondary)' }}
        >
          {description}
        </p>
        {(action || secondaryAction) && (
          <div className="flex items-center gap-3 mt-2">
            {action && (
              <button
                onClick={action.onClick}
                data-testid={`${testId}-primary-action`}
                className="px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: 'var(--color-primary)',
                  color: 'var(--color-on-primary)',
                }}
              >
                {action.label}
              </button>
            )}
            {secondaryAction && (
              <button
                onClick={secondaryAction.onClick}
                data-testid={`${testId}-secondary-action`}
                className="px-5 py-2 rounded-lg text-sm font-medium transition-colors border"
                style={{
                  borderColor: 'var(--color-outline)',
                  color: 'var(--color-primary)',
                  background: 'transparent',
                }}
              >
                {secondaryAction.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
