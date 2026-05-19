/**
 * ResourceComposer — modal wizard for creating any agentic resource.
 * Follows the steps defined in docs/studio-redesign.md:
 * 1. Choose kind
 * 2. Choose scope
 * 3. Choose template
 * 4. Fill metadata
 * 5. Fill spec form
 * 6. Review YAML
 * 7. Create resource
 */

import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useResourceApi } from '@/hooks/useResourceApi';
import type { ResourceKind } from '@/types';

export type CreationPath = 'template' | 'blank' | 'duplicate' | 'override';

export interface ComposerState {
  step: number;
  kind: ResourceKind | null;
  scope: string;
  name: string;
  creationPath: CreationPath;
  templateArn: string | null;
  overrideSourceArn: string | null;
  yamlContent: string;
}

interface ResourceComposerProps {
  onClose: () => void;
  initialArn?: string; // For duplicate/override source
}

const KINDS: { value: ResourceKind; label: string }[] = [
  { value: 'Workflow', label: 'Workflow' },
  { value: 'Agent', label: 'Agent' },
  { value: 'Skill', label: 'Skill' },
  { value: 'Prompt', label: 'Prompt' },
  { value: 'Tool', label: 'Tool' },
  { value: 'Template', label: 'Template' },
  { value: 'Policy', label: 'Policy' },
];

