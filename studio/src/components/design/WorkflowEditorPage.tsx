/**
 * WorkflowEditorPage — /studio/projects/:projectId/design/workflows/:workflowId/editor
 * Full-page workflow editor with DAG canvas as the primary editing surface.
 * Monaco YAML editor is used for serialization only (not an alternate editor).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import type * as Monaco from 'monaco-editor';
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
import { workflowToYaml } from '@/lib/workflowToYaml';
import { InlineDiffSummary } from './shared/InlineDiffSummary';

import type { Workflow } from '@/types/workflow';
import type { WorkflowSpec, Stage } from '@/types/manifest.workflow';

// MCP WorkflowDto — returned by workflow_get MCP tool
interface McpStageDto {
  id?: string;
  agent: string;
  depends_on: string[];
  description?: string;
  input: Record<string, unknown>;
  execution?: {
    mode: string;
    retry?: { max_attempts: number; backoff_ms: number };
  };
  conditions: Array<{ when: string; operator: string; value: unknown }>;
}

interface McpWorkflowDto {
  arn: string;
  name: string;
  description: string;
  scope: string;
  stages: Record<string, McpStageDto>;
  execution?: { mode: string; on_failure: string };
}

/**
 * Convert MCP stage DTO (HashMap value) to internal Stage format.
 */
function mcpStageToStage(dto: McpStageDto, id: string): Stage {
  return {
    id: dto.id ?? id,
    agent: dto.agent,
    depends_on: dto.depends_on ?? [],
    description: dto.description ?? '',
    input: (dto.input ?? {}) as Record<string, import('@/types/workflow').InputValue>,
    output: { artifacts: [] },
    execution: {
      mode: (dto.execution?.mode as Stage['execution']['mode']) ?? 'sequential',
      retry: dto.execution?.retry ?? { max_attempts: 1, backoff_ms: 0 },
    },
    conditions: (dto.conditions ?? []) as Stage['conditions'],
    metrics: [],
  };
}

/**
 * Convert MCP WorkflowDto (from workflow_get) to internal Workflow format.
 */
function mcpWorkflowToWorkflow(dto: McpWorkflowDto, _projectId: string): Workflow {
  const stageArray = Object.entries(dto.stages).map(([id, stageDto]) =>
    mcpStageToStage(stageDto, id)
  );
  return {
    arn: dto.arn,
    name: dto.name,
    version: '1.0',
    description: dto.description ?? '',
    agents: {},
    skills: {},
    stages: stageArray,
    execution: {
      mode: (dto.execution?.mode as Workflow['execution']['mode']) ?? 'sequential',
      stop_on_error: true,
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

/**
 * Apply a stage patch to the workflow and return the updated workflow.
 * This is the sole write path for stage mutations from the inspector.
 */
function applyStagePatch(
  workflow: Workflow,
  stageId: string,
  patch: Partial<StageNodeData>
): Workflow {
  return {
    ...workflow,
    stages: workflow.stages.map((s) => {
      if (s.id !== stageId) return s;

      const retryPatch = patch.retry;
      const executionPatch = retryPatch
        ? {
            retry: {
              max_attempts: retryPatch.maxAttempts,
              backoff_ms: retryPatch.backoffMs,
            },
          }
        : {};

      return {
        ...s,
        id: patch.id ?? s.id,
        description: (patch as { description?: string }).description ?? s.description,
        agent: (patch as { agent?: string }).agent ?? s.agent,
        depends_on: (patch as { dependsOn?: string[] }).dependsOn ?? s.depends_on,
        execution: {
          ...s.execution,
          mode: (patch as { executionMode?: string }).executionMode as typeof s.execution.mode ?? s.execution.mode,
          ...executionPatch,
        },
      };
    }),
  };
}

export function WorkflowEditorPage() {
  const { projectId, workflowId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getResourceByArn } = useMcpTools();
  const { updateContent } = useContent();

  const isNew = !workflowId || workflowId === 'new';
  const arn = searchParams.get('arn');

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [originalWorkflow, setOriginalWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const yamlEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

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
          retry: stage.execution?.retry
            ? {
                maxAttempts: stage.execution.retry.max_attempts,
                backoffMs: stage.execution.retry.backoff_ms,
              }
            : undefined,
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
      // getResourceByArn returns McpWorkflowDto from the workflow_get MCP tool
      const wf = result as unknown as { kind: string; data: McpWorkflowDto };
      const internalWf = mcpWorkflowToWorkflow(wf.data, projectId ?? 'app');
      setWorkflow(internalWf);
      setOriginalWorkflow(internalWf);
      // Use the converted stages from internalWf (not wf.data which is the MCP DTO format)
      setNodes(buildNodes(internalWf.stages));
      setEdges(buildEdges(internalWf.stages));
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

  // Sync workflow stages to nodes/edges
  useEffect(() => {
    if (!workflow) return;
    if (workflow.stages.length > 0) {
      setNodes(buildNodes(workflow.stages, nodes));
      setEdges(buildEdges(workflow.stages));
    }
  }, [workflow?.stages, buildNodes, buildEdges, setNodes, setEdges, nodes]);

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
      const yamlOut = workflowToYaml(workflow);
      const success = await updateContent(workflow.arn, yamlOut);
      if (!success) {
        setError('Failed to save workflow');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [workflow, updateContent]);

  // Handle valid YAML edits → update workflow state + canvas nodes/edges
  const handleYamlWorkflowChange = useCallback(
    (updatedWorkflow: Workflow) => {
      setWorkflow(updatedWorkflow);
      // Update canvas nodes with new stages (preserve existing positions)
      setNodes(buildNodes(updatedWorkflow.stages, nodes));
      setEdges(buildEdges(updatedWorkflow.stages));
    },
    [nodes, buildNodes, buildEdges, setNodes, setEdges]
  );

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

        <div className="flex items-center gap-2">
          <InlineDiffSummary
            original={originalWorkflow as { stages?: Array<{ id: string; [key: string]: unknown }> } | null}
            current={workflow as { stages?: Array<{ id: string; [key: string]: unknown }> } | null}
          />
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

      {/* Body — Canvas primary, inspector + YAML serialization panel */}
      <div className="flex-1 flex overflow-hidden">
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
              const nodeId = selectedNodeId;
              // Update nodes in ReactFlow canvas
              setNodes((nds) =>
                nds.map((n) =>
                  n.id === nodeId ? { ...n, data: { ...n.data, ...updated } } : n
                )
              );
              // Apply patch to workflow stages — sole write path
              if (workflow && nodeId) {
                setWorkflow((prev) => {
                  if (!prev) return prev;
                  return applyStagePatch(prev, nodeId, updated);
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

        <div className="w-[420px] border-l border-outline-variant bg-surface-container/10">
          <WorkflowYamlEditor
            workflow={workflow}
            syncEnabled
            editorRef={yamlEditorRef}
            onWorkflowChange={handleYamlWorkflowChange}
          />
        </div>
      </div>
    </div>
  );
}
