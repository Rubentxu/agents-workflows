import { useEffect, useRef, useState, useCallback } from 'react';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  stage?: string;
}

interface LogViewerProps {
  executionId: string;
  logs?: LogEntry[];
  loading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

const LEVEL_COLORS: Record<string, { text: string; bg: string; badge: string }> = {
  info: {
    text: 'var(--color-info)',
    bg: 'var(--color-info-container)',
    badge: 'var(--color-info)',
  },
  warn: {
    text: 'var(--color-warning)',
    bg: 'var(--color-warning-container)',
    badge: 'var(--color-warning)',
  },
  error: {
    text: 'var(--color-error)',
    bg: 'var(--color-error-container)',
    badge: 'var(--color-error)',
  },
  debug: {
    text: 'var(--color-secondary)',
    bg: 'var(--color-surface-container-high)',
    badge: 'var(--color-secondary)',
  },
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const base = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${base}.${ms}`;
}

export function LogViewer({ executionId: _executionId, logs = [], loading, onLoadMore, hasMore }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set(['info', 'warn', 'error', 'debug']));
  const [stageFilter, setStageFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const stages = [...new Set(logs.map((l) => l.stage).filter(Boolean))];

  const filteredLogs = logs.filter((log) => {
    if (!levelFilter.has(log.level)) return false;
    if (stageFilter && log.stage !== stageFilter) return false;
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current || !onLoadMore || !hasMore || loading) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      onLoadMore();
    }
  }, [onLoadMore, hasMore, loading]);

  const copyLogs = useCallback(() => {
    const text = filteredLogs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}]${l.stage ? `[${l.stage}]` : ''} ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [filteredLogs]);

  const toggleLevel = (level: string) => {
    setLevelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        if (next.size > 1) next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  return (
    <div className="log-viewer" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        className="log-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '8px 12px',
          borderBottom: '1px solid var(--color-outline-variant)',
          background: 'var(--color-surface-container-low)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {(['debug', 'info', 'warn', 'error'] as const).map((level) => {
            const colors = LEVEL_COLORS[level];
            const isActive = levelFilter.has(level);
            return (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: `1px solid ${isActive ? colors.badge : 'var(--color-outline)'}`,
                  background: isActive ? colors.bg : 'transparent',
                  color: isActive ? colors.text : 'var(--color-secondary)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all var(--motion-fast)',
                }}
              >
                {level}
              </button>
            );
          })}
        </div>

        {stages.length > 0 && (
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid var(--color-outline)',
              background: 'var(--color-surface)',
              color: 'var(--color-on-surface)',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <option value="">All stages</option>
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}

        <div style={{ flex: 1, minWidth: '150px' }}>
          <input
            type="text"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid var(--color-outline)',
              background: 'var(--color-surface)',
              color: 'var(--color-on-surface)',
              fontSize: '12px',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--color-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Auto-scroll
          </label>

          <button
            onClick={copyLogs}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid var(--color-outline)',
              background: copied ? 'var(--color-success-container)' : 'var(--color-surface)',
              color: copied ? 'var(--color-success)' : 'var(--color-on-surface)',
              fontSize: '11px',
              cursor: 'pointer',
              transition: 'all var(--motion-fast)',
            }}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>

          <span style={{ fontSize: '11px', color: 'var(--color-secondary)' }}>
            {filteredLogs.length} entries
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="log-content"
        style={{
          flex: 1,
          overflow: 'auto',
          background: 'var(--color-surface-container-lowest)',
          fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace',
          fontSize: '12px',
          lineHeight: 1.6,
        }}
      >
        {loading && logs.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-secondary)' }}>
            Loading logs...
          </div>
        )}

        {!loading && filteredLogs.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-secondary)' }}>
            {logs.length === 0 ? 'No logs available' : 'No logs match current filters'}
          </div>
        )}

        {filteredLogs.map((log, index) => {
          const colors = LEVEL_COLORS[log.level];
          const showTimestamp = index === 0 || (
            new Date(log.timestamp).getTime() - new Date(filteredLogs[index - 1].timestamp).getTime()
          ) > 60000;

          return (
            <div
              key={`${log.timestamp}-${index}`}
              className="log-entry"
              style={{
                display: 'flex',
                gap: '12px',
                padding: '4px 12px',
                borderBottom: '1px solid var(--color-outline-variant)',
                background: index % 2 === 0 ? 'transparent' : 'var(--color-surface-container-low)',
              }}
            >
              <span
                className="log-timestamp"
                style={{
                  color: 'var(--color-secondary)',
                  flexShrink: 0,
                  minWidth: '80px',
                }}
              >
                {showTimestamp ? formatTimestamp(log.timestamp) : formatRelativeTime(log.timestamp)}
              </span>

              <span
                className="log-level"
                style={{
                  color: colors.text,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  flexShrink: 0,
                  minWidth: '48px',
                  padding: '0 4px',
                  borderRadius: '2px',
                  background: colors.bg,
                  textAlign: 'center',
                  fontSize: '10px',
                }}
              >
                {log.level}
              </span>

              {log.stage && (
                <span
                  className="log-stage"
                  style={{
                    color: 'var(--color-primary)',
                    flexShrink: 0,
                    minWidth: '80px',
                    fontSize: '11px',
                  }}
                >
                  [{log.stage}]
                </span>
              )}

              <span
                className="log-message"
                style={{
                  color: log.level === 'error' ? 'var(--color-error)' : 'var(--color-on-surface)',
                  wordBreak: 'break-word',
                  flex: 1,
                }}
              >
                {log.message}
              </span>
            </div>
          );
        })}

        {loading && logs.length > 0 && (
          <div style={{ padding: '12px', textAlign: 'center', color: 'var(--color-secondary)', fontSize: '11px' }}>
            Loading more...
          </div>
        )}

        {hasMore && !loading && (
          <div
            onClick={onLoadMore}
            style={{
              padding: '12px',
              textAlign: 'center',
              color: 'var(--color-primary)',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Load more
          </div>
        )}
      </div>

      <style>{`
        .log-viewer {
          --log-info: var(--color-info);
          --log-warn: var(--color-warning);
          --log-error: var(--color-error);
          --log-debug: var(--color-secondary);
        }
        .log-content::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .log-content::-webkit-scrollbar-track {
          background: var(--color-scrollbar-track);
        }
        .log-content::-webkit-scrollbar-thumb {
          background: var(--color-scrollbar-thumb);
          border-radius: 4px;
        }
        .log-content::-webkit-scrollbar-thumb:hover {
          background: var(--color-scrollbar-thumb-hover);
        }
      `}</style>
    </div>
  );
}
