import { useState } from 'react';

export interface StageExecution {
  id: string;
  stageId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  output?: unknown;
  error?: string;
}

interface ExecutionTimelineProps {
  stages: StageExecution[];
  currentStage?: string;
  onStageClick?: (stageId: string) => void;
}

const STATUS_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
  completed: {
    bg: 'var(--color-success-container)',
    border: 'var(--color-success)',
    dot: 'var(--color-success)',
  },
  failed: {
    bg: 'var(--color-error-container)',
    border: 'var(--color-error)',
    dot: 'var(--color-error)',
  },
  running: {
    bg: 'var(--color-info-container)',
    border: 'var(--color-info)',
    dot: 'var(--color-info)',
  },
  pending: {
    bg: 'var(--color-surface-container-high)',
    border: 'var(--color-outline)',
    dot: 'var(--color-warning)',
  },
  skipped: {
    bg: 'var(--color-surface-container)',
    border: 'var(--color-outline-variant)',
    dot: 'var(--color-secondary)',
  },
};

function formatDuration(ms?: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatRelativeTime(iso?: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ExecutionTimeline({ stages, currentStage, onStageClick }: ExecutionTimelineProps) {
  const [hoveredStage, setHoveredStage] = useState<string | null>(null);

  if (stages.length === 0) {
    return (
      <div
        className="flex items-center justify-center p-8"
        style={{ color: 'var(--color-secondary)' }}
      >
        No stages to display
      </div>
    );
  }

  return (
    <div className="execution-timeline" style={{ fontFamily: 'var(--font-family)' }}>
      {stages.map((stage, index) => {
        const colors = STATUS_COLORS[stage.status] ?? STATUS_COLORS.pending;
        const isHovered = hoveredStage === stage.id;
        const isCurrent = currentStage === stage.id;
        const isParallel = stages.some((s, i) => i !== index && s.startedAt === stage.startedAt);

        return (
          <div key={stage.id} className="timeline-item" style={{ position: 'relative' }}>
            <div
              className="timeline-connector"
              style={{
                position: 'absolute',
                left: '19px',
                top: '40px',
                bottom: index < stages.length - 1 ? '-8px' : 0,
                width: '2px',
                background: index < stages.length - 1
                  ? (stage.status === 'completed' ? colors.border : 'var(--color-outline-variant)')
                  : 'transparent',
              }}
            />

            <div
              className="timeline-row"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                cursor: onStageClick ? 'pointer' : 'default',
                background: isHovered || isCurrent
                  ? 'var(--color-surface-container-low)'
                  : 'transparent',
                transition: 'background var(--motion-fast) var(--motion-easing-standard)',
              }}
              onMouseEnter={() => setHoveredStage(stage.id)}
              onMouseLeave={() => setHoveredStage(null)}
              onClick={() => onStageClick?.(stage.id)}
            >
              <div
                className="timeline-dot-container"
                style={{
                  position: 'relative',
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <div
                  className={`timeline-dot ${stage.status === 'running' ? 'animate-pulse' : ''}`}
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: colors.dot,
                    border: `2px solid ${colors.border}`,
                    boxShadow: stage.status === 'running'
                      ? `0 0 0 4px ${colors.dot}20`
                      : 'none',
                    zIndex: 1,
                  }}
                />
                {isParallel && (
                  <div
                    className="parallel-indicator"
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      fontSize: '8px',
                      fontWeight: 600,
                      color: 'var(--color-primary)',
                      background: 'var(--color-primary-container)',
                      padding: '1px 3px',
                      borderRadius: '2px',
                    }}
                  >
                    PAR
                  </div>
                )}
              </div>

              <div
                className="timeline-content"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${isCurrent ? colors.border : 'var(--color-outline-variant)'}`,
                  background: colors.bg,
                  boxShadow: isCurrent ? `0 0 0 1px ${colors.border}` : 'none',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    marginBottom: stage.error ? '4px' : '0',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      className="stage-name"
                      style={{
                        fontWeight: 600,
                        fontSize: '14px',
                        color: 'var(--color-on-surface)',
                      }}
                    >
                      {stage.stageId}
                    </span>
                    <span
                      className="stage-status-badge"
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        textTransform: 'uppercase',
                        color: colors.dot,
                        background: `${colors.dot}15`,
                        border: `1px solid ${colors.dot}30`,
                      }}
                    >
                      {stage.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {stage.durationMs !== undefined && (
                      <span
                        className="stage-duration"
                        style={{
                          fontSize: '12px',
                          fontFamily: 'monospace',
                          color: 'var(--color-secondary)',
                        }}
                      >
                        {formatDuration(stage.durationMs)}
                      </span>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    fontSize: '11px',
                    color: 'var(--color-secondary)',
                  }}
                >
                  {stage.startedAt && (
                    <span className="stage-time">
                      {formatTime(stage.startedAt)}
                      <span style={{ margin: '0 4px', opacity: 0.5 }}>→</span>
                      {formatTime(stage.completedAt)}
                    </span>
                  )}
                  {stage.startedAt && (
                    <span style={{ opacity: 0.7 }}>
                      {formatRelativeTime(stage.startedAt)}
                    </span>
                  )}
                </div>

                {stage.error && (
                  <div
                    className="stage-error"
                    style={{
                      marginTop: '6px',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      background: 'var(--color-error-container)',
                      border: `1px solid var(--color-error)`,
                      fontSize: '12px',
                      color: 'var(--color-error)',
                      fontFamily: 'monospace',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Error:</span>{' '}
                    {stage.error.length > 150 ? `${stage.error.slice(0, 150)}...` : stage.error}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <style>{`
        .execution-timeline {
          padding: 16px;
        }
        .timeline-item:last-child .timeline-connector {
          display: none;
        }
        .timeline-dot.animate-pulse {
          animation: timeline-pulse 1.5s ease-in-out infinite;
        }
        @keyframes timeline-pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 var(--color-info);
          }
          50% {
            box-shadow: 0 0 0 6px transparent;
          }
        }
      `}</style>
    </div>
  );
}
