import { useState } from 'react';

interface ErrorStateProps {
  title: string;
  message: string;
  onRetry?: () => void;
  details?: string;
}

export function ErrorState({ title, message, onRetry, details }: ErrorStateProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="flex flex-col gap-3 p-4 rounded-xl"
      style={{
        background: 'var(--color-warning-container)',
        color: 'var(--color-on-warning-container)',
        border: '1px solid var(--color-warning)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: 'var(--color-warning)', color: 'var(--color-on-warning)' }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 1L14.5 13H1.5L8 1Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              fill="none"
            />
            <path d="M8 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="11" r="0.75" fill="currentColor" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-sm mt-0.5 opacity-90">{message}</p>
        </div>
      </div>

      {details && (
        <div>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs underline underline-offset-2 opacity-80 hover:opacity-100 transition-opacity"
          >
            {expanded ? 'Hide details' : 'View details'}
          </button>
          {expanded && (
            <pre
              className="mt-2 p-3 rounded-lg text-xs font-mono overflow-auto max-h-32"
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
              }}
            >
              {details}
            </pre>
          )}
        </div>
      )}

      {onRetry && (
        <button
          onClick={onRetry}
          className="self-start px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: 'var(--color-warning)',
            color: 'var(--color-on-warning)',
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
