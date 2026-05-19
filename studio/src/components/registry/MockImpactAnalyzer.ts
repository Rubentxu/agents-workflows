/**
 * MockImpactAnalyzer — returns static, fast mock impact data.
 * Use in development or when the MCP backend doesn't support impact analysis.
 */

import type { ImpactAnalyzer, ImpactData } from './ImpactAnalyzer';

export class MockImpactAnalyzer implements ImpactAnalyzer {
  async analyze(arn: string, kind: string): Promise<ImpactData> {
    // Simulate async fetch
    await new Promise((r) => setTimeout(r, 200));

    const name = arn.split('/').pop() ?? arn;
    const isGlobal = arn.includes('global');

    return {
      resourceArn: arn,
      resourceName: name,
      resourceKind: kind,
      severity: isGlobal ? 'high' : 'medium',
      dependents: [
        { id: 'wf-1', label: 'sdd-full', kind: 'workflow', arn: 'arn:local:global:workflow/sdd-full' },
        { id: 'ag-1', label: 'orchestrator', kind: 'agent', arn: 'arn:local:global:agent/orchestrator' },
      ],
      affectedWorkspaces: isGlobal
        ? ['workspace/dev', 'workspace/staging', 'workspace/prod']
        : ['workspace/dev'],
      recentExecutions: [
        { id: 'exec-001', status: 'completed', timestamp: new Date().toISOString() },
        { id: 'exec-002', status: 'failed', timestamp: new Date(Date.now() - 3600_000).toISOString() },
      ],
      derivedOverrides: [],
      policyEffects: ['Policy "require-review" will trigger for this change'],
    };
  }
}
