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
import { useValidationGate, type GateDecision } from '@/hooks/useValidationGate';
import { WorkflowStageNode, type StageNodeData } from './nodes/WorkflowStageNode';
import { WorkflowInspector } from './inspector/WorkflowInspector';
import { WorkflowYamlEditor } from './WorkflowYamlEditor';
import { WorkflowMetadataPanel } from './WorkflowMetadataPanel';
import { LoadingState } from '@/components/states/LoadingState';
import { workflowToYaml } from '@/lib/workflowToYaml';
import { InlineDiffSummary } from './shared/InlineDiffSummary';
import { StagePalette, type StageTemplate } from './StagePalette';
import { buildArn } from '@/types/manifest';
import { instantiateWorkflowFromTemplate } from '@/lib/workflowTemplates';

import type { Workflow } from '@/types/workflow';
import type { WorkflowSpec, Stage } from '@/types/manifest.workflow';

// MCP WorkflowDto — returned by workflow_get MCP tool
interface McpStageDto {
  id?: string;
  agent: string;
  depends_on: string[];
  description?: string;
  input: Record<string, unknown>;
  output?: { artifacts: Array<{ name: string; path_template: string; content_type?: string }> };
  execution?: {
    mode: string;
    on_failure?: string;
    retry?: { max_attempts: number; backoff_ms: number };
  };
  conditions: Array<{ when: string; operator: string; value: unknown }>;
}

