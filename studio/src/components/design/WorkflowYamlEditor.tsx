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

import { useState, useCallback, useEffect, useRef } from 'react';
import yaml from 'js-yaml';
import type * as Monaco from 'monaco-editor';
import type { Workflow } from '@/types/workflow';
import type { WorkflowManifest } from '@/types/manifest.workflow';
import { API_VERSION } from '@/types/manifest';
import { YamlMonacoEditor } from '@/components/monaco';
import type { Diagnostic } from '@/components/monaco/YamlMonacoEditor';

interface WorkflowYamlEditorProps {
  /** Internal Workflow object (arn, name, stages, etc.) */
  workflow: Workflow | null;
  /** JSON Schema for validation */
  schema?: object;
  /** Called when yamlContent changes so parent can sync on tab switch */
  onYamlContentChange?: (content: string) => void;
  /**
   * Called when YAML parses to a valid manifest.
   * Parent uses this to update workflow state from YAML edits (YAML → visual path).
   */
  onWorkflowChange?: (workflow: Workflow) => void;
  /** Enable unidirectional sync: canvas → Monaco (default: true) */
  syncEnabled?: boolean;
  /** Ref to the Monaco editor instance for programmatic model updates */
  editorRef?: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
  /** Render as read-only when used as a serialization panel */
  readOnly?: boolean;
}

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
      execution: workflow.execution as unknown as { mode: string; stop_on_error: boolean },
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
      stop_on_error: manifest.spec.execution?.stop_on_error ?? true,
    },
    metrics: manifest.spec.metrics ?? { streaming: false, interval_ms: 5000, channels: [] },
  };
}

export function WorkflowYamlEditor({
  workflow,
  schema,
  onYamlContentChange,
  onWorkflowChange,
  syncEnabled = true,
  editorRef,
  readOnly = false,
}: WorkflowYamlEditorProps) {
  const [yamlContent, setYamlContent] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);

  // Ref to track current YAML content (for external readers)
  const yamlContentRef = useRef('');
  // Ref to prevent sync loops: true when the change originated from Monaco user editing
  // This prevents canvas→Monaco sync from triggering when user manually edits YAML
  const isExternalUpdateRef = useRef(false);

  // Sync: canvas (workflow.stages) → Monaco content
  // Uses setValue() to update Monaco model directly without triggering onChange
  useEffect(() => {
    if (!syncEnabled) return;
    const newYaml = workflowToYaml(workflow);
    yamlContentRef.current = newYaml;

    // Use editor model setValue to update Monaco content programmatically
    // This does NOT trigger onChange callback, preventing feedback loops
    const model = editorRef?.current?.getModel();
    if (model) {
      model.setValue(newYaml);
    } else {
      // Fallback: update state (will trigger Monaco re-render via value prop)
      setYamlContent(newYaml);
    }
    setParseError(null);
    onYamlContentChange?.(newYaml);
  }, [workflow?.stages, syncEnabled]); // Only react to stages changes, not entire workflow

  const handleYamlChange = useCallback((newValue: string) => {
    // Mark that this change came from Monaco user editing
    isExternalUpdateRef.current = true;
    yamlContentRef.current = newValue;
    setYamlContent(newValue);
    onYamlContentChange?.(newValue);

    // Try to parse and propagate valid workflow to parent (YAML → visual path)
    try {
      const parsed = yaml.load(newValue) as WorkflowManifest | undefined;
      if (parsed && parsed.kind === 'Workflow' && parsed.spec) {
        const wf = manifestToWorkflow(parsed);
        onWorkflowChange?.(wf);
      }
    } catch {
      // Invalid YAML — diagnostics already show the error; do not corrupt visual state
    }
  }, [onYamlContentChange, onWorkflowChange]);

  const handleDiagnosticsChange = useCallback((newDiagnostics: Diagnostic[]) => {
    setDiagnostics(newDiagnostics);
    const errors = newDiagnostics.filter((d) => d.severity === 'error');
    if (errors.length > 0) {
      setParseError(errors[0].message);
    } else {
      setParseError(null);
    }
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-outline-variant bg-surface-container/30">
        <div className="flex items-center gap-2">
          <span className="text-xs text-secondary">Raw YAML</span>
          {parseError && (
            <span className="text-[10px] text-error">• {parseError}</span>
          )}
          {diagnostics.length > 0 && !parseError && (
            <span className="text-[10px] text-warning">
              • {diagnostics.length} warning{diagnostics.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <YamlMonacoEditor
          value={yamlContent}
          onChange={handleYamlChange}
          onDiagnosticsChange={handleDiagnosticsChange}
          schema={schema}
          height="100%"
          editorRef={editorRef}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
