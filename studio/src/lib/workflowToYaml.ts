/**
 * workflowToYaml — shared utility for serializing a Workflow to YAML manifest.
 * Consolidated from duplicate implementations in WorkflowEditorPage and WorkflowYamlEditor.
 */

import * as yaml from 'js-yaml';
import type { Workflow } from '@/types/workflow';
import type { WorkflowManifest } from '@/types/manifest.workflow';
import { buildArn, KIND_TO_API_VERSION } from '@/types/manifest';

export function workflowToYaml(workflow: Workflow | null, scope?: string): string {
  if (!workflow) return '';
  const metadataScope = scope ?? workflow.scope ?? 'global';
  const manifest: WorkflowManifest = {
    apiVersion: KIND_TO_API_VERSION.Workflow,
    kind: 'Workflow',
    metadata: {
      uid: '',
      arn: buildArn(metadataScope, 'Workflow', workflow.name),
      name: workflow.name,
      scope: metadataScope,
      labels: workflow.labels,
      annotations: workflow.annotations,
    },
    spec: {
      description: workflow.description,
      stages: workflow.stages,
      agents: workflow.agents,
      skills: workflow.skills,
      execution: {
        mode: workflow.execution.mode,
        on_failure: workflow.execution.on_failure,
      } as WorkflowManifest['spec']['execution'],
      metrics: workflow.metrics as { streaming: boolean; interval_ms: number; channels: string[] },
    },
  };
  return yaml.dump(manifest, { indent: 2, lineWidth: -1, noRefs: true });
}

export function manifestToWorkflow(manifest: WorkflowManifest): Workflow {
  return {
    arn: `arn:local:${manifest.metadata.scope}:workflow/${manifest.metadata.name}`,
    name: manifest.metadata.name,
    scope: manifest.metadata.scope,
    version: '1.0',
    description: manifest.spec.description ?? '',
    labels: manifest.metadata.labels ?? {},
    annotations: manifest.metadata.annotations ?? {},
    agents: manifest.spec.agents ?? {},
    skills: manifest.spec.skills ?? {},
    stages: manifest.spec.stages ?? [],
    execution: {
      mode: (manifest.spec.execution?.mode as Workflow['execution']['mode']) ?? 'sequential',
      on_failure:
        (manifest.spec.execution?.on_failure as Workflow['execution']['on_failure'])
        ?? (manifest.spec.execution?.stop_on_error === false ? 'continue' : 'abort'),
    },
    metrics: manifest.spec.metrics ?? { streaming: false, interval_ms: 5000, channels: [] },
  };
}
