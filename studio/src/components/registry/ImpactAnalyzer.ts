/**
 * ImpactAnalyzer — interface for analyzing resource impact before destructive changes.
 *
 * Implementations:
 * - MockImpactAnalyzer: returns static mock data (dev/fast-feedback)
 * - McpImpactAnalyzer: calls MCP tools for real dependency analysis
 */

export interface ImpactItem {
  id: string;
  label: string;
  kind: string;
  arn: string;
}

export interface ImpactData {
  resourceArn: string;
  resourceName: string;
  resourceKind: string;
  severity: 'high' | 'medium' | 'low';
  dependents: ImpactItem[];
  affectedWorkspaces: string[];
  recentExecutions: Array<{ id: string; status: string; timestamp: string }>;
  derivedOverrides: ImpactItem[];
  policyEffects: string[];
}

/**
 * Interface for impact analysis.
 * Analyzes what would break if a resource is modified or deleted.
 */
export interface ImpactAnalyzer {
  /**
   * Analyze the impact of an action on a resource.
   * @param arn Full ARN of the resource
   * @param kind Resource kind (workflow, agent, skill, etc.)
   */
  analyze(arn: string, kind: string): Promise<ImpactData>;
}
