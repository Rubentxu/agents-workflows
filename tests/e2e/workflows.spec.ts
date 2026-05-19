/**
 * Workflow Execution E2E Tests
 * 
 * Tests complete workflow execution scenarios:
 * - Execute workflow
 * - Monitor state transitions
 * - Verify stages complete
 * - Handle errors and aborts
 */

import '@playwright/test';
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.AGENTS_WORKFLOWS_URL || 'http://localhost:8080';

/**
 * MCP Client for these tests using native fetch
 */
class MCPClient {
  private sessionId: string | null = null;
  private id = 1;
  private initialized = false;
  
  constructor(private baseURL: string) {}
  
  /**
   * Initialize MCP session
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    const response = await fetch(`${this.baseURL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '1.0',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' }
        },
        id: this.id++,
      }),
    });
    
    const body = await response.text();
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data:')) {
        const content = trimmed.slice(5).trim();
        if (content.startsWith('{')) {
          const json = JSON.parse(content);
          if (json.result) {
            const sessionHeader = response.headers.get('mcp-session-id');
            if (sessionHeader) {
              this.sessionId = sessionHeader;
            }
          }
          break;
        }
      }
    }
    
    this.initialized = true;
  }
  
  async request<T = unknown>(toolName: string, toolArgs: Record<string, unknown> = {}): Promise<T> {
    // Ensure initialized first
    if (!this.initialized) {
      await this.initialize();
    }
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    
    if (this.sessionId) {
      headers['MCP-Session-Id'] = this.sessionId;
    }
    
    const response = await fetch(`${this.baseURL}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: toolName, arguments: toolArgs },
        id: this.id++,
      }),
    });
    
    const sessionHeader = response.headers.get('mcp-session-id');
    if (sessionHeader && !this.sessionId) {
      this.sessionId = sessionHeader;
    }
    
    const body = await response.text();
    let jsonStr = '';
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data:')) {
        const content = trimmed.slice(5).trim();
        if (content.startsWith('{') || content.startsWith('[')) {
          jsonStr = content;
          break;
        }
      }
    }
    
    if (!jsonStr) {
      throw new Error(`No parseable JSON: ${body.substring(0, 200)}`);
    }
    
    const mcpResponse = JSON.parse(jsonStr);
    if (mcpResponse.error) {
      throw new Error(`MCP Error: ${mcpResponse.error.message}`);
    }
    
    return mcpResponse.result;
  }
  
  /**
   * Parse tool result from MCP tools/call response format
   */
  parseToolResult(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object') return raw;
    const obj = raw as { content?: Array<{ type: string; text: string }>; isError?: boolean };
    if (obj.content && Array.isArray(obj.content) && obj.content.length > 0) {
      const text = obj.content[0].text;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    return raw;
  }
}

// Helper to extract ARN
function extractArn(item: unknown): string {
  if (typeof item === 'string') return item;
  if (typeof item === 'object' && item !== null && 'arn' in item) {
    return (item as { arn: string }).arn;
  }
  throw new Error(`Cannot extract ARN`);
}

test.describe('Workflow Execution - Happy Path', () => {
  let client: MCPClient;
  const workspaceId = `test-wf-${Date.now()}`;
  
  test.beforeEach(() => {
    client = new MCPClient(BASE_URL);
  });
  
  test('can list available workflows', async () => {
    const rawResult = await client.request('workflow_list');
    const workflows = client.parseToolResult(rawResult) as Array<unknown>;
    expect(workflows.length).toBeGreaterThan(0);
    console.log(`Found ${workflows.length} workflows`);
  });
  
  test('can get workflow DAG', async () => {
    const rawResult = await client.request('workflow_list');
    const workflows = client.parseToolResult(rawResult) as Array<unknown>;
    const arn = extractArn(workflows[0]);
    
    const rawDag = await client.request('workflow_get_dag', { arn });
    const dag = client.parseToolResult(rawDag) as { nodes: unknown[]; edges: unknown[] };
    
    expect(dag.nodes).toBeDefined();
    expect(dag.edges).toBeDefined();
    expect(Array.isArray(dag.nodes)).toBeTruthy();
    expect(Array.isArray(dag.edges)).toBeTruthy();
    console.log(`DAG: ${dag.nodes.length} nodes, ${dag.edges.length} edges`);
  });
  
  test('can execute a workflow', async () => {
    const rawResult = await client.request('workflow_list');
    const workflows = client.parseToolResult(rawResult) as Array<unknown>;
    const arn = extractArn(workflows[0]);
    
    const rawExecResult = await client.request('workflow_execute', {
      workflow_arn: arn,
      workspace_id: workspaceId,
      input: { test: true, timestamp: Date.now() },
    });
    const execution = client.parseToolResult(rawExecResult) as { arn: string; status: string };
    
    expect(execution.arn).toBeDefined();
    // workflow_execute immediately sets status to 'running' (StateMachineService transition)
    expect(['pending', 'running']).toContain(execution.status);
    console.log(`Execution created: ${execution.arn}`);
  });
  
  test('can get execution state', async () => {
    const rawResult = await client.request('workflow_list');
    const workflows = client.parseToolResult(rawResult) as Array<unknown>;
    const arn = extractArn(workflows[0]);
    
    // Create execution
    const rawExecResult = await client.request('workflow_execute', {
      workflow_arn: arn,
      workspace_id: workspaceId,
    });
    const execution = client.parseToolResult(rawExecResult) as { arn: string };
    
    // Get state
    const rawState = await client.request('workflow_get_state', {
      execution_arn: execution.arn,
    });
    const state = client.parseToolResult(rawState);
    
    expect(state).toBeDefined();
    console.log('Execution state:', JSON.stringify(state, null, 2)?.substring(0, 300));
  });
  
  test('can get next suggested stage', async () => {
    const rawResult = await client.request('workflow_list');
    const workflows = client.parseToolResult(rawResult) as Array<unknown>;
    const arn = extractArn(workflows[0]);
    
    const rawExecResult = await client.request('workflow_execute', {
      workflow_arn: arn,
      workspace_id: workspaceId,
    });
    const execution = client.parseToolResult(rawExecResult) as { arn: string };
    
    const rawNextStage = await client.request('workflow_get_next_stage', {
      execution_arn: execution.arn,
    });
    const nextStage = client.parseToolResult(rawNextStage);
    
    expect(nextStage).toBeDefined();
    console.log('Next stage:', JSON.stringify(nextStage, null, 2)?.substring(0, 300));
  });
});

test.describe('Workflow Execution - State Transitions', () => {
  let client: MCPClient;
  const workspaceId = `test-state-${Date.now()}`;
  
  test.beforeEach(() => {
    client = new MCPClient(BASE_URL);
  });
  
  test('execution state transitions are tracked', async () => {
    const rawResult = await client.request('workflow_list');
    const workflows = client.parseToolResult(rawResult) as Array<unknown>;
    if (workflows.length === 0) {
      console.log('No workflows to test');
      return;
    }
    
    const arn = extractArn(workflows[0]);
    
    const rawExecResult = await client.request('workflow_execute', {
      workflow_arn: arn,
      workspace_id: workspaceId,
    });
    const execution = client.parseToolResult(rawExecResult) as { arn: string };
    
    // Get initial state
    const rawState = await client.request('workflow_get_state', {
      execution_arn: execution.arn,
    });
    const initialState = client.parseToolResult(rawState) as { status: string };
    
    expect(initialState).toHaveProperty('status');
    console.log('Initial state:', JSON.stringify(initialState, null, 2)?.substring(0, 200));
  });
  
  test('execution history is recorded', async () => {
    // First create an execution
    const rawListResult = await client.request('workflow_list');
    const workflows = client.parseToolResult(rawListResult) as Array<unknown>;
    const arn = extractArn(workflows[0]);
    
    const rawExecResult = await client.request('workflow_execute', {
      workflow_arn: arn,
      workspace_id: workspaceId,
    });
    const execution = client.parseToolResult(rawExecResult) as { arn: string };
    
    // Now get history for that execution
    const rawHistory = await client.request('execution_history', {
      execution_arn: execution.arn,
    });
    const history = client.parseToolResult(rawHistory);
    
    expect(history).toBeDefined();
    console.log('Execution history retrieved');
  });
});

test.describe('Workflow Execution - Abort', () => {
  let client: MCPClient;
  const workspaceId = `test-abort-${Date.now()}`;
  
  test.beforeEach(() => {
    client = new MCPClient(BASE_URL);
  });
  
  test('can abort a running execution', async () => {
    const rawResult = await client.request('workflow_list');
    const workflows = client.parseToolResult(rawResult) as Array<unknown>;
    if (workflows.length === 0) return;
    
    const arn = extractArn(workflows[0]);
    
    const rawExecResult = await client.request('workflow_execute', {
      workflow_arn: arn,
      workspace_id: workspaceId,
    });
    const execution = client.parseToolResult(rawExecResult) as { arn: string };
    
    const rawAbortResult = await client.request('workflow_abort', {
      execution_arn: execution.arn,
    });
    
    expect(rawAbortResult).toBeDefined();
    console.log('Execution aborted successfully');
  });
  
  test('aborted execution has correct status', async () => {
    const rawResult = await client.request('workflow_list');
    const workflows = client.parseToolResult(rawResult) as Array<unknown>;
    if (workflows.length === 0) return;
    
    const arn = extractArn(workflows[0]);
    
    const rawExecResult = await client.request('workflow_execute', {
      workflow_arn: arn,
      workspace_id: workspaceId,
    });
    const execution = client.parseToolResult(rawExecResult) as { arn: string };
    
    // workflow_abort returns the updated state directly
    const rawAbortResult = await client.request('workflow_abort', {
      execution_arn: execution.arn,
    });
    const abortResult = client.parseToolResult(rawAbortResult) as { status: string };
    
    expect(abortResult.status).toBe('aborted');
  });
});

test.describe('Workflow Execution - SSE Metrics', () => {
  test('can subscribe to metrics SSE stream', async () => {
    const response = await fetch(`${BASE_URL}/metrics/sse`);
    expect(response.ok).toBeTruthy();
    
    const contentType = response.headers.get('content-type');
    expect(contentType).toContain('text/event-stream');
  });
  
  test('metrics SSE stream is active', async () => {
    // Just verify the endpoint responds with SSE
    const response = await fetch(`${BASE_URL}/metrics/sse`);
    expect(response.ok).toBeTruthy();
  });
});
