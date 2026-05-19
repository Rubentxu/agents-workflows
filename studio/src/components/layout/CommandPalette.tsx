/**
 * CommandPalette — global search and quick actions modal.
 * Trigger: Ctrl+K / Cmd+K
 *
 * Populates:
 * - Static navigation actions
 * - Registry resources (workflows, agents, skills, prompts) fetched on open
 * - Recent items from localStorage
 */

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

export function CommandPalette({ onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { listWorkflows, listAgents, listSkills, listPrompts, loading } = useMcpTools();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [resources, setResources] = useState<RegistryNode[]>([]);
  const fetched = useRef(false);

  // Fetch all registry resources on mount
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

  // Keyboard navigation
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

  const categoryColor = (cat: CommandItem['category']) => {
    switch (cat) {
      case 'navigation': return 'border-blue-400 text-blue-400';
      case 'action': return 'border-accent text-accent';
      case 'workflow': return 'border-blue-400/50 text-blue-400/80';
      case 'agent': return 'border-purple-400/50 text-purple-400/80';
      case 'skill': return 'border-green-400/50 text-green-400/80';
      case 'prompt': return 'border-cyan-400/50 text-cyan-400/80';
      default: return 'border-text-muted/50 text-text-muted/80';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg bg-bg-surface border border-border-default rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle">
          <span className="text-text-muted">🔍</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search projects, workflows, executions..."
            className="flex-1 text-sm bg-transparent text-text-primary placeholder-text-muted outline-none"
          />
          {loading && <span className="text-xs text-text-muted animate-pulse">Loading...</span>}
          <kbd className="text-[10px] text-text-muted bg-bg-elevated border border-border-subtle rounded px-1">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-muted">
              {query ? `No results for "${query}"` : 'Start typing to search...'}
            </div>
          ) : (
            filtered.map((item, index) => (
              <button
                key={item.id}
                onClick={() => handleSelect(item)}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                  index === selectedIndex ? 'bg-accent/10 text-accent' : 'text-text-primary hover:bg-bg-elevated'
                }`}
              >
                <span className="text-sm">{KIND_ICON[item.category] ?? '📄'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.label}</div>
                  {item.description && (
                    <div className="text-xs text-text-muted truncate">{item.description}</div>
                  )}
                </div>
                {item.path && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${categoryColor(item.category)}`}>
                    {item.category}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border-subtle text-xs text-text-muted">
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
