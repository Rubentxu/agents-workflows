import { useCallback, useMemo } from 'react';
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
  type OnConnect,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { StageNode } from './nodes/StageNode';
import { AgentNode } from './nodes/AgentNode';
import { useWorkflowEditorStore } from '@/stores/workflowEditorStore';

const nodeTypes: NodeTypes = {
  stage: StageNode as unknown as NodeTypes[string],
  agent: AgentNode as unknown as NodeTypes[string],
};

interface WorkflowCanvasProps {
  onNodeSelect?: (nodeId: string) => void;
}

export function WorkflowCanvas({ onNodeSelect }: WorkflowCanvasProps) {
  const workflow = useWorkflowEditorStore((state) => state.workflow);
  const selectedNodeId = useWorkflowEditorStore((state) => state.selectedNodeId);

  const initialNodes = useMemo<Node[]>(() => {
    if (!workflow) return [];

    const nodes: Node[] = [];

    workflow.stages.forEach((stage, index) => {
      nodes.push({
        id: stage.id,
        type: 'stage',
        position: { x: 250, y: index * 150 },
        data: {
          label: stage.id,
          description: stage.description,
          agent: stage.agent,
          dependsOn: stage.depends_on,
          status: 'pending',
        },
        selected: stage.id === selectedNodeId,
      });
    });

    Object.entries(workflow.agents).forEach(([key, agent], index) => {
      nodes.push({
        id: key,
        type: 'agent',
        position: { x: 50, y: index * 150 },
        data: {
          label: agent.name,
          description: agent.description,
          model: agent.model,
        },
      });
    });

    return nodes;
  }, [workflow, selectedNodeId]);

  const initialEdges = useMemo<Edge[]>(() => {
    if (!workflow) return [];

    const edges: Edge[] = [];

    workflow.stages.forEach((stage) => {
      stage.depends_on.forEach((depId) => {
        edges.push({
          id: `${depId}-${stage.id}`,
          source: depId,
          target: stage.id,
          type: 'smoothstep',
          animated: true,
          style: { stroke: 'var(--color-primary)' },
        });
      });
    });

    return edges;
  }, [workflow]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, type: 'smoothstep' }, eds));
    },
    [setEdges]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      useWorkflowEditorStore.getState().setSelectedNodeId(node.id);
      onNodeSelect?.(node.id);
    },
    [onNodeSelect]
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={(changes) => {
          onNodesChange(changes);
          changes.forEach((change) => {
            if (change.type === 'select' && change.selected) {
              useWorkflowEditorStore.getState().setSelectedNodeId(change.id);
            }
          });
        }}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