interface McpWorkflowDto {
  arn: string;
  name: string;
  description: string;
  scope: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
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
    depends_on: Array.isArray(dto.depends_on) ? dto.depends_on : [],
    description: dto.description ?? '',
    input: (dto.input ?? {}) as Record<string, import('@/types/workflow').InputValue>,
    output: dto.output ?? { artifacts: [] },
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
    scope: dto.scope,
    version: '1.0',
    description: dto.description ?? '',
    labels: dto.labels ?? {},
    annotations: dto.annotations ?? {},
    agents: {},
    skills: {},
    stages: stageArray,
    execution: {
      mode: (dto.execution?.mode as Workflow['execution']['mode']) ?? 'sequential',
      on_failure:
        (dto.execution?.on_failure as Workflow['execution']['on_failure'])
        ?? 'abort',
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
  onDeleteStage?: (stageId: string) => void;
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
        depends_on: (patch as { dependsOn?: string[] }).dependsOn ?? (Array.isArray(s.depends_on) ? s.depends_on : []),
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
  const { projectId, workflowId, workspaceId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getResourceByArn } = useMcpTools();
  const { updateContent } = useContent();
  const { validating: validatingGate, lastResult: _gateResult, validateBeforeSave } = useValidationGate();

  const arn = searchParams.get('arn');
  const templateId = searchParams.get('template');
  const scopeFromUrl = searchParams.get('scope');
  const isTemplateCreation = Boolean(templateId && scopeFromUrl && !arn);
  const isNew = !workflowId || workflowId === 'new' || isTemplateCreation;
  const initialName = workflowId && workflowId !== 'new' ? workflowId : (searchParams.get('name') ?? 'new-workflow');
  const derivedScope = scopeFromUrl
    ?? (workspaceId
      ? `workspace/${workspaceId}`
      : projectId
        ? `project/${projectId}`
        : 'global');

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [originalWorkflow, setOriginalWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const yamlEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  // Stage palette state
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Validation diagnostics display
  const [validationDiagnostics, setValidationDiagnostics] = useState<GateDecision | null>(null);

  // Context menu for nodes/edges
  const [contextMenu, setContextMenu] = useState<{
    type: 'node' | 'edge';
    id: string;
    x: number;
    y: number;
  } | null>(null);

  // ReactFlow state — typed for StageNodeData
  const [nodes, setNodes, onNodesChange] = useNodesState<StageNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const nodesRef = useRef<StageNode[]>([]);
  nodesRef.current = nodes;

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
      const deps = Array.isArray(stage.depends_on) ? stage.depends_on : [];
      for (const dep of deps) {
        if (stageIds.has(dep)) {
          result.push({
            id: `${dep}-${stage.id}`,
            source: dep,
            target: stage.id,
            type: 'smoothstep',
            animated: true,
            selectable: true,
            style: { strokeWidth: 2 },
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
    const targetArn = arn ?? buildArn(derivedScope, 'Workflow', workflowId ?? 'new-workflow');
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
  }, [isNew, arn, derivedScope, projectId, workflowId, getResourceByArn, buildNodes, buildEdges, setNodes, setEdges]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  // Handle new workflow init
  useEffect(() => {
    if (isNew && !workflow) {
      setWorkflow(instantiateWorkflowFromTemplate(templateId, derivedScope, initialName));
    }
  }, [isNew, workflow, templateId, derivedScope, initialName]);

  // Sync workflow stages to nodes/edges
  useEffect(() => {
    if (!workflow) return;
    if (workflow.stages.length > 0) {
      setNodes(buildNodes(workflow.stages, nodesRef.current));
      setEdges(buildEdges(workflow.stages));
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [workflow?.stages, buildNodes, buildEdges, setNodes, setEdges]);

  // --- WG-1: Add Stage ---
  const addStageToWorkflow = useCallback((template: StageTemplate) => {
    if (!workflow) return;

    // Generate unique stage ID
    const existingIds = new Set(workflow.stages.map((s) => s.id));
    let counter = workflow.stages.length + 1;
    let stageId = `stage-${counter}`;
    while (existingIds.has(stageId)) {
      counter++;
      stageId = `stage-${counter}`;
    }

    // For SDD template, prefix with sdd-
    const finalId = template.label === 'SDD Stage' ? `sdd-${stageId}` : stageId;

    const newStage: Stage = {
      id: finalId,
      agent: template.defaults.agent ?? '',
      depends_on: template.defaults.depends_on ?? [],
      description: template.defaults.description ?? '',
      input: template.defaults.input ?? {},
      output: template.defaults.output ?? { artifacts: [] },
      execution: template.defaults.execution ?? { mode: 'sequential', retry: { max_attempts: 1, backoff_ms: 0 } },
      conditions: template.defaults.conditions ?? [],
      metrics: template.defaults.metrics ?? [],
    };

    setWorkflow((prev) => {
      if (!prev) return prev;
      return { ...prev, stages: [...prev.stages, newStage] };
    });

    // Also directly update nodes so the canvas shows the new stage immediately
    setNodes((nds) => buildNodes([...(workflow?.stages ?? []), newStage], nds));
    setEdges(buildEdges([...(workflow?.stages ?? []), newStage]));
  }, [workflow, buildNodes, buildEdges, setNodes, setEdges]);

  // --- WG-2: Delete Stage ---
  const deleteStageFromWorkflow = useCallback((stageId: string) => {
    setWorkflow((prev) => {
      if (!prev) return prev;
      const newStages = prev.stages.filter((s) => s.id !== stageId);
      return {
        ...prev,
        stages: newStages.map((s) => ({
          ...s,
          depends_on: s.depends_on.filter((d) => d !== stageId),
        })),
      };
    });

    setNodes((nds) => nds.filter((n) => n.id !== stageId));
    setEdges((eds) => eds.filter((e) => e.source !== stageId && e.target !== stageId));
    setSelectedNodeId(null);
  }, [setWorkflow, setNodes, setEdges]);

  // Keyboard handler for Delete/Backspace on selected nodes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        e.preventDefault();
        e.stopPropagation();
        if (confirm(`Delete stage '${selectedNodeId}'? This will remove all connected edges.`)) {
          deleteStageFromWorkflow(selectedNodeId);
        }
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [selectedNodeId, deleteStageFromWorkflow]);

  // Close context menu on any click
  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [contextMenu]);

  // --- WG-3: Edge Deletion ---
  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: true }, eds));
      // Also update workflow state so YAML reflects the new dependency
      if (params.target && params.source) {
        setWorkflow((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            stages: prev.stages.map((s) =>
              s.id === params.target
                ? { ...s, depends_on: [...s.depends_on.filter((d) => d !== params.source), params.source] }
                : s,
            ),
          };
        });
      }
    },
    [setEdges, setWorkflow],
  );

  // Handle edge deletion from ReactFlow (keyboard delete on selected edges)
  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      setWorkflow((prev) => {
        if (!prev) return prev;
        let updatedStages = [...prev.stages];
        for (const edge of deletedEdges) {
          updatedStages = updatedStages.map((s) =>
            s.id === edge.target
              ? { ...s, depends_on: s.depends_on.filter((d) => d !== edge.source) }
              : s,
          );
        }
        return { ...prev, stages: updatedStages };
      });
    },
    [setWorkflow],
  );

  // Edge context menu — "Remove dependency"
  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setContextMenu({ type: 'edge', id: edge.id, x: event.clientX, y: event.clientY });
    },
    [],
  );

  // Handle context menu action
  const handleRemoveDependency = useCallback(
    (edgeId: string) => {
      const edge = edges.find((e) => e.id === edgeId);
      if (!edge) return;

      setWorkflow((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          stages: prev.stages.map((s) =>
            s.id === edge.target
              ? { ...s, depends_on: s.depends_on.filter((d) => d !== edge.source) }
              : s,
          ),
        };
      });

      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      setContextMenu(null);
    },
    [edges, setWorkflow, setEdges],
  );

  // --- WG-4: Validation Gate ---
  const handleSave = useCallback(async () => {
    if (!workflow) return;
    setSaving(true);
    setError(null);
    setValidationDiagnostics(null);
    try {
      const yamlOut = workflowToYaml(workflow, workflow.scope);

      // Validate before save
      const gate = await validateBeforeSave(workflow.arn, yamlOut);
      if (!gate.allowed) {
        setValidationDiagnostics(gate);
        setSaving(false);
        return;
      }

      const success = await updateContent(workflow.arn, yamlOut);
      if (!success) {
        setError('Failed to save workflow');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [workflow, updateContent, validateBeforeSave]);

  // Handle valid YAML edits → update workflow state + canvas nodes/edges
  const handleYamlWorkflowChange = useCallback(
    (updatedWorkflow: Workflow) => {
      setWorkflow(updatedWorkflow);
      // Update canvas nodes with new stages (preserve existing positions)
      setNodes(buildNodes(updatedWorkflow.stages, nodesRef.current));
      setEdges(buildEdges(updatedWorkflow.stages));
    },
    [buildNodes, buildEdges, setNodes, setEdges],
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
            disabled={saving || validatingGate}
            className="px-4 py-1.5 bg-primary text-on-primary text-sm font-medium rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : validatingGate ? 'Validating...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-error/10 border border-primary-error/20 rounded text-error text-sm">
          {error}
        </div>
      )}

      {/* Validation Diagnostics */}
      {validationDiagnostics && !validationDiagnostics.allowed && (
        <div className="mx-6 mt-4 border border-error/30 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-error/10 border-b border-error/20">
            <span className="text-xs font-semibold text-error">
              Validation Errors ({validationDiagnostics.diagnostics.filter(d => d.severity === 'error').length})
            </span>
            <button
              onClick={() => setValidationDiagnostics(null)}
              className="text-error/60 hover:text-error text-xs"
            >
              Dismiss
            </button>
          </div>
          <div className="max-h-32 overflow-auto bg-surface-container/20">
            {validationDiagnostics.diagnostics.map((d, i) => (
              <div
                key={i}
                className={`px-4 py-1.5 text-xs border-b border-outline-variant/30 last:border-b-0 ${
                  d.severity === 'error' ? 'text-error' : 'text-warning'
                }`}
              >
                <span className="font-semibold uppercase mr-1">
                  [{d.severity}]
                </span>
                {d.message}
                {d.location && (
                  <span className="text-secondary ml-1">
                    (line {d.location.line})
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Body — Canvas primary, inspector + YAML serialization panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Stage Palette (left) */}
        <StagePalette
          isOpen={paletteOpen}
          onToggle={() => setPaletteOpen((prev) => !prev)}
          onAddStage={addStageToWorkflow}
        />

        {/* Canvas */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {workflow && (
            <WorkflowMetadataPanel
              workflow={workflow}
              onChange={(nextWorkflow) => {
                const nextArn = buildArn(nextWorkflow.scope, 'Workflow', nextWorkflow.name);
                setWorkflow({ ...nextWorkflow, arn: nextArn });
              }}
            />
          )}

          <div className="flex-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onEdgesDelete={onEdgesDelete}
              onConnect={onConnect}
              onNodeClick={(_, node) => setSelectedNodeId(node.id === selectedNodeId ? null : node.id)}
              onNodeContextMenu={(event, node) => {
                event.preventDefault();
                setSelectedNodeId(node.id);
                setContextMenu({ type: 'node', id: node.id, x: event.clientX, y: event.clientY });
              }}
              onEdgeContextMenu={onEdgeContextMenu}
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
        </div>

        {/* Inspector panel */}
        {selectedNode ? (
          <WorkflowInspector
            key={selectedNode.id}
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
            onDeleteStage={deleteStageFromWorkflow}
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

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-surface border border-outline-variant rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'node' && (
            <button
              className="w-full text-left px-3 py-2 text-sm text-error hover:bg-error/10 transition-colors flex items-center gap-2"
              onClick={() => {
                const nodeId = contextMenu.id;
                setContextMenu(null);
                if (confirm(`Delete stage '${nodeId}'? This will remove all connected edges.`)) {
                  deleteStageFromWorkflow(nodeId);
                }
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 4h12M5 4V2.5A.5.5 0 015.5 2h5a.5.5 0 01.5.5V4M6 7v5M10 7v5M3 4l1 10a1 1 0 001 1h6a1 1 0 001-1l1-10" />
              </svg>
              Delete Stage
            </button>
          )}
          {contextMenu.type === 'edge' && (
            <button
              className="w-full text-left px-3 py-2 text-sm text-error hover:bg-error/10 transition-colors flex items-center gap-2"
              onClick={() => handleRemoveDependency(contextMenu.id)}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 8h10" />
              </svg>
              Remove dependency
            </button>
          )}
        </div>
      )}
    </div>
  );
}
