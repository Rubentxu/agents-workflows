/**
 * MCP Client Helper for E2E Tests
 * 
 * Provides typed interface to MCP protocol over HTTP.
 * Based on the existing e2e.rs implementation but in TypeScript.
 */

export interface MCPRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id: number;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Parse SSE response and extract JSON-RPC result
 */
function parseSSEResponse(body: string): string {
  const lines = body.split('\n');
  let jsonBuffer = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('id:') || trimmed.startsWith('retry:')) {
      continue;
    }
    if (trimmed.startsWith('data:')) {
      const jsonStr = trimmed.slice(5).trim();
      if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
        jsonBuffer = jsonStr;
        break;
      }
    } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      jsonBuffer = trimmed;
      break;
    }
  }
  
  if (!jsonBuffer) {
    throw new Error(`No parseable JSON in SSE response: ${body.substring(0, 200)}`);
  }
  
  return jsonBuffer;
}

/**
 * MCP Client for TypeScript tests using native fetch
 */
export class MCPClient {
  private baseURL: string;
  private sessionId: string | null = null;
  private initialized = false;
  private requestId = 1;
  
  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }
  
  /**
   * Send raw MCP request with session tracking
   */
  private async rawRequest<T = unknown>(
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    const id = this.requestId++;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    
    // Send session ID if we have one
    if (this.sessionId) {
      headers['MCP-Session-Id'] = this.sessionId;
    }
    
    const response = await fetch(`${this.baseURL}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id,
      } satisfies MCPRequest),
    });
    
    // Capture session ID from response header
    const sessionHeader = response.headers.get('mcp-session-id');
    if (sessionHeader) {
      this.sessionId = sessionHeader;
    }
    
    const body = await response.text();
    const jsonStr = parseSSEResponse(body);
    const mcpResponse = JSON.parse(jsonStr) as MCPResponse;
    
    if (mcpResponse.error) {
      throw new Error(`MCP Error ${mcpResponse.error.code}: ${mcpResponse.error.message}`);
    }
    
    return mcpResponse.result as T;
  }
  
  /**
   * Initialize the MCP session
   */
  async initialize(): Promise<void> {
    await this.rawRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'playwright-e2e', version: '1.0.0' }
    });
    this.initialized = true;
  }
  
  /**
   * Call an MCP tool by name
   */
  async callTool<T = unknown>(toolName: string, toolArgs: Record<string, unknown> = {}): Promise<T> {
    // Ensure initialized first
    if (!this.initialized) {
      await this.initialize();
    }
    return this.rawRequest<T>('tools/call', { name: toolName, arguments: toolArgs });
  }
  
  /**
   * Convenience method for listing workflows
   */
  async workflow_list<T = unknown>(): Promise<T> {
    return this.callTool<T>('workflow_list', {});
  }
  
  /**
   * Convenience method for getting a workflow
   */
  async workflow_get<T = unknown>(arn: string): Promise<T> {
    return this.callTool<T>('workflow_get', { arn });
  }
  
  /**
   * Request - uses tools/call for tool invocations
   */
  async request<T = unknown>(
    toolName: string,
    toolArgs: Record<string, unknown> = {}
  ): Promise<T> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.rawRequest<T>('tools/call', { name: toolName, arguments: toolArgs });
  }
  
  /**
   * Helper to wait (for use in test flows)
   */
  async waitForTimeout(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract text content from MCP tool result
   */
  parseToolResult(result: unknown): unknown {
    if (typeof result !== 'object' || result === null) {
      return result;
    }
    
    const obj = result as Record<string, unknown>;
    
    if (obj.content && Array.isArray(obj.content)) {
      const first = obj.content[0] as Record<string, unknown>;
      if (first && first.type === 'text' && typeof first.text === 'string') {
        try {
          return JSON.parse(first.text);
        } catch {
          return first.text;
        }
      }
    }
    
    return result;
  }
}

export function extractArn(item: unknown): string {
  if (typeof item === 'string') return item;
  if (typeof item === 'object' && item !== null && 'arn' in item) {
    return (item as { arn: string }).arn;
  }
  throw new Error('Cannot extract ARN');
}
