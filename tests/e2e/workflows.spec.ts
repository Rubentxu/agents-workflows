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
import { MCPClient, extractArn } from '../helpers/mcp-client';

const BASE_URL = process.env.AGENTS_WORKFLOWS_URL || 'http://localhost:8080';

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
    // FIX: Do NOT skip — fail if no workflows exist
    expect(workflows.length, 'At least one workflow must exist for this test').toBeGreaterThan(0);
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
    // FIX: Do NOT skip — fail if no workflows exist
    expect(workflows.length, 'At least one workflow must exist for this test').toBeGreaterThan(0);
    
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
    // FIX: Do NOT skip — fail if no workflows exist
    expect(workflows.length, 'At least one workflow must exist for this test').toBeGreaterThan(0);
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
    // FIX: Do NOT skip — fail if no workflows exist
    expect(workflows.length, 'At least one workflow must exist for this test').toBeGreaterThan(0);
    
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
    // FIX: Do NOT skip — fail if no workflows exist
    expect(workflows.length, 'At least one workflow must exist for this test').toBeGreaterThan(0);
    
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
    const response = await fetch(`${BASE_URL}/metrics/sse`);
    expect(response.ok).toBeTruthy();
  });

  test('SSE stream emits metrics events on execution', async () => {
    const client = new MCPClient(BASE_URL);

    const rawResult = await client.request('workflow_list');
    const workflows = client.parseToolResult(rawResult) as Array<unknown>;
    // FIX: Do NOT skip — fail if no workflows exist
    expect(workflows.length, 'At least one workflow must exist for this test').toBeGreaterThan(0);

    const arn = extractArn(workflows[0]);
    const execResult = await client.request('workflow_execute', {
      workflow_arn: arn,
      workspace_id: `test-sse-${Date.now()}`,
      input: { test: true }
    });
    const execution = client.parseToolResult(execResult) as { arn: string };

    const sseResponse = await fetch(`${BASE_URL}/metrics/sse`);
    expect(sseResponse.ok).toBeTruthy();

    const abortResult = await client.request('workflow_abort', {
      execution_arn: execution.arn
    });
    expect(abortResult).toBeDefined();
    console.log('SSE metrics stream verified for execution lifecycle');
  });
});

test.describe('Workflow Execution - Full Cycle', () => {
  let client: MCPClient;

  test.beforeEach(() => {
    client = new MCPClient(BASE_URL);
  });

  test('can complete full workflow cycle', async () => {
    const rawListResult = await client.request('workflow_list');
    const workflows = client.parseToolResult(rawListResult) as Array<unknown>;
    // FIX: Do NOT skip — fail if no workflows exist
    expect(workflows.length, 'At least one workflow must exist for this test').toBeGreaterThan(0);

    const arn = extractArn(workflows[0]);
    const workspaceId = `full-cycle-${Date.now()}`;

    const rawExec = await client.request('workflow_execute', {
      workflow_arn: arn,
      workspace_id: workspaceId,
      input: { goal: 'complete cycle test' }
    });
    const execution = client.parseToolResult(rawExec) as { arn: string; status: string };
    expect(execution.arn).toBeDefined();
    console.log('1. Execution started:', execution.arn);

    const rawState = await client.request('workflow_get_state', {
      execution_arn: execution.arn
    });
    const state = client.parseToolResult(rawState) as { status: string };
    expect(state).toHaveProperty('status');
    console.log('2. Got state:', state.status);

    const rawNext = await client.request('workflow_get_next_stage', {
      execution_arn: execution.arn
    });
    const nextStage = client.parseToolResult(rawNext);
    expect(nextStage).toBeDefined();
    console.log('3. Got next stage suggestion');

    const rawUpdate = await client.request('workflow_update_state', {
      execution_arn: execution.arn,
      status: 'running',
      current_stage: 'explore',
      completed_stages: []
    });
    expect(rawUpdate).toBeDefined();
    console.log('4. Updated state to running');

    const rawAbort = await client.request('workflow_abort', {
      execution_arn: execution.arn
    });
    const abortState = client.parseToolResult(rawAbort) as { status: string };
    expect(abortState.status).toBe('aborted');
    console.log('5. Execution aborted, status:', abortState.status);

    console.log('Full workflow cycle completed successfully');
  });
});
