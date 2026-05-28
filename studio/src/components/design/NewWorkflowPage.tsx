import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { buildArn } from '@/types/manifest';
import { WORKFLOW_TEMPLATES } from '@/lib/workflowTemplates';

type ScopeOption = {
  id: string;
  label: string;
  value: string;
  description: string;
};

function slugifyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getAvailableScopes(projectId?: string, workspaceId?: string): ScopeOption[] {
  const options: ScopeOption[] = [
    {
      id: 'global',
      label: 'Global',
      value: 'global',
      description: 'Shared across all projects and workspaces.',
    },
  ];

  if (projectId) {
    options.push({
      id: 'project',
      label: 'Project',
      value: `project/${projectId}`,
      description: `Scoped to project ${projectId}.`,
    });
  }

  if (workspaceId) {
    options.push({
      id: 'workspace',
      label: 'Workspace',
      value: `workspace/${workspaceId}`,
      description: `Scoped to workspace ${workspaceId}.`,
    });
  }

  return options;
}

export function NewWorkflowPage() {
  const { projectId, workspaceId } = useParams();
  const navigate = useNavigate();
  const scopes = useMemo(() => getAvailableScopes(projectId, workspaceId), [projectId, workspaceId]);

  const [step, setStep] = useState(1);
  const [scope, setScope] = useState(scopes[scopes.length - 1]?.value ?? 'global');
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('full-sdd');
  const nameIsValid = /^[a-z0-9-]+$/.test(name) && name.length > 0;
  const template = WORKFLOW_TEMPLATES.find((item) => item.id === templateId) ?? WORKFLOW_TEMPLATES[0];
  const arnPreview = buildArn(scope, 'Workflow', name || 'workflow-name');

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => navigate(`/studio/projects/${projectId}/design/workflows`)}
            className="mb-3 text-sm text-secondary hover:text-on-surface transition-colors"
          >
            ← Workflows
          </button>
          <h1 className="text-2xl font-semibold text-on-surface">Create Workflow</h1>
          <p className="mt-1 text-sm text-secondary">Define identity first, choose a starting path, then open the editor with a prebuilt scaffold.</p>
        </div>
        <div className="hidden rounded-2xl border border-outline bg-surface-container/30 px-4 py-3 text-right sm:block">
          <div className="text-xs uppercase tracking-wide text-secondary">Step {step} of 3</div>
          <div className="mt-1 text-sm font-medium text-on-surface">{step === 1 ? 'Scope + Name' : step === 2 ? 'Choose Template' : 'Confirm + Open Editor'}</div>
        </div>
      </div>

      <div className="mb-6 grid gap-2 sm:grid-cols-3">
        {['Scope + Name', 'Choose Template', 'Confirm + Open Editor'].map((label, index) => (
          <div
            key={label}
            className={`rounded-xl border px-4 py-3 text-sm transition-colors ${
              step === index + 1 ? 'border-primary bg-primary/10 text-on-surface' : 'border-outline bg-surface text-secondary'
            }`}
          >
            <div className="text-xs uppercase tracking-wide">Step {index + 1}</div>
            <div className="mt-1 font-medium">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex-1 rounded-2xl border border-outline bg-surface p-5 sm:p-6">
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-on-surface">Choose scope and workflow name</h2>
              <p className="mt-1 text-sm text-secondary">Available scopes are derived from the current route context.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {scopes.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setScope(option.value)}
                  className={`rounded-2xl border p-4 text-left transition-all hover:border-primary ${
                    scope === option.value ? 'border-primary bg-primary/10' : 'border-outline bg-surface'
                  }`}
                >
                  <div className="text-base font-semibold text-on-surface">{option.label}</div>
                  <div className="mt-1 font-mono text-xs text-secondary">{option.value}</div>
                  <p className="mt-3 text-sm text-secondary">{option.description}</p>
                </button>
              ))}
            </div>

            <div className="max-w-2xl">
              <label htmlFor="workflow-name-input" className="mb-2 block text-sm font-medium text-on-surface">Name</label>
              <input
                id="workflow-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(slugifyName(e.target.value))}
                placeholder="full-sdd-pipeline"
                className={`w-full rounded-xl border bg-surface px-4 py-3 text-base text-on-surface outline-none focus:border-primary ${
                  name.length === 0 || nameIsValid ? 'border-outline' : 'border-error'
                }`}
              />
              <p className={`mt-2 text-xs ${name.length === 0 || nameIsValid ? 'text-secondary' : 'text-error'}`}>
                Lowercase slug only. Allowed characters: `a-z`, `0-9`, and `-`.
              </p>
            </div>

            <div className="rounded-2xl border border-outline bg-surface-container/30 p-4">
              <div className="text-xs uppercase tracking-wide text-secondary">ARN Preview</div>
              <div className="mt-2 break-all font-mono text-sm text-on-surface">{arnPreview}</div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-on-surface">Choose a template</h2>
              <p className="mt-1 text-sm text-secondary">Start from a canonical SDD flow or jump into a blank workflow.</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {WORKFLOW_TEMPLATES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTemplateId(item.id)}
                  className={`rounded-2xl border p-5 text-left transition-all hover:border-primary ${
                    templateId === item.id ? 'border-primary bg-primary/10' : 'border-outline bg-surface'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-on-surface">{item.name}</h3>
                      <p className="mt-2 text-sm text-secondary">{item.description}</p>
                    </div>
                    <span className="rounded-full border border-outline px-2.5 py-1 text-xs text-secondary">
                      {item.stages.length} stage{item.stages.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="mt-4 rounded-xl border border-outline bg-surface-container/30 px-3 py-2 font-mono text-xs text-secondary">
                    {item.stages.length > 0 ? item.stages.map((stage) => stage.id).join(' → ') : 'Open empty editor'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-on-surface">Confirm and open editor</h2>
              <p className="mt-1 text-sm text-secondary">The editor will load with the selected template scaffold and workflow-level metadata.</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-outline bg-surface-container/20 p-5">
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-secondary">Scope</div>
                    <div className="mt-1 text-on-surface">{scope}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-secondary">Name</div>
                    <div className="mt-1 text-on-surface">{name}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-secondary">ARN</div>
                    <div className="mt-1 break-all font-mono text-on-surface">{buildArn(scope, 'Workflow', name)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-secondary">Template</div>
                    <div className="mt-1 text-on-surface">{template.name}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-outline bg-surface p-5">
                <div className="text-xs uppercase tracking-wide text-secondary">Stage Preview</div>
                <div className="mt-3 rounded-xl border border-outline bg-surface-container/30 px-3 py-3 font-mono text-xs text-secondary">
                  {template.stages.length > 0 ? template.stages.map((stage) => stage.id).join(' → ') : 'No stages. You will start with a blank canvas.'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => step === 1 ? navigate(`/studio/projects/${projectId}/design/workflows`) : setStep((prev) => prev - 1)}
          className="rounded-xl border border-outline px-4 py-2 text-sm text-secondary hover:border-primary hover:text-on-surface transition-colors"
        >
          {step === 1 ? 'Cancel' : 'Back'}
        </button>

        {step < 3 ? (
          <button
            type="button"
            onClick={() => setStep((prev) => prev + 1)}
            disabled={step === 1 && !nameIsValid}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate(`/studio/projects/${projectId}/design/workflows/${encodeURIComponent(name)}/editor?scope=${encodeURIComponent(scope)}&template=${encodeURIComponent(template.id)}`)}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary/90"
          >
            Create Workflow
          </button>
        )}
      </div>
    </div>
  );
}
