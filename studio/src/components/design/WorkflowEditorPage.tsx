/**
 * WorkflowEditorPage — /studio/projects/:projectId/design/workflows/:workflowId/editor
 * Full-page workflow editor with DAG canvas, inspector, and YAML raw editing.
 * Hybrid: editable DAG canvas + inspector/forms + YAML raw editing.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import * as yaml from 'js-yaml';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useMcpTools } from '@/hooks/useMcpTools';
import { useContent } from '@/hooks/useContent';
import { WorkflowStageNode, type StageNodeData } from './nodes/WorkflowStageNode';
import { WorkflowInspector } from './inspector/WorkflowInspector';
import { WorkflowYamlEditor } from './WorkflowYamlEditor';
import { LoadingState } from '@/components/states/LoadingState';

import type { Workflow } from '@/types/workflow';
import type { WorkflowSpec, Stage, WorkflowManifest } from '@/types/manifest.workflow';
import { API_VERSION } from '@/types/manifest';

type WorkflowStatus = 'draft' | 'published' | 'deprecated' | 'archived';

interface WorkflowData {
  id: string;
  name: string;
  namespace: string;
  description?: string;
  version?: string;
  status: WorkflowStatus;
  spec?: WorkflowSpec;
}

/**
 * Convert WorkflowData (manifest-style: spec.stages) to Workflow (internal editor type).
 */
function workflowDataToWorkflow(data: WorkflowData, projectId: string): Workflow {
  return {
    arn: data.id || `arn:local:project/${projectId}:workflow/${data.name}`,
    name: data.name,
    version: data.version || '1.0',
    description: data.description ?? data.spec?.description ?? '',
    agents: {},
    skills: {},
    stages: (data.spec?.stages ?? []) as Stage[],
    execution: {
      mode: (data.spec?.execution?.mode as Workflow['execution']['mode']) ?? 'sequential',
      stop_on_error: data.spec?.execution?.stop_on_error ?? true,
    },
    metrics: { streaming: false, interval_ms: 5000, channels: [] },
  };
}

/**
 * Adapter: wrap Workflow (internal type) into the { spec: { stages: [] } } shape
 * that WorkflowInspector expects.
 */
function workflowForInspector(workflow: Workflow | null): WorkflowInspectorProps['workflow'] {
  if (!workflow) return null;
  return {
    spec: {
      stages: workflow.stages.map((s) => ({
        id: s.id,
        agent: s.agent,
        depends_on: s.depends_on,
        description: s.description,
        input: s.input as Record<string, unknown>,
        execution: { mode: s.execution.mode, retry: s.execution.retry },
        conditions: s.conditions,
      })),
    },
  };
}

type WorkflowInspectorProps = {
  node: Node<StageNodeData, 'stage'>;
  workflow: {
    spec?: {
      stages?: Array<{
        id: string;
        agent: string;
        depends_on: string[];
        description: string;
        input: Record<string, unknown>;
        execution: { mode: string; retry: { max_attempts: number; backoff_ms: number } };
        conditions: Array<{ when: string; operator: string; value: unknown }>;
      }>;
    };
  } | null;
  onUpdate: (data: Partial<StageNodeData>) => void;
  onClose: () => void;
};

// Custom node type for ReactFlow
type StageNode = Node<StageNodeData, 'stage'>;

const nodeTypes: NodeTypes = {
  stage: WorkflowStageNode,
};

function workflowToYaml(workflow: Workflow | null): string {
  if (!workflow) return '';
  const manifest: WorkflowManifest = {
    apiVersion: API_VERSION,
    kind: 'Workflow',
    metadata: {
      uid: '',
      name: workflow.name,
      scope: 'global',
      labels: {},
      annotations: {},
    },
    spec: {
      description: workflow.description,
      stages: workflow.stages,
      agents: workflow.agents,
      skills: workflow.skills,
      execution: workflow.execution as unknown as { mode: string; stop_on_error: boolean },
      metrics: workflow.metrics as { streaming: boolean; interval_ms: number; channels: string[] },
    },
  };
  return yaml.dump(manifest, { indent: 2, lineWidth: -1, noRefs: true });
}

function manifestToWorkflow(manifest: WorkflowManifest): Workflow {
  return {
    arn: `arn:local:${manifest.metadata.scope}:workflow/${manifest.metadata.name}`,
    name: manifest.metadata.name,
    version: '1.0',
    description: manifest.spec.description ?? '',
    agents: manifest.spec.agents ?? {},
    skills: manifest.spec.skills ?? {},
    stages: manifest.spec.stages ?? [],
    execution: {
      mode: (manifest.spec.execution?.mode as Workflow['execution']['mode']) ?? 'sequential',
      stop_on_error: manifest.spec.execution?.stop_on_error ?? true,
    },
    metrics: manifest.spec.metrics ?? { streaming: false, interval_ms: 5000, channels: [] },
  };
}

