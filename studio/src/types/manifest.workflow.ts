/**
 * Workflow manifest spec.
 * A Workflow is a DAG of stages with conditions and execution configuration.
 * See docs/studio-redesign.md for the full design rationale.
 *
 * Types shared with runtime (Stage, AgentDefinition, SkillReference, etc.) are
 * defined in types/workflow.ts. This module only defines manifest-specific types:
 * WorkflowSpec and WorkflowManifest, and re-exports the shared ones.
 */

import type { Manifest } from './manifest';
import type {
  Stage,
  AgentDefinition,
  SkillReference,
} from './workflow';

// Re-export shared types from workflow.ts (single source of truth)
export type { Stage, AgentDefinition, SkillReference } from './workflow';

// StageExecutionMode is manifest-specific (not in workflow.ts)
export type StageExecutionMode = 'sequential' | 'parallel' | 'batch';

export interface WorkflowSpec {
  description?: string;
  stages: Stage[];
  agents?: Record<string, AgentDefinition>;
  skills?: Record<string, SkillReference>;
  execution: {
    mode: string;
    stop_on_error?: boolean;
    on_failure?: 'abort' | 'continue' | 'retry';
  };
  metrics?: {
    streaming: boolean;
    interval_ms: number;
    channels: string[];
  };
}

export type WorkflowManifest = Manifest<'Workflow'> & {
  spec: WorkflowSpec;
};

export const WORKFLOW_KIND = 'Workflow' as const;
export type WorkflowKind = typeof WORKFLOW_KIND;
