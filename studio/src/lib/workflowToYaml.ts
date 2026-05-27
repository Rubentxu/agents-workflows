/**
 * workflowToYaml — shared utility for serializing a Workflow to YAML manifest.
 * Consolidated from duplicate implementations in WorkflowEditorPage and WorkflowYamlEditor.
 */

import * as yaml from 'js-yaml';
import type { Workflow } from '@/types/workflow';
import type { WorkflowManifest } from '@/types/manifest.workflow';
import { API_VERSION } from '@/types/manifest';

export function workflowToYaml(workflow: Workflow | null): string {
  if (!workflow) return '';
  const manifest: WorkflowManifest = {
    apiVersion: API_VERSION,
    kind: 'Workflow',
    metadata: {
      uid: '',
      name: workflow.name,
      scope: 'global',
      labels: {},
      annotations: {},
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
    version: '1.0',
    description: manifest.spec.description ?? '',
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
