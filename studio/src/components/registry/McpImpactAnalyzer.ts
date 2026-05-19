/**
 * McpImpactAnalyzer — production analyzer using MCP tools.
 * Calls the MCP server to gather real dependency and execution data.
 */

import type { ImpactAnalyzer, ImpactData } from './ImpactAnalyzer';
import { mcpRequest, parseToolResult } from '@/hooks/mcpClient';

export class McpImpactAnalyzer implements ImpactAnalyzer {
  async analyze(arn: string, kind: string): Promise<ImpactData> {
    try {
      const result = await mcpRequest('tools/call', {
        name: 'analyze_impact',
        arguments: { arn, kind },
      }) as { content?: { text: string }[] };

      const data = parseToolResult(result, '{}') as ImpactData;
      return data;
    } catch {
      // Fallback to basic data on error
      const name = arn.split('/').pop() ?? arn;
      return {
        resourceArn: arn,
        resourceName: name,
        resourceKind: kind,
        severity: 'medium',
        dependents: [],
        affectedWorkspaces: [],
        recentExecutions: [],
        derivedOverrides: [],
        policyEffects: ['Unable to determine policy effects — MCP call failed'],
      };
    }
  }
}
