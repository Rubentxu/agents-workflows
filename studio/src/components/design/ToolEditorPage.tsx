/**
 * ToolEditorPage — /studio/projects/:projectId/design/tools/:toolId/editor
 * Full-page tool editor with the unified Tool data model (ADR-0014).
 * Manages: configuration, schema, source, and YAML preview.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import yaml from 'js-yaml';
import { restApiUrl } from '@/lib/apiBase';
import { useContent } from '@/hooks/useContent';
import { EditorLayout, FormField, TagInput } from './shared';
import { ResourceYamlEditor } from '@/components/monaco';

// ============================================================================
// Tab definitions
// ============================================================================

type TabId = 'config' | 'schema' | 'source' | 'yaml';

const TABS: { key: string; label: string }[] = [
  { key: 'yaml', label: 'YAML Preview' },
  { key: 'config', label: 'Configuration' },
  { key: 'schema', label: 'Schema' },
  { key: 'source', label: 'Source' },
];

// ============================================================================
// Tool data model
// ============================================================================

type SourceType = 'mcp' | 'builtin' | 'custom';
type ToolCategory = 'core' | 'search' | 'debugging' | 'quality' | 'code-intelligence' | 'testing' | 'memory' | 'web' | 'mcp' | 'custom';
type Runtime = 'bash' | 'node' | 'python';

interface ToolData {
  id: string;
  name: string;
  namespace: string;
  scope: string;
  config: string;
}

// ============================================================================
// YAML spec extraction utility
// ============================================================================

function extractYamlSpec(config: string): Record<string, unknown> {
  const spec: Record<string, unknown> = {};
  const lines = config.split('\n');

  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = rawValue.trim();

    let parsedValue: unknown = value;
    if (value === '' || value === '~' || value === 'null') {
      parsedValue = null;
    } else if (value === 'true') {
      parsedValue = true;
    } else if (value === 'false') {
      parsedValue = false;
    } else if (!isNaN(Number(value)) && value !== '') {
      parsedValue = Number(value);
    } else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      parsedValue = value.slice(1, -1);
    }

    const parts = key.split('.');
    if (parts.length === 2 && parts[0] === 'spec') {
      spec[parts[1]] = parsedValue;
    } else if (parts.length === 1) {
      spec[key] = parsedValue;
    }
  }

  return spec;
}

// ============================================================================
// Main component
// ============================================================================

export function ToolEditorPage() {
  const { projectId, toolId } = useParams();
  const navigate = useNavigate();
  const { updateContent } = useContent();

  const isNew = !toolId || toolId === 'new';
  const scope = 'global';
  const arn = isNew
    ? `arn:local:${scope}:tool/new`
    : `arn:local:${scope}:tool/${toolId}`;

  const [activeTab, setActiveTab] = useState<TabId>('yaml');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tool spec state
  const [name, setName] = useState('New Tool');
  const [description, setDescription] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('mcp');
  const [source, setSource] = useState('');
  const [category, setCategory] = useState<ToolCategory>('core');
  const [tags, setTags] = useState<string[]>([]);
  const [inputSchemaJson, setInputSchemaJson] = useState('{\n  "type": "object",\n  "properties": {}\n}');
  const [outputSchemaJson, setOutputSchemaJson] = useState('');
  const [inputSchemaError, setInputSchemaError] = useState<string | null>(null);
  const [outputSchemaError, setOutputSchemaError] = useState<string | null>(null);
  const [implementationPath, setImplementationPath] = useState('');
  const [runtime, setRuntime] = useState<Runtime>('bash');
  const [yamlContent, setYamlContent] = useState('');

  // Load existing tool
  const fetchTool = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${restApiUrl('')}/tools/${encodeURIComponent(arn)}`
      );

      if (!response.ok) {
        throw new Error(`Failed to load tool: HTTP ${response.status}`);
      }

      const data = (await response.json()) as ToolData;

      let spec: Record<string, unknown> = {};
      try {
        spec = JSON.parse(data.config);
      } catch {
        spec = extractYamlSpec(data.config);
      }

      // Set raw YAML content for Monaco editor
      setYamlContent(data.config);

      setName(spec.name as string ?? data.name);
      setDescription((spec.description as string) ?? '');
      setSourceType((spec.source_type as SourceType) ?? 'mcp');
      setSource((spec.source as string) ?? '');
      setCategory((spec.category as ToolCategory) ?? 'core');
      setTags((spec.tags as string[]) ?? []);
      setImplementationPath((spec.implementation_path as string) ?? '');
      setRuntime((spec.runtime as Runtime) ?? 'bash');

      // Parse schemas
      if (spec.input_schema) {
        setInputSchemaJson(JSON.stringify(spec.input_schema, null, 2));
      }
      if (spec.output_schema) {
        setOutputSchemaJson(JSON.stringify(spec.output_schema, null, 2));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tool');
    } finally {
      setLoading(false);
    }
  }, [isNew, arn]);

  useEffect(() => {
    fetchTool();
  }, [fetchTool]);

  // F-004 fix: When switching to config tab, derive form state from YAML content
  useEffect(() => {
    if (activeTab !== 'config' || !yamlContent) return;
    try {
      const parsed = yaml.load(yamlContent) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') return;
      const spec = (parsed.spec as Record<string, unknown>) ?? parsed;
      if (spec.name !== undefined) setName(spec.name as string);
      if (spec.description !== undefined) setDescription(spec.description as string);
      if (spec.source_type !== undefined) setSourceType(spec.source_type as SourceType);
      if (spec.source !== undefined) setSource(spec.source as string);
      if (spec.category !== undefined) setCategory(spec.category as ToolCategory);
      if (spec.tags !== undefined) setTags(spec.tags as string[]);
      if (spec.implementation_path !== undefined) setImplementationPath(spec.implementation_path as string);
      if (spec.runtime !== undefined) setRuntime(spec.runtime as Runtime);
    } catch {
      // Ignore parse errors
    }
  }, [activeTab, yamlContent]);

  // Handle input schema change
  const handleInputSchemaChange = (val: string) => {
    setInputSchemaJson(val);
    try {
      JSON.parse(val);
      setInputSchemaError(null);
    } catch {
      setInputSchemaError('Invalid JSON');
    }
  };

  // Handle output schema change
  const handleOutputSchemaChange = (val: string) => {
    setOutputSchemaJson(val);
    if (!val.trim()) {
      setOutputSchemaError(null);
      return;
    }
    try {
      JSON.parse(val);
      setOutputSchemaError(null);
    } catch {
      setOutputSchemaError('Invalid JSON');
    }
  };

  // Save handler
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        name,
        description: description || '',
        source: source || `mcp://${name.toLowerCase().replace(/\s+/g, '-')}`,
        source_type: sourceType,
        input_schema: null,
        output_schema: null,
        category,
        tags,
        implementation_path: sourceType === 'custom' ? (implementationPath || null) : null,
        runtime: sourceType === 'custom' ? runtime : null,
        scope,
      };

      if (!inputSchemaError) {
        try {
          body.input_schema = JSON.parse(inputSchemaJson);
        } catch {
          // Ignore
        }
      }

      if (outputSchemaJson.trim() && !outputSchemaError) {
        try {
          body.output_schema = JSON.parse(outputSchemaJson);
        } catch {
          // Ignore
        }
      }

      const url = isNew
        ? `${restApiUrl('')}/tools`
        : `${restApiUrl('')}/tools/${encodeURIComponent(arn)}`;

      const method = isNew ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          (errData as { message?: string }).message ?? `Failed to save: HTTP ${response.status}`
        );
      }

      if (isNew) {
        navigate(`/studio/projects/${projectId}/design/tools`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save tool');
    } finally {
      setSaving(false);
    }
  }, [
    isNew,
    arn,
    name,
    description,
    source,
    sourceType,
    category,
    tags,
    inputSchemaJson,
    inputSchemaError,
    outputSchemaJson,
    outputSchemaError,
    implementationPath,
    runtime,
    scope,
    projectId,
    navigate,
  ]);

  // Loading state
  if (loading && !isNew) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-secondary text-sm animate-pulse">
          Loading tool...
        </span>
      </div>
    );
  }

  return (
    <EditorLayout
      backLabel="Tools"
      backPath={`/studio/projects/${projectId}/design/tools`}
      resourceName={isNew ? 'New Tool' : name}
      onResourceNameChange={isNew ? setName : undefined}
      isNew={isNew}
      scope={isNew ? undefined : scope}
      onSave={handleSave}
      saving={saving}
      error={error}
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={(t) => setActiveTab(t as TabId)}
    >
      {/* Tab 1: Configuration */}
      {activeTab === 'config' && (
        <div className="max-w-3xl space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <FormField label="Name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary"
              />
            </FormField>

            <FormField label="Scope">
              <div className="px-3 py-2 bg-surface-container text-secondary text-sm rounded border border-outline-variant font-mono">
                {scope}
              </div>
            </FormField>
          </div>

          <FormField label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary resize-none"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-6">
            <FormField
              label="Source Type"
              description="Where this tool comes from"
            >
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as SourceType)}
                className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary"
              >
                <option value="mcp">MCP Server</option>
                <option value="builtin">Built-in</option>
                <option value="custom">Custom</option>
              </select>
            </FormField>

            <FormField
              label="Source"
              description="Tool source identifier"
            >
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder={sourceType === 'mcp' ? 'mcp://chronos' : sourceType === 'builtin' ? 'builtin://bash' : 'custom://my-tool'}
                className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary font-mono"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <FormField
              label="Category"
              description="Tool category for organization"
            >
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ToolCategory)}
                className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary"
              >
                <option value="core">Core</option>
                <option value="search">Search</option>
                <option value="debugging">Debugging</option>
                <option value="quality">Quality</option>
                <option value="code-intelligence">Code Intelligence</option>
                <option value="testing">Testing</option>
                <option value="memory">Memory</option>
                <option value="web">Web</option>
                <option value="mcp">MCP</option>
                <option value="custom">Custom</option>
              </select>
            </FormField>

            <FormField
              label="Tags"
              description="Labels for searching and filtering"
            >
              <TagInput
                tags={tags}
                onChange={setTags}
                placeholder="Type tag and press Enter..."
              />
            </FormField>
          </div>
        </div>
      )}

      {/* Tab 2: Schema */}
      {activeTab === 'schema' && (
        <div className="max-w-3xl space-y-6">
          <FormField
            label="Input Schema"
            description="JSON Schema for tool input parameters"
          >
            <textarea
              value={inputSchemaJson}
              onChange={(e) => handleInputSchemaChange(e.target.value)}
              rows={12}
              className={`w-full text-sm font-mono bg-surface border rounded px-3 py-2 text-on-surface outline-none focus:border-primary resize-none ${
                inputSchemaError ? 'border-error' : 'border-outline-variant'
              }`}
            />
            {inputSchemaError && (
              <p className="mt-1 text-xs text-error">{inputSchemaError}</p>
            )}
          </FormField>

          <FormField
            label="Output Schema"
            description="JSON Schema for tool output (optional)"
          >
            <textarea
              value={outputSchemaJson}
              onChange={(e) => handleOutputSchemaChange(e.target.value)}
              rows={12}
              placeholder='{\n  "type": "object"\n}'
              className={`w-full text-sm font-mono bg-surface border rounded px-3 py-2 text-on-surface outline-none focus:border-primary resize-none ${
                outputSchemaError ? 'border-error' : 'border-outline-variant'
              }`}
            />
            {outputSchemaError && (
              <p className="mt-1 text-xs text-error">{outputSchemaError}</p>
            )}
          </FormField>

          <div className="text-xs text-secondary space-y-1">
            <p>
              <strong>JSON Schema example:</strong>
            </p>
            <pre className="mt-1 p-2 bg-surface-container rounded overflow-auto">
{`{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Search query"
    }
  },
  "required": ["query"]
}`}
            </pre>
          </div>
        </div>
      )}

      {/* Tab 3: Source */}
      {activeTab === 'source' && (
        <div className="max-w-3xl space-y-6">
          {sourceType === 'custom' ? (
            <>
              <FormField
                label="Implementation Path"
                description="Path to the tool implementation file"
              >
                <input
                  type="text"
                  value={implementationPath}
                  onChange={(e) => setImplementationPath(e.target.value)}
                  placeholder="tools/my-tool/index.ts"
                  className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary font-mono"
                />
              </FormField>

              <FormField
                label="Runtime"
                description="Which runtime executes this tool"
              >
                <select
                  value={runtime}
                  onChange={(e) => setRuntime(e.target.value as Runtime)}
                  className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary"
                >
                  <option value="bash">Bash</option>
                  <option value="node">Node.js</option>
                  <option value="python">Python</option>
                </select>
              </FormField>
            </>
          ) : (
            <div className="p-4 bg-surface-container/30 border border-outline-variant rounded-lg">
              <p className="text-xs text-secondary text-center">
                {sourceType === 'mcp'
                  ? 'This tool is provided by an MCP server. Source configuration is managed by the MCP server.'
                  : 'This is a built-in tool. Source configuration is not applicable.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: YAML Editor */}
      {activeTab === 'yaml' && (
        <div className="h-full min-h-[500px]">
          <ResourceYamlEditor
            arn={arn}
            initialValue={yamlContent}
            onChange={(value) => setYamlContent(value)}
            onSave={async (value) => {
              await updateContent(arn, value);
            }}
          />
        </div>
      )}
    </EditorLayout>
  );
}