type Tab = 'canvas' | 'yaml';

export function WorkflowEditorPage() {
  const { projectId, workflowId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getResourceByArn } = useMcpTools();
  const { updateContent } = useContent();

  const isNew = !workflowId || workflowId === 'new';
  const arn = searchParams.get('arn');

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('yaml');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [yamlContent, setYamlContent] = useState('');

  // ReactFlow state — typed for StageNodeData
  const [nodes, setNodes, onNodesChange] = useNodesState<StageNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Build ReactFlow nodes from workflow stages, preserving existing positions
  const buildNodes = useCallback((stages: WorkflowSpec['stages'] = [], existingNodes: StageNode[] = []): StageNode[] => {
    const existingPositions = new Map(existingNodes.map((n) => [n.id, n.position]));
    return stages.map((stage, index) => {
      const existingPos = existingPositions.get(stage.id);
      return {
        id: stage.id,
        type: 'stage' as const,
        position: existingPos ?? { x: (index % 4) * 250, y: Math.floor(index / 4) * 150 },
        data: {
          id: stage.id,
          label: stage.id,
          description: stage.description,
          agent: stage.agent,
          dependsOn: stage.depends_on,
          executionMode: stage.execution?.mode,
        } as StageNodeData,
      };
    });
  }, []);

  // Build ReactFlow edges from stage dependencies
  const buildEdges = useCallback((stages: WorkflowSpec['stages'] = []): Edge[] => {
    const stageIds = new Set(stages.map((s) => s.id));
    const result: Edge[] = [];
    for (const stage of stages) {
      for (const dep of stage.depends_on) {
        if (stageIds.has(dep)) {
          result.push({
            id: `${dep}-${stage.id}`,
            source: dep,
            target: stage.id,
            type: 'smoothstep',
            animated: true,
          });
        }
      }
    }
    return result;
  }, []);

  // Load workflow
  const fetchWorkflow = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }
    const targetArn = arn ?? `arn:local:project/${projectId}:workflow/${workflowId}`;
    setLoading(true);
    setError(null);
    try {
      const result = await getResourceByArn(targetArn);
      if (!result) {
        setError('Workflow not found');
        return;
      }
      const wf = result as unknown as { kind: string; data: WorkflowData };
      const internalWf = workflowDataToWorkflow(wf.data, projectId ?? 'app');
      setWorkflow(internalWf);
      setNodes(buildNodes(wf.data.spec?.stages));
      setEdges(buildEdges(wf.data.spec?.stages));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow');
    } finally {
      setLoading(false);
    }
  }, [isNew, arn, projectId, workflowId, getResourceByArn, buildNodes, buildEdges, setNodes, setEdges]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  // Handle new workflow init
  useEffect(() => {
    if (isNew && !workflow) {
      setWorkflow({
        arn: `arn:local:project/${projectId ?? 'app'}:workflow/new-workflow`,
        name: 'New Workflow',
        version: '1.0',
        description: '',
        agents: {},
        skills: {},
        stages: [],
        execution: { mode: 'sequential', stop_on_error: true },
        metrics: { streaming: false, interval_ms: 5000, channels: [] },
      });
    }
  }, [isNew, workflow, projectId]);

  // Sync workflow stages to nodes/edges when YAML editor applies changes
  // This enables bidirectional sync: Visual ↔ YAML
  useEffect(() => {
    if (!workflow) return;
    // Only sync if we have stages (not initial empty state)
    if (workflow.stages.length > 0) {
      setNodes(buildNodes(workflow.stages, nodes));
      setEdges(buildEdges(workflow.stages));
    }
  }, [workflow?.stages, buildNodes, buildEdges, setNodes, setEdges, nodes]);

  // F-001 fix: Force WorkflowYamlEditor to re-derive yamlContent when switching to YAML tab
  // This ensures canvas edits are reflected in YAML even if the editor was unmounted
  const [yamlTabKey, setYamlTabKey] = useState(0);
  useEffect(() => {
    if (activeTab === 'yaml') {
      // Increment key to force WorkflowYamlEditor remount with fresh state
      // This makes it re-read the workflow prop and sync yamlContent
      setYamlTabKey((k) => k + 1);
    }
  }, [activeTab]);

  // F-004 fix: When switching to canvas tab, parse yamlContent and update workflow
  // This ensures YAML edits are reflected in canvas when switching tabs
  useEffect(() => {
    if (activeTab !== 'canvas' || !yamlContent) return;
    try {
      const parsed = yaml.load(yamlContent) as WorkflowManifest;
      if (!parsed || typeof parsed !== 'object') return;
      if (!parsed.apiVersion || !parsed.kind || !parsed.metadata || !parsed.spec) return;
      if (parsed.kind !== 'Workflow') return;
      const newWorkflow = manifestToWorkflow(parsed);
      setWorkflow(newWorkflow);
    } catch {
      // Ignore parse errors - canvas state is already valid
    }
  }, [activeTab, yamlContent]);

  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: true }, eds));
    },
    [setEdges]
  );

  const handleSave = useCallback(async () => {
    if (!workflow) return;
    setSaving(true);
    setError(null);
    try {
      const yamlContent = workflowToYaml(workflow);
      const success = await updateContent(workflow.arn, yamlContent);
      if (!success) {
        setError('Failed to save workflow');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [workflow, updateContent]);

  const selectedNode = selectedNodeId ? (nodes.find((n) => n.id === selectedNodeId) ?? null) : null;

  if (loading && !isNew) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <LoadingState type="detail" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-outline-variant bg-surface-container/30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/studio/projects/${projectId}/design/workflows`)}
            className="text-secondary hover:text-on-surface transition-colors text-sm"
          >
            ← Workflows
          </button>
          <div className="w-px h-4 bg-border-subtle" />
          <div>
            <h1 className="text-base font-semibold text-on-surface">
              {isNew ? 'New Workflow' : (workflow?.name ?? workflowId)}
            </h1>
            {workflow && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-xs text-secondary">
                  {workflow.arn}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-surface border border-outline-variant rounded p-0.5">
          {(['canvas', 'yaml'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                activeTab === tab
                  ? 'bg-primary text-on-primary'
                  : 'text-secondary hover:text-on-surface'
              }`}
            >
              {tab === 'canvas' ? 'Canvas' : 'YAML'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-primary text-on-primary text-sm font-medium rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-error/10 border border-primary-error/20 rounded text-error text-sm">
          {error}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'canvas' ? (
          <>
            {/* Canvas */}
            <div className="flex-1">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, node) => setSelectedNodeId(node.id === selectedNodeId ? null : node.id)}
                nodeTypes={nodeTypes}
                fitView
                className="bg-background"
              >
                <Background gap={16} color="var(--color-border-subtle)" />
                <Controls className="!border-outline-variant !bg-surface" />
                <MiniMap
                  className="!border-outline-variant !bg-surface"
                  nodeColor={(n) => n.id === selectedNodeId ? 'var(--color-accent)' : 'var(--color-text-muted)'}
                />
              </ReactFlow>
            </div>

            {/* Inspector panel */}
            {selectedNode ? (
              <WorkflowInspector
                node={selectedNode as StageNode}
                workflow={workflowForInspector(workflow)}
                onUpdate={(updated) => {
                  // Update nodes in ReactFlow canvas
                  setNodes((nds) =>
                    nds.map((n) =>
                      n.id === selectedNodeId ? { ...n, data: { ...n.data, ...updated } } : n
                    )
                  );
                  // Also update workflow.stages to keep in sync with visual canvas
                  if (workflow) {
                    setWorkflow((prev) => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        stages: prev.stages.map((s) =>
                          s.id === selectedNodeId
                            ? {
                                ...s,
                                id: (updated as { id?: string }).id ?? s.id,
                                description: (updated as { description?: string }).description ?? s.description,
                                agent: (updated as { agent?: string }).agent ?? s.agent,
                                depends_on: (updated as { dependsOn?: string[] }).dependsOn ?? s.depends_on,
                                execution: {
                                  ...s.execution,
                                  ...(updated as { execution?: Partial<Stage['execution']> }).execution,
                                },
                              }
                            : s
                        ),
                      };
                    });
                  }
                }}
                onClose={() => setSelectedNodeId(null)}
              />
            ) : (
              <div className="w-72 border-l border-outline-variant bg-surface-container/20 flex items-center justify-center">
                <p className="text-secondary text-xs">Select a stage to inspect</p>
              </div>
            )}
          </>
        ) : (
          /* YAML tab - key forces remount on tab switch to sync canvas changes */
          <WorkflowYamlEditor
            key={yamlTabKey}
            workflow={workflow}
            onChange={(updated) => setWorkflow(updated)}
            onYamlTabActivate={() => {}}
            onYamlContentChange={(content) => setYamlContent(content)}
          />
        )}
      </div>
    </div>
  );
}
