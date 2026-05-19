/**
 * WorkflowYamlEditor — full YAML raw editing tab for workflow manifest.
 * Part of the WorkflowEditor hybrid editing surface.
 *
 * YAML format matches the Kubernetes-inspired manifest:
 *   apiVersion: workflows.local/v1
 *   kind: Workflow
 *   metadata:
 *     name: ...
 *     scope: ...
 *   spec:
 *     stages: [...]
 *     execution: { mode: ... }
 */

import { useState, useCallback, useEffect } from 'react';
import yaml from 'js-yaml';
import type { Workflow } from '@/types/workflow';
import type { WorkflowManifest } from '@/types/manifest.workflow';
import { API_VERSION } from '@/types/manifest';

interface WorkflowYamlEditorProps {
  /** Internal Workflow object (arn, name, stages, etc.) */
  workflow: Workflow | null;
  /** Called with the parsed YAML, already converted to internal Workflow format */
  onChange: (updated: Workflow) => void;
}

/**
 * Convert a WorkflowManifest (YAML parse result) to the internal Workflow type.
 */
function manifestToWorkflow(manifest: WorkflowManifest): Workflow {
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
      stop_on_error: manifest.spec.execution?.stop_on_error ?? true,
    },
    metrics: manifest.spec.metrics ?? { streaming: false, interval_ms: 5000, channels: [] },
  };
}

/**
 * Serialize a Workflow (internal type) to a YAML manifest string.
 */
function workflowToYaml(workflow: Workflow | null): string {
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
      execution: workflow.execution as unknown as { mode: string; stop_on_error: boolean },
      metrics: workflow.metrics as { streaming: boolean; interval_ms: number; channels: string[] },
    },
  };
  return yaml.dump(manifest, { indent: 2, lineWidth: -1, noRefs: true });
}

export function WorkflowYamlEditor({ workflow, onChange }: WorkflowYamlEditorProps) {
  const [yamlContent, setYamlContent] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    setYamlContent(workflowToYaml(workflow));
    setParseError(null);
  }, [workflow]);

  const handleApply = useCallback(() => {
    try {
      const parsed = yaml.load(yamlContent) as WorkflowManifest;
      if (!parsed || typeof parsed !== 'object') {
        setParseError('Invalid YAML: not a valid workflow manifest');
        return;
      }
      if (!parsed.apiVersion || !parsed.kind || !parsed.metadata || !parsed.spec) {
        setParseError('Invalid workflow manifest: missing required fields (apiVersion, kind, metadata, spec)');
        return;
      }
      if (parsed.kind !== 'Workflow') {
        setParseError(`Expected kind 'Workflow', got '${parsed.kind}'`);
        return;
      }
      setParseError(null);
      const internalWorkflow = manifestToWorkflow(parsed);
      onChange(internalWorkflow);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid YAML syntax';
      setParseError(msg);
    }
  }, [yamlContent, onChange]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-outline-variant bg-surface-container/30">
        <div className="flex items-center gap-2">
          <span className="text-xs text-secondary">Raw YAML</span>
          {parseError && (
            <span className="text-[10px] text-error">• {parseError}</span>
          )}
        </div>
        <button
          onClick={handleApply}
          disabled={!!parseError}
          className="px-3 py-1 text-xs bg-primary text-on-primary rounded hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Apply changes
        </button>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto p-4">
        <textarea
          value={yamlContent}
          onChange={(e) => setYamlContent(e.target.value)}
          className="w-full h-full min-h-[400px] text-xs font-mono bg-surface-container border border-outline-variant rounded px-4 py-3 text-on-surface outline-none focus:border-primary resize-none leading-relaxed"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
