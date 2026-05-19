import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMcpTools } from '@/hooks/useMcpTools';
import { useExecutionApi } from '@/hooks/useExecutionApi';
import { useTheme } from '@/hooks/useTheme';
import type { RegistryNode, AgentExecutionRow, ArtifactRow } from '@/types';

type Category = 'navigation' | 'resources' | 'executions' | 'actions';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  path?: string;
  action?: () => void;
  category: Category;
  keywords?: string[];
}

interface CommandPaletteProps {
  onClose: () => void;
}

const KIND_ICON: Record<string, string> = {
  workflow: '🔵',
  agent: '🟣',
  skill: '🟢',
  prompt: '🔵',
  tool: '🟠',
  template: '🔷',
  execution: '⚡',
  artifact: '📦',
};

const NAVIGATION_COMMANDS: CommandItem[] = [
  { id: 'nav-projects', label: 'Go to Projects', path: '/studio/projects', category: 'navigation' },
  { id: 'nav-overview', label: 'Go to Overview', path: '/studio/projects/app', category: 'navigation' },
  { id: 'nav-workflows', label: 'Go to Workflows', path: '/studio/projects/app/design/workflows', category: 'navigation' },
  { id: 'nav-agents', label: 'Go to Agents', path: '/studio/projects/app/design/agents', category: 'navigation' },
  { id: 'nav-skills', label: 'Go to Skills', path: '/studio/projects/app/design/skills', category: 'navigation' },
  { id: 'nav-prompts', label: 'Go to Prompts', path: '/studio/projects/app/design/prompts', category: 'navigation' },
  { id: 'nav-tools', label: 'Go to Tools', path: '/studio/projects/app/design/tools', category: 'navigation' },
  { id: 'nav-templates', label: 'Go to Templates', path: '/studio/projects/app/design/templates', category: 'navigation' },
  { id: 'nav-executions', label: 'Go to Agent Executions', path: '/studio/projects/app/observe/agent-executions', category: 'navigation' },
  { id: 'nav-artifacts', label: 'Go to Artifacts', path: '/studio/projects/app/observe/artifacts', category: 'navigation' },
  { id: 'nav-registry', label: 'Go to Registry', path: '/studio/projects/app/registry/resources', category: 'navigation' },
  { id: 'nav-insights', label: 'Go to Insights', path: '/studio/projects/app/observe/insights', category: 'navigation' },
  { id: 'nav-alerts', label: 'Go to Alerts', path: '/studio/projects/app/observe/alerts', category: 'navigation' },
  { id: 'nav-metrics', label: 'Go to Metrics', path: '/studio/projects/app/observe/metrics', category: 'navigation' },
  { id: 'nav-settings', label: 'Go to Settings', path: '/studio/projects/app/admin/settings', category: 'navigation' },
  { id: 'nav-workspaces', label: 'Go to Workspaces', path: '/studio/projects/app/admin/workspaces', category: 'navigation' },
];

const MAX_RECENT_ITEMS = 5;
const RECENT_STORAGE_KEY = 'command-palette-recent';

function getRecentItems(): CommandItem[] {
  try {
    const stored = sessionStorage.getItem(RECENT_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as CommandItem[];
    }
  } catch {
    // ignore
  }
  return [];
}

function addRecentItem(item: CommandItem): void {
  try {
    const recent = getRecentItems().filter((r) => r.id !== item.id);
    recent.unshift(item);
    sessionStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_ITEMS)));
  } catch {
    // ignore
  }
}

function resourceToPath(node: RegistryNode, projectId = 'app'): string {
  const id = encodeURIComponent(node.id);
  const type = node.type as string;
  if (type === 'workflow') return `/studio/projects/${projectId}/design/workflows/${id}/editor`;
  if (type === 'agent') return `/studio/projects/${projectId}/design/agents/${id}/editor`;
  if (type === 'skill') return `/studio/projects/${projectId}/design/skills/${id}/editor`;
  if (type === 'prompt') return `/studio/projects/${projectId}/design/prompts/${id}/editor`;
  if (type === 'tool') return `/studio/projects/${projectId}/design/tools/${id}/editor`;
  if (type === 'template') return `/studio/projects/${projectId}/design/templates/${id}/editor`;
  return `/studio/projects/${projectId}/registry/resources`;
}

function executionToPath(execution: AgentExecutionRow): string {
  return `/studio/projects/app/observe/agent-executions/${encodeURIComponent(execution.id)}`;
}

function artifactToPath(): string {
  return `/studio/projects/app/observe/artifacts`;
}

