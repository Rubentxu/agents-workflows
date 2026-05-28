/**
 * WorkflowYamlEditor — full YAML raw editing tab for workflow manifest.
 * Part of the WorkflowEditor hybrid editing surface.
 *
 * YAML format matches the Kubernetes-inspired manifest:
 *   apiVersion: <workflow api version>
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
import { workflowToYaml, manifestToWorkflow } from '@/lib/workflowToYaml';
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
  }, [workflow, syncEnabled, editorRef, onYamlContentChange]);

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

  // Stable ready promise for tests — resolved when Monaco editor model is available.
  const modelReadyRef = useRef<Promise<void>>(Promise.resolve());
  const resolveModelReadyRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Create a new promise each time (in case of remount scenarios).
    modelReadyRef.current = new Promise<void>(resolve => { resolveModelReadyRef.current = resolve; });

    // If Monaco already mounted before this useEffect ran (onMount fires before useEffect),
    // resolve immediately so tests don't hang.
    if (editorRef?.current) {
      resolveModelReadyRef.current?.();
    }

    const editorKey = workflow?.arn;
    if (!editorKey) return;

    const globalWindow = window as typeof window & {
      __AW_MONACO_TEST__?: {
        workflowEditors?: Record<string, {
          setValue: (next: string) => void;
          getValue: () => string;
          getError: () => string | null;
          /** Resolves when Monaco editor model is ready. */
          ready: Promise<void>;
        }>;
      };
    };

    globalWindow.__AW_MONACO_TEST__ ??= {};
    globalWindow.__AW_MONACO_TEST__.workflowEditors ??= {};
    globalWindow.__AW_MONACO_TEST__.workflowEditors[editorKey] = {
      setValue: (next: string) => {
        handleYamlChange(next);
        // Also update Monaco's model directly so save() reads correct content.
        // handleYamlChange only updates React state/yamlContentRef;
        // Monaco's model isn't synced until the re-render propagates.
        // Try editorRef first, then fall back to window.monaco.
        let model = editorRef?.current?.getModel();
        if (!model) {
          const editors = (window as any).monaco?.editor?.getEditors?.();
          model = editors?.[0]?.getModel?.();
        }
        model?.setValue(next);
      },
      getValue: () => yamlContentRef.current,
      getError: () => parseError,
      ready: modelReadyRef.current,
    };

    return () => {
      delete globalWindow.__AW_MONACO_TEST__?.workflowEditors?.[editorKey];
    };
    // Use workflow as dependency (not workflow?.arn) to ensure re-registration
    // when workflow transitions from null → populated. The early return above
    // handles the case where workflow?.arn is not yet available.
  }, [handleYamlChange, parseError, workflow]);

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
          onReady={() => resolveModelReadyRef.current?.()}
        />
      </div>
    </div>
  );
}
