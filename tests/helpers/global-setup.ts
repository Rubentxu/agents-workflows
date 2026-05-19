/**
 * Global Setup - Runs before all tests
 * 
 * Responsibilities:
 * 1. Verify container is running
 * 2. Wait for service to be healthy
 * 3. Create isolated workspace for this test session
 */

import { chromium, request, FullConfig } from '@playwright/test';

const CONTAINER_NAME = process.env.CONTAINER_NAME || 'agents-workflows';
const BASE_URL = process.env.AGENTS_WORKFLOWS_URL || 'http://localhost:8080';
const REST_URL = process.env.AGENTS_WORKFLOWS_REST_URL || 'http://localhost:8081';

/**
 * Generate unique workspace ID for this test session
 */
function generateWorkspaceId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

async function globalSetup(config: FullConfig) {
  console.log('=== Global Setup ===');
  
  // Skip container check if SKIP_CONTAINER_CHECK env is set (for local development)
  if (process.env.SKIP_CONTAINER_CHECK !== '1') {
    // 1. Check if container is running
    console.log('Checking container status...');
    const { execSync } = await import('child_process');
    
    try {
      const result = execSync(
        `podman ps --filter name=${CONTAINER_NAME} --format "{{.Names}}"`,
        { encoding: 'utf8' }
      );
      
      if (!result.trim().includes(CONTAINER_NAME)) {
        throw new Error(`Container ${CONTAINER_NAME} is not running. Run: just test:container:up`);
      }
      console.log(`✓ Container ${CONTAINER_NAME} is running`);
    } catch (error) {
      throw new Error(
        `Container check failed. Start container with: just test:container:up\n` +
        `Error: ${error}`
      );
    }
  } else {
    console.log('Skipping container check (SKIP_CONTAINER_CHECK=1)');
  }
  
  // 2. Wait for service to be healthy
  console.log('Waiting for service to be healthy...');
  const maxRetries = 30;
  const retryDelay = 1000;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${REST_URL}/api/health`);
      if (response.ok) {
        const health = await response.json();
        console.log(`✓ Service healthy: ${JSON.stringify(health)}`);
        break;
      }
    } catch (error) {
      // Service not ready yet
    }
    
    if (i === maxRetries - 1) {
      throw new Error(`Service failed to become healthy after ${maxRetries} attempts`);
    }
    
    await new Promise(resolve => setTimeout(resolve, retryDelay));
  }
  
  // 3. Create isolated workspace for this session
  const workspaceId = generateWorkspaceId();
  process.env.TEST_WORKSPACE_ID = workspaceId;
  console.log(`✓ Created isolated workspace: ${workspaceId}`);
  
  // 4. Verify MCP endpoint is accessible
  console.log('Verifying MCP endpoint...');
  const apiContext = await request.newContext({
    baseURL: BASE_URL,
  });
  
  try {
    // First, send initialize request
    const initResponse = await apiContext.post('/mcp', {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      data: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'playwright-e2e', version: '1.0.0' }
        },
        id: 0,
      }),
    });
    
    // MCP may return 422 during validation - that's ok for verification
    console.log(`✓ MCP endpoint accessible (status: ${initResponse.status()})`);
  } finally {
    await apiContext.dispose();
  }
  
  console.log('=== Global Setup Complete ===\n');
}

export default globalSetup;