export function CommandPalette({ onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { listWorkflows, listAgents, listSkills, listPrompts, loading: resourcesLoading } = useMcpTools();
  const { listExecutions, listArtifacts, loading: apiLoading } = useExecutionApi();
  const { resolved, setTheme } = useTheme();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<Category>('navigation');
  const [resources, setResources] = useState<RegistryNode[]>([]);
  const [executions, setExecutions] = useState<AgentExecutionRow[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [recentItems, setRecentItems] = useState<CommandItem[]>([]);
  const fetchedRef = useRef(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setRecentItems(getRecentItems());

    (async () => {
      const [workflows, agents, skills, prompts, execList, artifactList] = await Promise.all([
        listWorkflows(),
        listAgents(),
        listSkills(),
        listPrompts(),
        listExecutions({ limit: 10 }),
        listArtifacts({ limit: 10 }),
      ]);
      setResources([...workflows, ...agents, ...skills, ...prompts]);
      setExecutions(execList);
      setArtifacts(artifactList);
    })();
  }, [listWorkflows, listAgents, listSkills, listPrompts, listExecutions, listArtifacts]);

  const actionCommands = useMemo<CommandItem[]>(() => [
    {
      id: 'action-create-workflow',
      label: 'Create Workflow',
      description: 'Open workflow editor',
      path: '/studio/projects/app/design/workflows/new/editor',
      category: 'actions',
      keywords: ['new', 'workflow'],
    },
    {
      id: 'action-create-agent',
      label: 'Create Agent',
      description: 'Open agent editor',
      path: '/studio/projects/app/design/agents/new/editor',
      category: 'actions',
      keywords: ['new', 'agent'],
    },
    {
      id: 'action-create-skill',
      label: 'Create Skill',
      description: 'Open skill editor',
      path: '/studio/projects/app/design/skills/new/editor',
      category: 'actions',
      keywords: ['new', 'skill'],
    },
    {
      id: 'action-create-prompt',
      label: 'Create Prompt',
      description: 'Open prompt editor',
      path: '/studio/projects/app/design/prompts/new/editor',
      category: 'actions',
      keywords: ['new', 'prompt'],
    },
    {
      id: 'action-refresh',
      label: 'Refresh Dashboard',
      description: 'Reload current page data',
      action: () => window.location.reload(),
      category: 'actions',
      keywords: ['reload', 'refresh'],
    },
    {
      id: 'action-toggle-theme',
      label: `Toggle Theme (currently ${resolved})`,
      description: `Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`,
      action: () => setTheme(resolved === 'dark' ? 'light' : 'dark'),
      category: 'actions',
      keywords: ['theme', 'dark', 'light', 'mode'],
    },
  ], [resolved, setTheme]);

  const resourceCommands = useMemo<CommandItem[]>(() =>
    resources.map((r) => ({
      id: `res-${r.id}`,
      label: r.name,
      description: r.namespace ?? r.type,
      path: resourceToPath(r),
      category: 'resources' as Category,
      keywords: [r.type, r.namespace ?? ''],
    })),
    [resources]
  );

  const executionCommands = useMemo<CommandItem[]>(() =>
    executions.map((e) => ({
      id: `exec-${e.id}`,
      label: `${e.workflowArn.split('/').pop() ?? e.id} (${e.status})`,
      description: `${e.agentArn.split('/').pop() ?? e.agentArn} • ${new Date(e.startedAt).toLocaleString()}`,
      path: executionToPath(e),
      category: 'executions' as Category,
      keywords: [e.status, e.agentArn, e.workflowArn],
    })),
    [executions]
  );

  const artifactCommands = useMemo<CommandItem[]>(() =>
    artifacts.map((a) => ({
      id: `artifact-${a.id}`,
      label: a.name,
      description: `${a.contentType} • ${formatBytes(a.sizeBytes)}`,
      path: artifactToPath(),
      category: 'resources' as Category,
      keywords: [a.contentType],
    })),
    [artifacts]
  );

  const allCommands = useMemo<CommandItem[]>(() => [
    ...NAVIGATION_COMMANDS,
    ...resourceCommands,
    ...executionCommands,
    ...artifactCommands,
    ...actionCommands,
  ], [resourceCommands, executionCommands, artifactCommands, actionCommands]);

  const filteredByCategory = useMemo(() => {
    const filtered = query
      ? allCommands.filter(
          (c) =>
            c.label.toLowerCase().includes(query.toLowerCase()) ||
            c.description?.toLowerCase().includes(query.toLowerCase()) ||
            c.keywords?.some((k) => k.toLowerCase().includes(query.toLowerCase()))
        )
      : query === '' && recentItems.length > 0
        ? recentItems
        : allCommands;

    return filtered;
  }, [allCommands, query, recentItems]);

  const groupedCommands = useMemo(() => {
    const groups: Record<Category, CommandItem[]> = {
      navigation: [],
      resources: [],
      executions: [],
      actions: [],
    };
    filteredByCategory.forEach((cmd) => {
      groups[cmd.category].push(cmd);
    });
    return groups;
  }, [filteredByCategory]);

  const flatFiltered = useMemo(() => {
    const result: CommandItem[] = [];
    const order: Category[] = ['navigation', 'resources', 'executions', 'actions'];
    order.forEach((cat) => {
      if (query || activeCategory === cat) {
        result.push(...groupedCommands[cat]);
      }
    });
    return result;
  }, [groupedCommands, query, activeCategory]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = useCallback(
    (item: CommandItem) => {
      if (item.path) {
        addRecentItem(item);
        navigate(item.path);
      } else if (item.action) {
        item.action();
      }
      onClose();
    },
    [navigate, onClose]
  );

  const categories: { key: Category; label: string }[] = [
    { key: 'navigation', label: 'Navigation' },
    { key: 'resources', label: 'Resources' },
    { key: 'executions', label: 'Executions' },
    { key: 'actions', label: 'Actions' },
  ];

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatFiltered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && flatFiltered[selectedIndex]) {
        e.preventDefault();
        handleSelect(flatFiltered[selectedIndex]);
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const currentIdx = categories.findIndex((c) => c.key === activeCategory);
        const nextIdx = e.shiftKey
          ? (currentIdx - 1 + categories.length) % categories.length
          : (currentIdx + 1) % categories.length;
        setActiveCategory(categories[nextIdx].key);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [flatFiltered, selectedIndex, handleSelect, onClose, activeCategory, categories]);

  useEffect(() => {
    const selectedEl = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    selectedEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const loading = resourcesLoading || apiLoading;

  const renderGroup = (category: Category, commands: CommandItem[]) => {
    if (commands.length === 0) return null;
    return (
      <div key={category} style={{ marginBottom: '8px' }}>
        <div
          style={{
            padding: '4px 16px',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--color-on-surface)',
            opacity: 0.5,
          }}
        >
          {categories.find((c) => c.key === category)?.label}
        </div>
        {commands.map((item) => {
          const itemIndex = flatFiltered.indexOf(item);
          const isSelected = itemIndex === selectedIndex;
          return (
            <button
              key={item.id}
              data-index={itemIndex}
              onClick={() => handleSelect(item)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 16px',
                textAlign: 'left',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 180ms ease',
                background: isSelected ? 'var(--color-primary-container)' : 'transparent',
                color: isSelected ? 'var(--color-on-primary-container)' : 'var(--color-on-surface)',
                fontSize: '14px',
                fontWeight: isSelected ? 600 : 400,
              }}
              onMouseEnter={() => setSelectedIndex(itemIndex)}
            >
              <span style={{ fontSize: '14px', opacity: 0.7 }}>
                {KIND_ICON[item.category] ?? KIND_ICON[item.keywords?.[0] ?? ''] ?? '📄'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
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
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '80px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--color-scrim)',
          animation: 'fadeIn 180ms ease',
        }}
      />

      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '580px',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-outline-variant)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--elevation-3)',
          overflow: 'hidden',
          animation: 'slideUp 180ms ease',
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
          <span style={{ opacity: 0.5, fontSize: '16px' }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workflows, agents, executions, pages..."
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
              padding: '2px 6px',
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

        <div
          style={{
            display: 'flex',
            gap: '4px',
            padding: '8px 12px',
            borderBottom: '1px solid var(--color-outline-variant)',
            overflowX: 'auto',
          }}
        >
          {categories.map((cat) => {
            const count = groupedCommands[cat.key].length;
            if (count === 0 && query) return null;
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  fontWeight: activeCategory === cat.key ? 600 : 400,
                  background: activeCategory === cat.key ? 'var(--color-primary-container)' : 'transparent',
                  color: activeCategory === cat.key ? 'var(--color-on-primary-container)' : 'var(--color-on-surface)',
                  border: '1px solid',
                  borderColor: activeCategory === cat.key ? 'var(--color-primary)' : 'var(--color-outline-variant)',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 180ms ease',
                }}
              >
                {cat.label}
                <span
                  style={{
                    marginLeft: '4px',
                    opacity: 0.6,
                    fontSize: '10px',
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 0',
          }}
        >
          {flatFiltered.length === 0 ? (
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
            <>
              {query === '' && recentItems.length > 0 && (
                <div style={{ marginBottom: '8px' }}>
                  <div
                    style={{
                      padding: '4px 16px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      color: 'var(--color-on-surface)',
                      opacity: 0.5,
                    }}
                  >
                    Recent
                  </div>
                  {recentItems.map((item) => {
                    const itemIndex = flatFiltered.indexOf(item);
                    const isSelected = itemIndex === selectedIndex;
                    return (
                      <button
                        key={`recent-${item.id}`}
                        data-index={itemIndex}
                        onClick={() => handleSelect(item)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '8px 16px',
                          textAlign: 'left',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'background 180ms ease',
                          background: isSelected ? 'var(--color-primary-container)' : 'transparent',
                          color: isSelected ? 'var(--color-on-primary-container)' : 'var(--color-on-surface)',
                          fontSize: '14px',
                          fontWeight: isSelected ? 600 : 400,
                        }}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                      >
                        <span style={{ fontSize: '14px', opacity: 0.7 }}>🕐</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '14px',
                              fontWeight: 500,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
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
                      </button>
                    );
                  })}
                </div>
              )}
              {renderGroup('navigation', groupedCommands.navigation)}
              {renderGroup('resources', groupedCommands.resources)}
              {renderGroup('executions', groupedCommands.executions)}
              {renderGroup('actions', groupedCommands.actions)}
            </>
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
          <span>⇥ category</span>
          <span>esc close</span>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
