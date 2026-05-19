/**
 * useMcpTools — registry operations via MCP JSON-RPC.
 * Uses mcpClient for transport, manages loading/error state,
 * and updates the appropriate stores as a side-effect.
 */

import { useCallback, useState } from 'react';
import { useRegistryCacheStore } from '@/stores/registryCacheStore';
import { useWorkflowEditorStore } from '@/stores/workflowEditorStore';
import { useExecutionStore } from '@/stores/executionStore';
import { mcpRequest, parseToolResult, arnToTool } from '@/hooks/mcpClient';
import type { Workflow, RegistryNode, ExecutionPlan } from '@/types';

export function useMcpTools() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setNodes = useRegistryCacheStore((state) => state.setNodes);
  const setWorkflow = useWorkflowEditorStore((state) => state.setWorkflow);
  const setExecutionPlan = useExecutionStore((state) => state.setExecutionPlan);

  /**
   * List all workflows from registry.
   */
  const listWorkflows = useCallback(async (): Promise<RegistryNode[]> => {
    setLoading(true);
    setError(null);
    try {
      const result = await mcpRequest('tools/call', {
        name: 'list_workflows',
        arguments: {},
      }) as { content: { text: string }[] };
      const nodes = parseToolResult(result) as RegistryNode[];
      setNodes(nodes);
      return nodes;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list workflows';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [setNodes]);

  /**
   * Get a workflow by ARN.
   */
  const getWorkflow = useCallback(async (arn: string): Promise<Workflow | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await mcpRequest('tools/call', {
        name: 'get_workflow',
        arguments: { arn },
      }) as { content: { text: string }[] };
      const workflow = parseToolResult(result, '{}') as Workflow;
      setWorkflow(workflow);
      return workflow;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get workflow';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [setWorkflow]);

  /**
   * Generate execution plan for a workflow.
   */
  const generateExecutionPlan = useCallback(async (arn: string): Promise<ExecutionPlan | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await mcpRequest('tools/call', {
        name: 'generate_execution_plan',
        arguments: { arn },
      }) as { content: { text: string }[] };
      const data = parseToolResult(result, '{}') as { json?: string };
      const plan = data?.json ? JSON.parse(data.json) as ExecutionPlan : null;
      setExecutionPlan(plan);
      return plan;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate plan';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [setExecutionPlan]);

  /**
   * List all nodes in registry, optionally filtered by type.
   */
  const listNodes = useCallback(async (nodeType?: string): Promise<RegistryNode[]> => {
    setLoading(true);
    setError(null);
    try {
      const result = await mcpRequest('tools/call', {
        name: 'list_nodes',
        arguments: nodeType ? { node_type: nodeType } : {},
      }) as { content: { text: string }[] };
      const nodes = parseToolResult(result) as RegistryNode[];
      setNodes(nodes);
      return nodes;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list nodes';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [setNodes]);

  /**
   * Get a single resource by ARN using the appropriate MCP tool.
   */
  const getResourceByArn = useCallback(
    async (arn: string): Promise<{ kind: string; data: unknown } | null> => {
      setLoading(true);
      setError(null);
      try {
        const match = arn.match(/^arn:local:[^:]+:([^/]+)\//);
        if (!match) throw new Error(`Invalid ARN: ${arn}`);
        const type = match[1];
        const toolName = arnToTool(type);

        const result = await mcpRequest('tools/call', {
          name: toolName,
          arguments: { arn },
        }) as { content?: { text: string }[] };

        const data = parseToolResult(result, '{}');
        return { kind: type, data };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get resource';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * List all agents via MCP.
   */
  const listAgents = useCallback(async (): Promise<RegistryNode[]> => {
    setLoading(true);
    setError(null);
    try {
      const result = await mcpRequest('tools/call', {
        name: 'agent_list',
        arguments: {},
      }) as { content?: { text: string }[] };
      const nodes = parseToolResult(result) as RegistryNode[];
      return nodes;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list agents';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * List all skills via MCP.
   */
  const listSkills = useCallback(async (): Promise<RegistryNode[]> => {
    setLoading(true);
    setError(null);
    try {
      const result = await mcpRequest('tools/call', {
        name: 'skill_list',
        arguments: {},
      }) as { content?: { text: string }[] };
      const nodes = parseToolResult(result) as RegistryNode[];
      return nodes;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list skills';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * List all prompts via MCP.
   */
  const listPrompts = useCallback(async (): Promise<RegistryNode[]> => {
    setLoading(true);
    setError(null);
    try {
      const result = await mcpRequest('tools/call', {
        name: 'prompt_list',
        arguments: {},
      }) as { content?: { text: string }[] };
      const nodes = parseToolResult(result) as RegistryNode[];
      return nodes;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list prompts';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    listWorkflows,
    getWorkflow,
    generateExecutionPlan,
    listNodes,
    getResourceByArn,
    listAgents,
    listSkills,
    listPrompts,
  };
}
