/**
 * mcpClient — low-level JSON-RPC communication with the MCP server.
 * Pure functions with no React dependencies.
 */

const MCP_API = '/mcp';

interface McpRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id: number;
}

interface McpResponse {
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
 * Send a JSON-RPC request to the MCP server.
 * Handles both JSON responses and SSE streams.
 */
export async function mcpRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
  const id = Math.floor(Math.random() * 1000000);
  const request: McpRequest = { jsonrpc: '2.0', method, params, id };

  const response = await fetch(MCP_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`MCP request failed: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (data && data !== '') {
            const parsed = JSON.parse(data);
            if (parsed.id === id) {
              return parsed.result;
            }
          }
        }
      }
    }

    throw new Error('No matching response received');
  }

  const text = await response.text();
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data:')) {
      const data = line.slice(5).trim();
      if (data && data !== '') {
        const parsed = JSON.parse(data) as McpResponse;
        if (parsed.id === id) {
          if (parsed.error) {
            throw new Error(`MCP error: ${parsed.error.message}`);
          }
          return parsed.result;
        }
      }
    }
  }

  throw new Error('No matching response received');
}

/**
 * Parse JSON from MCP tool result text content.
 */
export function parseToolResult(result: unknown, fallback: string = '[]'): unknown {
  if (!result) return JSON.parse(fallback);
  const r = result as { content?: { text: string }[] };
  const text = r?.content?.[0]?.text || fallback;
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(fallback);
  }
}

/**
 * Determine MCP tool name from ARN resource type.
 */
export function arnToTool(type: string): string {
  switch (type) {
    case 'workflow': return 'workflow_get';
    case 'agent': return 'agent_get';
    case 'skill': return 'skill_get';
    case 'prompt': return 'prompt_get';
    default: throw new Error(`Unknown resource type: ${type}`);
  }
}