export function ResourceComposer({ onClose, initialArn }: ResourceComposerProps) {
  const { projectId } = useParams();

  const [state, setState] = useState<ComposerState>({
    step: 1,
    kind: null,
    scope: projectId ? `project/${projectId}` : 'global',
    name: '',
    creationPath: 'blank',
    templateArn: null,
    overrideSourceArn: initialArn ?? null,
    yamlContent: '',
  });

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { createResource } = useResourceApi();

  const goToStep = useCallback((step: number) => {
    setState((s) => ({ ...s, step }));
  }, []);

  const setKind = useCallback((kind: ResourceKind) => {
    setState((s) => ({ ...s, kind, step: s.kind ? s.step : 2 }));
  }, []);

  const generateYaml = useCallback(() => {
    if (!state.kind || !state.name) return '';
    const apiVersion = 'workflows.local/v1';
    return `apiVersion: ${apiVersion}
kind: ${state.kind}
metadata:
  name: ${state.name}
  scope: ${state.scope}
  labels: {}
  annotations: {}
spec: {}
`;
  }, [state.kind, state.name, state.scope]);

  const handleCreate = useCallback(async () => {
    if (!state.kind || !state.name) return;
    setCreating(true);
    setError(null);
    try {
      const yaml = state.yamlContent || generateYaml();
      // Parse YAML to extract the body for the API
      // For now, send the YAML as a string — the backend will parse it
      const body = {
        yaml,
        name: state.name,
        scope: state.scope,
      };
      const kindPlural = state.kind.toLowerCase() + 's';
      const arn = await createResource(kindPlural, body);
      if (!arn) {
        throw new Error('Failed to create resource — server returned no ARN');
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create resource');
    } finally {
      setCreating(false);
    }
  }, [state.kind, state.name, state.scope, state.yamlContent, generateYaml, createResource, onClose]);

  const yaml = state.step >= 6 ? generateYaml() : '';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl bg-bg-surface border border-border-default rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Create Resource</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Step {state.step} of 6
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* Step progress */}
        <div className="flex px-6 py-2 gap-1 bg-bg-elevated/30">
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= state.step ? 'bg-accent' : 'bg-border-subtle'
              }`}
            />
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-accent-error/10 border border-accent-error/20 rounded text-accent-error text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Choose kind */}
          {state.step === 1 && (
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Choose resource kind</h3>
              <div className="grid grid-cols-3 gap-2">
                {KINDS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setKind(value)}
                    className={`p-3 border rounded-lg text-left transition-all ${
                      state.kind === value
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border-subtle hover:border-accent/50 text-text-primary'
                    }`}
                  >
                    <div className="font-medium text-sm">{label}</div>
                    <div className="text-xs text-text-muted mt-0.5">{value}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Choose creation path */}
          {state.step === 2 && (
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">How do you want to create this {state.kind}?</h3>
              <div className="space-y-2">
                {[
                  { value: 'blank', label: 'Blank manifest', desc: 'Start from scratch with a minimal manifest' },
                  { value: 'template', label: 'From template', desc: 'Use a predefined template' },
                  { value: 'duplicate', label: 'Duplicate existing', desc: 'Copy an existing resource as a starting point' },
                  { value: 'override', label: 'Override inherited', desc: 'Customize an inherited resource for this scope' },
                ].map(({ value, label, desc }) => (
                  <button
                    key={value}
                    onClick={() => setState((s) => ({ ...s, creationPath: value as CreationPath, step: value === 'override' || value === 'duplicate' ? 3 : 3 }))}
                    className={`w-full flex items-start gap-3 p-4 border rounded-lg text-left transition-all ${
                      state.creationPath === value
                        ? 'border-accent bg-accent/10'
                        : 'border-border-subtle hover:border-accent/50'
                    }`}
                  >
                    <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                      state.creationPath === value ? 'border-accent bg-accent' : 'border-border-default'
                    }`} />
                    <div>
                      <div className="font-medium text-sm text-text-primary">{label}</div>
                      <div className="text-xs text-text-muted mt-0.5">{desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Fill metadata */}
          {state.step === 3 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-text-primary">Fill metadata</h3>

              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Name *</label>
                <input
                  type="text"
                  value={state.name}
                  onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
                  placeholder="e.g. my-workflow"
                  className="w-full text-sm bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary placeholder-text-muted outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Scope</label>
                <select
                  value={state.scope}
                  onChange={(e) => setState((s) => ({ ...s, scope: e.target.value }))}
                  className="w-full text-sm bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-secondary outline-none focus:border-accent"
                >
                  <option value="global">global</option>
                  {projectId && <option value={`project/${projectId}`}>project/{projectId}</option>}
                </select>
              </div>

              {state.creationPath === 'override' && (
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Override source ARN</label>
                  <input
                    type="text"
                    value={state.overrideSourceArn ?? ''}
                    onChange={(e) => setState((s) => ({ ...s, overrideSourceArn: e.target.value }))}
                    placeholder="arn:local:global:..."
                    className="w-full text-sm bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary placeholder-text-muted outline-none focus:border-accent font-mono"
                  />
                </div>
              )}
            </div>
          )}

          {/* Step 4: Spec form placeholder */}
          {state.step === 4 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-text-primary">Configure spec</h3>
              <p className="text-xs text-text-muted">Spec editing UI for {state.kind} will appear here.</p>
              <div className="bg-bg-elevated border border-border-subtle rounded-lg p-4 text-xs text-text-muted">
                This step would show a kind-specific form or YAML editor for the spec section.
              </div>
            </div>
          )}

          {/* Step 5: Review YAML */}
          {state.step === 5 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-text-primary">Review and edit YAML</h3>
              <p className="text-xs text-text-muted">Review the manifest before creating. You can edit the YAML directly.</p>
              <textarea
                value={yaml}
                onChange={(e) => setState((s) => ({ ...s, yamlContent: e.target.value }))}
                className="w-full h-64 text-xs font-mono bg-bg-elevated border border-border-subtle rounded px-3 py-2 text-text-primary outline-none focus:border-accent resize-none"
                spellCheck={false}
              />
            </div>
          )}

          {/* Step 6: Confirm creation */}
          {state.step === 6 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-text-primary">Confirm creation</h3>
              <div className="bg-bg-elevated border border-border-subtle rounded-lg p-4">
                <div className="text-xs space-y-1">
                  <div><span className="text-text-muted">Kind:</span> <span className="text-text-primary font-medium">{state.kind}</span></div>
                  <div><span className="text-text-muted">Name:</span> <span className="text-text-primary font-medium">{state.name}</span></div>
                  <div><span className="text-text-muted">Scope:</span> <span className="text-text-primary font-medium">{state.scope}</span></div>
                  <div><span className="text-text-muted">ARN will be:</span> <span className="text-text-primary font-mono">arn:local:{state.scope}:{state.kind?.toLowerCase()}/{state.name}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-subtle bg-bg-elevated/30">
          <button
            onClick={() => state.step > 1 ? goToStep(state.step - 1) : onClose()}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            {state.step === 1 ? 'Cancel' : 'Back'}
          </button>

          {state.step < 6 ? (
            <button
              onClick={() => goToStep(state.step + 1)}
              disabled={
                (state.step === 1 && !state.kind) ||
                (state.step === 3 && !state.name)
              }
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create resource'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
