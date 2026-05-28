import { useMemo, useState } from 'react';
import { buildArn } from '@/types/manifest';
import type { Workflow } from '@/types/workflow';

interface WorkflowMetadataPanelProps {
  workflow: Workflow;
  onChange: (workflow: Workflow) => void;
}

function slugifyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function KeyValueEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const entries = Object.entries(value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-secondary">{label}</label>
        <button
          type="button"
          onClick={() => onChange({ ...value, '': '' })}
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          Add
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-outline px-3 py-2 text-xs text-secondary">
          No {label.toLowerCase()} yet.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(([entryKey, entryValue], index) => (
            <div key={`${entryKey}-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <input
                type="text"
                value={entryKey}
                onChange={(e) => {
                  const next = { ...value };
                  delete next[entryKey];
                  next[e.target.value] = entryValue;
                  onChange(next);
                }}
                placeholder="key"
                className="min-w-0 rounded-lg border border-outline bg-surface px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
              />
              <input
                type="text"
                value={entryValue}
                onChange={(e) => onChange({ ...value, [entryKey]: e.target.value })}
                placeholder="value"
                className="min-w-0 rounded-lg border border-outline bg-surface px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => {
                  const next = { ...value };
                  delete next[entryKey];
                  onChange(next);
                }}
                className="rounded-lg border border-outline px-3 py-2 text-xs text-secondary hover:border-primary hover:text-on-surface transition-colors"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkflowMetadataPanel({ workflow, onChange }: WorkflowMetadataPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const nameIsValid = /^[a-z0-9-]+$/.test(workflow.name);
  const arn = useMemo(() => buildArn(workflow.scope, 'Workflow', workflow.name), [workflow.scope, workflow.name]);

  const updateWorkflow = (patch: Partial<Workflow>) => {
    onChange({ ...workflow, ...patch, arn: patch.name ? buildArn(workflow.scope, 'Workflow', patch.name) : arn });
  };

  return (
    <section className="border-b border-outline-variant bg-surface">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div>
          <h2 className="text-sm font-semibold text-on-surface">Workflow Metadata</h2>
          <p className="text-xs text-secondary">Identity, manifest metadata, and workflow-level execution defaults.</p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="rounded-lg border border-outline px-3 py-1.5 text-xs text-secondary hover:border-primary hover:text-on-surface transition-colors"
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {!collapsed && (
        <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2 sm:px-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="workflow-name" className="mb-1 block text-xs font-medium text-secondary">Workflow Name</label>
              <input
                id="workflow-name"
                type="text"
                value={workflow.name}
                onChange={(e) => updateWorkflow({ name: slugifyName(e.target.value) })}
                className={`w-full rounded-lg border bg-surface px-3 py-2 text-sm text-on-surface outline-none focus:border-primary ${
                  nameIsValid ? 'border-outline' : 'border-error'
                }`}
              />
              <p className={`mt-1 text-[11px] ${nameIsValid ? 'text-secondary' : 'text-error'}`}>
                Use lowercase slug format: `a-z`, `0-9`, and `-` only.
              </p>
            </div>

            <div>
              <span className="mb-1 block text-xs font-medium text-secondary">Scope</span>
              <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {workflow.scope}
              </span>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">ARN</label>
              <div className="flex items-center gap-2 rounded-lg border border-outline bg-surface-container/30 px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-secondary">{arn}</span>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(arn);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1200);
                  }}
                  className="rounded-md border border-outline px-2 py-1 text-[11px] text-secondary hover:border-primary hover:text-on-surface transition-colors"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="workflow-description" className="mb-1 block text-xs font-medium text-secondary">Description</label>
              <textarea
                id="workflow-description"
                value={workflow.description}
                onChange={(e) => updateWorkflow({ description: e.target.value })}
                rows={4}
                className="w-full resize-none rounded-lg border border-outline bg-surface px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="workflow-execution-mode" className="mb-1 block text-xs font-medium text-secondary">Execution Mode</label>
                <select
                  id="workflow-execution-mode"
                  value={workflow.execution.mode}
                  onChange={(e) => updateWorkflow({ execution: { ...workflow.execution, mode: e.target.value as Workflow['execution']['mode'] } })}
                  className="w-full rounded-lg border border-outline bg-surface px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
                >
                  <option value="sequential">Sequential</option>
                  <option value="parallel">Parallel</option>
                </select>
              </div>

              <div>
                <label htmlFor="workflow-on-failure" className="mb-1 block text-xs font-medium text-secondary">On Failure</label>
                <select
                  id="workflow-on-failure"
                  value={workflow.execution.on_failure}
                  onChange={(e) => updateWorkflow({ execution: { ...workflow.execution, on_failure: e.target.value as Workflow['execution']['on_failure'] } })}
                  className="w-full rounded-lg border border-outline bg-surface px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
                >
                  <option value="abort">Abort</option>
                  <option value="continue">Continue</option>
                  <option value="retry">Retry</option>
                </select>
              </div>
            </div>

            <KeyValueEditor
              label="Labels"
              value={workflow.labels}
              onChange={(labels) => updateWorkflow({ labels })}
            />

            <KeyValueEditor
              label="Annotations"
              value={workflow.annotations}
              onChange={(annotations) => updateWorkflow({ annotations })}
            />
          </div>
        </div>
      )}
    </section>
  );
}
