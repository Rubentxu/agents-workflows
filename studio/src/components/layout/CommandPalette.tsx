import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMcpTools } from '@/hooks/useMcpTools';
import type { RegistryNode } from '@/types';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  path?: string;
  action?: () => void;
  category: 'navigation' | 'action' | 'workflow' | 'agent' | 'skill' | 'prompt';
}

interface CommandPaletteProps {
  onClose: () => void;
}

const NAV_COMMANDS: CommandItem[] = [
  { id: 'nav-projects', label: 'Go to Projects', path: '/studio/projects', category: 'navigation' },
  { id: 'nav-overview', label: 'Go to Overview', path: '/studio/projects/app', category: 'navigation' },
  { id: 'nav-workflows', label: 'Go to Workflows', path: '/studio/projects/app/design/workflows', category: 'navigation' },
  { id: 'nav-agents', label: 'Go to Agents', path: '/studio/projects/app/design/agents', category: 'navigation' },
  { id: 'nav-executions', label: 'Go to Agent Executions', path: '/studio/projects/app/observe/agent-executions', category: 'navigation' },
  { id: 'nav-registry', label: 'Go to Registry', path: '/studio/projects/app/registry/resources', category: 'navigation' },
  { id: 'nav-alerts', label: 'Go to Alerts', path: '/studio/projects/app/observe/alerts', category: 'navigation' },
  { id: 'nav-insights', label: 'Go to Insights', path: '/studio/projects/app/observe/insights', category: 'navigation' },
  { id: 'action-create', label: 'Create resource', description: 'Open the Resource Composer', category: 'action' },
];

const KIND_ICON: Record<string, string> = {
  workflow: '🔵', agent: '🟣', skill: '🟢', prompt: '🔵', tool: '🟠', template: '🔷',
};

const itemStyle = (selected: boolean): React.CSSProperties => ({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '8px 16px',
  textAlign: 'left',
  border: 'none',
  cursor: 'pointer',
  transition: `background var(--motion-fast)`,
  background: selected ? 'var(--color-primary-container)' : 'transparent',
  color: selected ? 'var(--color-on-primary-container)' : 'var(--color-on-surface)',
  fontSize: '14px',
  fontWeight: selected ? 600 : 400,
});

const categoryBadgeStyle: React.CSSProperties = {
  fontSize: '10px',
  padding: '1px 6px',
  borderRadius: '4px',
  border: '1px solid var(--color-outline-variant)',
  background: 'var(--color-surface-container)',
  color: 'var(--color-on-surface)',
  textTransform: 'capitalize',
  lineHeight: 1.4,
};

export function CommandPalette({ onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { listWorkflows, listAgents, listSkills, listPrompts, loading } = useMcpTools();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [resources, setResources] = useState<RegistryNode[]>([]);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    (async () => {
      const [workflows, agents, skills, prompts] = await Promise.all([
        listWorkflows(),
        listAgents(),
        listSkills(),
        listPrompts(),
      ]);
      setResources([...workflows, ...agents, ...skills, ...prompts]);
    })();
  }, [listWorkflows, listAgents, listSkills, listPrompts]);

  const allCommands: CommandItem[] = [
    ...NAV_COMMANDS,
    ...resources.map((r) => ({
      id: `res-${r.id}`,
      label: r.name,
      description: r.namespace,
      path: resourceToPath(r),
      category: r.type as CommandItem['category'],
    })),
  ];

  const filtered = query
    ? allCommands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.description?.toLowerCase().includes(query.toLowerCase())
      )
    : allCommands;

  const handleSelect = useCallback(
    (item: CommandItem) => {
      if (item.path) {
        navigate(item.path);
      } else if (item.action) {
        item.action();
      }
      onClose();
    },
    [navigate, onClose]
  );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        handleSelect(filtered[selectedIndex]);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [filtered, selectedIndex, handleSelect, onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '96px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--color-scrim)',
        }}
      />

      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '512px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-outline-variant)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--elevation-3)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-outline-variant)',
          }}
        >
          <span style={{ opacity: 0.5 }}>🔍</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search projects, workflows, executions..."
            style={{
              flex: 1,
              fontSize: '14px',
              background: 'transparent',
              color: 'var(--color-on-surface)',
              border: 'none',
              outline: 'none',
            }}
          />
          {loading && (
            <span style={{ fontSize: '12px', color: 'var(--color-on-surface)', opacity: 0.5 }}>
              Loading...
            </span>
          )}
          <kbd
            style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '4px',
              background: 'var(--color-surface-container-high)',
              border: '1px solid var(--color-outline-variant)',
              fontFamily: 'inherit',
              color: 'var(--color-on-surface)',
              opacity: 0.6,
            }}
          >
            ESC
          </kbd>
        </div>

        <div style={{ maxHeight: '320px', overflowY: 'auto', padding: '8px 0' }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                fontSize: '14px',
                color: 'var(--color-on-surface)',
                opacity: 0.5,
              }}
            >
              {query ? `No results for "${query}"` : 'Start typing to search...'}
            </div>
          ) : (
            filtered.map((item, index) => (
              <button
                key={item.id}
                onClick={() => handleSelect(item)}
                style={itemStyle(index === selectedIndex)}
              >
                <span style={{ fontSize: '14px' }}>{KIND_ICON[item.category] ?? '📄'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </div>
                  {item.description && (
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--color-on-surface)',
                        opacity: 0.55,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.description}
                    </div>
                  )}
                </div>
                {item.path && <span style={categoryBadgeStyle}>{item.category}</span>}
              </button>
            ))
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '8px 16px',
            borderTop: '1px solid var(--color-outline-variant)',
            fontSize: '12px',
            color: 'var(--color-on-surface)',
            opacity: 0.45,
          }}
        >
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}

function resourceToPath(node: RegistryNode): string {
  const projectId = 'app';
  switch (node.type) {
    case 'workflow': return `/studio/projects/${projectId}/design/workflows/${encodeURIComponent(node.id)}/editor`;
    case 'agent': return `/studio/projects/${projectId}/design/agents/${encodeURIComponent(node.id)}/editor`;
    case 'skill': return `/studio/projects/${projectId}/design/skills/${encodeURIComponent(node.id)}/editor`;
    case 'prompt': return `/studio/projects/${projectId}/design/prompts/${encodeURIComponent(node.id)}/editor`;
    default: return `/studio/projects/${projectId}/registry/resources`;
  }
}
