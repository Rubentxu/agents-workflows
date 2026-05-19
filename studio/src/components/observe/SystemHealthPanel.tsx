import { useEffect, useState } from 'react';

interface HealthIndicator {
  label: string;
  status: 'healthy' | 'degraded' | 'failing' | 'idle' | 'unknown';
  value?: string | number;
  detail?: string;
}

interface SystemHealthPanelProps {
  className?: string;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  healthy: {
    color: 'var(--color-success)',
    bg: 'var(--color-success-container)',
    label: 'Healthy',
  },
  degraded: {
    color: 'var(--color-warning)',
    bg: 'var(--color-warning-container)',
    label: 'Degraded',
  },
  failing: {
    color: 'var(--color-error)',
    bg: 'var(--color-error-container)',
    label: 'Failing',
  },
  idle: {
    color: 'var(--color-secondary)',
    bg: 'var(--color-surface-container-high)',
    label: 'Idle',
  },
  unknown: {
    color: 'var(--color-outline)',
    bg: 'var(--color-surface-container)',
    label: 'Unknown',
  },
};

function HealthDot({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  return (
    <span
      style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: config.color,
        boxShadow: status === 'healthy' ? `0 0 4px ${config.color}` : 'none',
      }}
    />
  );
}

function HealthBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 600,
        color: config.color,
        background: config.bg,
        textTransform: 'uppercase',
      }}
    >
      <HealthDot status={status} />
      {config.label}
    </span>
  );
}

interface StorageInfo {
  usedBytes: number;
  totalBytes: number;
  artifactCount: number;
}

interface ConnectionInfo {
  mcpConnections: number;
  sseConnections: number;
  activeWebsockets: number;
}

export function SystemHealthPanel({ className }: SystemHealthPanelProps) {
  const [health, setHealth] = useState<{
    mcp: 'healthy' | 'degraded' | 'failing' | 'unknown';
    sse: 'healthy' | 'degraded' | 'failing' | 'unknown';
    registry: 'healthy' | 'degraded' | 'failing' | 'unknown';
  }>({
    mcp: 'unknown',
    sse: 'unknown',
    registry: 'unknown',
  });
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [connections, setConnections] = useState<ConnectionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/health');
        if (response.ok) {
          const data = await response.json();
          setHealth({
            mcp: data.mcp?.status ?? 'unknown',
            sse: data.sse?.status ?? 'unknown',
            registry: data.registry?.status ?? 'unknown',
          });
          setStorage(data.storage ?? null);
          setConnections(data.connections ?? null);
        } else {
          setHealth({ mcp: 'failing', sse: 'failing', registry: 'failing' });
        }
      } catch {
        setHealth({ mcp: 'failing', sse: 'failing', registry: 'failing' });
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const getOverallHealth = (): 'healthy' | 'degraded' | 'failing' => {
    const statuses = [health.mcp, health.sse, health.registry];
    if (statuses.includes('failing')) return 'failing';
    if (statuses.includes('degraded')) return 'degraded';
    if (statuses.every((s) => s === 'healthy')) return 'healthy';
    return 'degraded';
  };

  const indicators: HealthIndicator[] = [
    {
      label: 'MCP Server',
      status: health.mcp,
      detail: 'Model Context Protocol connections',
    },
    {
      label: 'SSE Stream',
      status: health.sse,
      detail: 'Server-sent events for real-time updates',
    },
    {
      label: 'Registry',
      status: health.registry,
      detail: 'SQLite registry database health',
    },
  ];

  return (
    <div
      className={className}
      style={{
        padding: '16px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-outline-variant)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <h3
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--color-on-surface)',
            margin: 0,
          }}
        >
          System Health
        </h3>
        <HealthBadge status={loading ? 'idle' : getOverallHealth()} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {indicators.map((indicator) => {
          const config = STATUS_CONFIG[indicator.status] ?? STATUS_CONFIG.unknown;
          return (
            <div
              key={indicator.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-surface-container-low)',
                border: `1px solid ${config.color}20`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HealthDot status={indicator.status} />
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-on-surface)' }}>
                  {indicator.label}
                </span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--color-secondary)' }}>
                {indicator.detail}
              </span>
            </div>
          );
        })}
      </div>

      {(storage || connections) && (
        <>
          <div
            style={{
              height: '1px',
              background: 'var(--color-outline-variant)',
              margin: '16px 0',
            }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {storage && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-surface-container-low)',
                }}
              >
                <div style={{ fontSize: '11px', color: 'var(--color-secondary)', marginBottom: '4px' }}>
                  Storage
                </div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-on-surface)' }}>
                  {formatBytes(storage.usedBytes)}
                </div>
                {storage.totalBytes > 0 && (
                  <div
                    style={{
                      marginTop: '8px',
                      height: '4px',
                      borderRadius: '2px',
                      background: 'var(--color-surface-container-high)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, (storage.usedBytes / storage.totalBytes) * 100)}%`,
                        background: storage.usedBytes / storage.totalBytes > 0.9
                          ? 'var(--color-error)'
                          : storage.usedBytes / storage.totalBytes > 0.7
                            ? 'var(--color-warning)'
                            : 'var(--color-success)',
                        borderRadius: '2px',
                        transition: 'width var(--motion-normal)',
                      }}
                    />
                  </div>
                )}
                <div style={{ fontSize: '10px', color: 'var(--color-secondary)', marginTop: '4px' }}>
                  {storage.artifactCount} artifacts
                </div>
              </div>
            )}

            {connections && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-surface-container-low)',
                }}
              >
                <div style={{ fontSize: '11px', color: 'var(--color-secondary)', marginBottom: '4px' }}>
                  Active Connections
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--color-secondary)' }}>MCP</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-on-surface)' }}>
                      {connections.mcpConnections}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--color-secondary)' }}>SSE</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-on-surface)' }}>
                      {connections.sseConnections}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--color-secondary)' }}>WebSocket</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-on-surface)' }}>
                      {connections.activeWebsockets}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {loading && (
        <div
          style={{
            marginTop: '12px',
            fontSize: '11px',
            color: 'var(--color-secondary)',
            textAlign: 'center',
          }}
        >
          Checking health...
        </div>
      )}
    </div>
  );
}
