/**
 * ToolMapEditor — Editor for Record<string, boolean> representing tool name → enabled.
 * Displays known tools as toggleable rows, allows adding custom tools, and groups by category.
 */

import { useState } from 'react';

export interface ToolMapEditorProps {
  /** Current tool map (tool name → enabled) */
  tools: Record<string, boolean>;
  /** Called whenever the tool map changes */
  onChange: (tools: Record<string, boolean>) => void;
  /** When true, controls are hidden and only the current state is shown */
  readOnly?: boolean;
}

/** Known tool catalog grouped by category/source */
const TOOL_CATALOG: Record<string, { name: string; description?: string; category: string }[]> = {
  'Filesystem': [
    { name: 'read_file', description: 'Read file contents', category: 'Filesystem' },
    { name: 'write_file', description: 'Write or create files', category: 'Filesystem' },
    { name: 'edit_file', description: 'Make targeted edits to files', category: 'Filesystem' },
    { name: 'list_directory', description: 'List directory contents', category: 'Filesystem' },
    { name: 'glob', description: 'Find files by glob pattern', category: 'Filesystem' },
    { name: 'grep', description: 'Search file contents', category: 'Filesystem' },
  ],
  'Git': [
    { name: 'git_status', description: 'Show working tree status', category: 'Git' },
    { name: 'git_log', description: 'Show commit history', category: 'Git' },
    { name: 'git_diff', description: 'Show changes between commits', category: 'Git' },
    { name: 'git_branch', description: 'List branches', category: 'Git' },
  ],
  'Terminal': [
    { name: 'bash', description: 'Execute shell commands', category: 'Terminal' },
    { name: 'npm_run', description: 'Run npm scripts', category: 'Terminal' },
    { name: 'cargo_run', description: 'Run Cargo commands', category: 'Terminal' },
  ],
  'Web': [
    { name: 'web_fetch', description: 'Fetch URL content', category: 'Web' },
    { name: 'perplexity_ask', description: 'Web-grounded Q&A', category: 'Web' },
  ],
  'Code Intelligence': [
    { name: 'cognicode_semantic_search', description: 'Semantic symbol search', category: 'Code Intelligence' },
    { name: 'cognicode_build_graph', description: 'Build call graph', category: 'Code Intelligence' },
    { name: 'cognicode_get_call_hierarchy', description: 'Get callers/callees', category: 'Code Intelligence' },
    { name: 'cognicode_analyze_impact', description: 'Analyze change impact', category: 'Code Intelligence' },
  ],
};

/** Toggle a single tool's enabled state */
function toggleTool(
  tools: Record<string, boolean>,
  onChange: (tools: Record<string, boolean>) => void,
  toolName: string
) {
  onChange({ ...tools, [toolName]: !tools[toolName] });
}

/** Add a custom tool by name */
function addCustomTool(
  tools: Record<string, boolean>,
  onChange: (tools: Record<string, boolean>) => void,
  customName: string
) {
  if (customName && !tools[customName]) {
    onChange({ ...tools, [customName]: true });
  }
}

export function ToolMapEditor({ tools, onChange, readOnly = false }: ToolMapEditorProps) {
  const [customInput, setCustomInput] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(Object.keys(TOOL_CATALOG)));

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const handleAddCustom = () => {
    addCustomTool(tools, onChange, customInput.trim());
    setCustomInput('');
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Tool categories */}
      {Object.entries(TOOL_CATALOG).map(([category, toolList]) => {
        const isExpanded = expandedCategories.has(category);
        const enabledCount = toolList.filter((t) => tools[t.name]).length;
        const totalCount = toolList.length;

        return (
          <div key={category} className="border border-outline-variant rounded-lg overflow-hidden">
            {/* Category header */}
            <button
              type="button"
              onClick={() => toggleCategory(category)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-surface-container/50 hover:bg-surface-container transition-colors text-left"
              disabled={readOnly}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-on-surface">{category}</span>
                <span className="text-xs text-secondary">
                  {enabledCount}/{totalCount}
                </span>
              </div>
              <span className="text-secondary text-sm">{isExpanded ? '▴' : '▾'}</span>
            </button>

            {/* Tool rows */}
            {isExpanded && (
              <ul className="divide-y divide-outline-variant">
                {toolList.map((tool) => {
                  const enabled = !!tools[tool.name];
                  return (
                    <li key={tool.name} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm text-on-surface">{tool.name}</span>
                        {tool.description && (
                          <span className="text-xs text-secondary">{tool.description}</span>
                        )}
                      </div>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => toggleTool(tools, onChange, tool.name)}
                          className={[
                            'relative w-10 h-5 rounded-full transition-colors shrink-0',
                            enabled ? 'bg-primary' : 'bg-surface-container-high',
                          ].join(' ')}
                          aria-pressed={enabled}
                          aria-label={`${enabled ? 'Disable' : 'Enable'} ${tool.name}`}
                        >
                          <span
                            className={[
                              'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                              enabled ? 'translate-x-5' : 'translate-x-0.5',
                            ].join(' ')}
                          />
                        </button>
                      )}
                      {readOnly && (
                        <span className={`text-xs ${enabled ? 'text-primary' : 'text-secondary'}`}>
                          {enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

      {/* Custom tools section */}
      {Object.keys(tools)
        .filter((name) => !Object.values(TOOL_CATALOG).flat().some((t) => t.name === name))
        .map((name) => (
          <div key={name} className="flex items-center justify-between px-4 py-2.5 border border-outline-variant rounded-lg">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-on-surface">{name}</span>
              <span className="text-xs text-secondary">Custom tool</span>
            </div>
            <div className="flex items-center gap-2">
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => toggleTool(tools, onChange, name)}
                  className={[
                    'relative w-10 h-5 rounded-full transition-colors',
                    tools[name] ? 'bg-primary' : 'bg-surface-container-high',
                  ].join(' ')}
                  aria-pressed={tools[name]}
                >
                  <span
                    className={[
                      'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                      tools[name] ? 'translate-x-5' : 'translate-x-0.5',
                    ].join(' ')}
                  />
                </button>
              )}
            </div>
          </div>
        ))}

      {/* Add custom tool input */}
      {!readOnly && (
        <div className="flex gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustom(); } }}
            placeholder="Add custom tool name…"
            className="flex-1 text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={handleAddCustom}
            disabled={!customInput.trim()}
            className="px-4 py-2 text-sm bg-primary text-on-primary rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
