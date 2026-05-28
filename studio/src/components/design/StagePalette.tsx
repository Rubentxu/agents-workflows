/**
 * StagePalette — collapsible left panel in the Workflow Editor.
 * Contains stage templates organized by intent.
 * SDD stages grouped by workflow phase, general stages separate.
 */

import { useState } from 'react';
import type { Stage } from '@/types/workflow';
import { buildArn, type ArnScopeValue } from '@/types/manifest';

export interface StageTemplate {
  label: string;
  group: string;
  description: string;
  icon?: string;
  defaults: Partial<Stage>;
  suggestedAgentName?: string;
}

interface StagePaletteProps {
  isOpen: boolean;
  onToggle: () => void;
  onAddStage: (template: StageTemplate) => void;
  scope?: ArnScopeValue;
}

const SDD_STAGES: StageTemplate[] = [
  {
    label: 'Explore',
    group: 'SDD STAGES',
    description: 'Discover and investigate the change',
    icon: '🔍',
    suggestedAgentName: 'sdd-explore',
    defaults: {
      description: 'Explore and investigate the change',
      agent: '',
      depends_on: [],
      input: {},
      output: { artifacts: [] },
      execution: { mode: 'sequential', retry: { max_attempts: 1, backoff_ms: 0 } },
      conditions: [],
      metrics: [],
    },
  },
  {
    label: 'Propose',
    group: 'SDD STAGES',
    description: 'Define change intent',
    icon: '📝',
    suggestedAgentName: 'sdd-propose',
    defaults: {
      description: 'Define change intent and scope',
      agent: '',
      depends_on: [],
      input: {},
      output: { artifacts: [] },
      execution: { mode: 'sequential', retry: { max_attempts: 1, backoff_ms: 0 } },
      conditions: [],
      metrics: [],
    },
  },
  {
    label: 'Design',
    group: 'SDD STAGES',
    description: 'Architecture decisions',
    icon: '🏗️',
    suggestedAgentName: 'sdd-design',
    defaults: {
      description: 'Architecture and design decisions',
      agent: '',
      depends_on: [],
      input: {},
      output: { artifacts: [] },
      execution: { mode: 'sequential', retry: { max_attempts: 1, backoff_ms: 0 } },
      conditions: [],
      metrics: [],
    },
  },
  {
    label: 'Spec',
    group: 'SDD STAGES',
    description: 'Requirements and scenarios',
    icon: '📋',
    suggestedAgentName: 'sdd-spec',
    defaults: {
      description: 'Requirements and acceptance scenarios',
      agent: '',
      depends_on: [],
      input: {},
      output: { artifacts: [] },
      execution: { mode: 'sequential', retry: { max_attempts: 1, backoff_ms: 0 } },
      conditions: [],
      metrics: [],
    },
  },
  {
    label: 'Tasks',
    group: 'SDD STAGES',
    description: 'Break into work units',
    icon: '✅',
    suggestedAgentName: 'sdd-tasks',
    defaults: {
      description: 'Break change into implementation tasks',
      agent: '',
      depends_on: [],
      input: {},
      output: { artifacts: [] },
      execution: { mode: 'sequential', retry: { max_attempts: 1, backoff_ms: 0 } },
      conditions: [],
      metrics: [],
    },
  },
  {
    label: 'Apply',
    group: 'SDD STAGES',
    description: 'Implement the change',
    icon: '⚡',
    suggestedAgentName: 'sdd-apply',
    defaults: {
      description: 'Implement the change',
      agent: '',
      depends_on: [],
      input: {},
      output: { artifacts: [] },
      execution: { mode: 'sequential', retry: { max_attempts: 1, backoff_ms: 0 } },
      conditions: [],
      metrics: [],
    },
  },
  {
    label: 'Verify',
    group: 'SDD STAGES',
    description: 'Test and validate',
    icon: '✓',
    suggestedAgentName: 'sdd-verify',
    defaults: {
      description: 'Test and validate the implementation',
      agent: '',
      depends_on: [],
      input: {},
      output: { artifacts: [] },
      execution: { mode: 'sequential', retry: { max_attempts: 1, backoff_ms: 0 } },
      conditions: [],
      metrics: [],
    },
  },
  {
    label: 'Archive',
    group: 'SDD STAGES',
    description: 'Close and persist',
    icon: '📦',
    suggestedAgentName: 'sdd-archive',
    defaults: {
      description: 'Archive and persist the change',
      agent: '',
      depends_on: [],
      input: {},
      output: { artifacts: [] },
      execution: { mode: 'sequential', retry: { max_attempts: 1, backoff_ms: 0 } },
      conditions: [],
      metrics: [],
    },
  },
];

const GENERAL_STAGES: StageTemplate[] = [
  {
    label: 'Empty Stage',
    group: 'GENERAL',
    description: 'Blank stage, no presets',
    icon: '⬜',
    defaults: {
      description: '',
      agent: '',
      depends_on: [],
      input: {},
      output: { artifacts: [] },
      execution: { mode: 'sequential', retry: { max_attempts: 1, backoff_ms: 0 } },
      conditions: [],
      metrics: [],
    },
  },
];

interface CollapsibleGroupProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleGroup({ title, defaultOpen = true, children }: CollapsibleGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-secondary uppercase tracking-wider hover:bg-surface-container-hover/50 transition-colors"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${isOpen ? '' : '-rotate-90'}`}
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
        {title}
      </button>
      {isOpen && <div className="px-2 space-y-1.5">{children}</div>}
    </div>
  );
}

function TemplateCard({
  template,
  onClick,
  suggestedArn,
}: {
  template: StageTemplate;
  onClick: () => void;
  suggestedArn?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-2 rounded-lg border border-outline-variant bg-surface hover:bg-surface-container-hover hover:border-primary/40 transition-all text-sm group"
    >
      <div className="flex items-center gap-2">
        {template.icon && <span className="text-sm">{template.icon}</span>}
        <span className="font-medium text-on-surface group-hover:text-primary transition-colors">
          {template.label}
        </span>
      </div>
      <div className="text-[10px] text-secondary mt-0.5 ml-6">{template.description}</div>
      {suggestedArn && (
        <div className="text-[10px] text-secondary/70 mt-0.5 ml-6 font-mono truncate" title={suggestedArn}>
          → {suggestedArn}
        </div>
      )}
    </button>
  );
}

function CollapseIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={`transition-transform ${open ? 'rotate-0' : 'rotate-180'}`}
    >
      <path d="M10 12L6 8l4-4" />
    </svg>
  );
}

export function StagePalette({ isOpen, onToggle, onAddStage, scope = 'global' }: StagePaletteProps) {
  const handleAddStage = (template: StageTemplate) => {
    onAddStage(template);
  };

  const handleAddBlank = () => {
    handleAddStage(GENERAL_STAGES[0]);
  };

  const getSuggestedArn = (template: StageTemplate): string | undefined => {
    if (!template.suggestedAgentName) return undefined;
    return buildArn(scope, 'Agent', template.suggestedAgentName);
  };

  return (
    <div
      className={`relative border-r border-outline-variant bg-surface-container/50 flex flex-col transition-all duration-200 ${
        isOpen ? 'w-56' : 'w-10'
      }`}
    >
      {/* Toggle button */}
      <button
        type="button"
        onClick={onToggle}
        className={`flex items-center justify-center h-9 hover:bg-surface-container-hover transition-colors ${
          isOpen ? 'gap-1.5 px-3 justify-start border-b border-outline-variant' : 'w-full'
        }`}
        title={isOpen ? 'Collapse palette' : 'Expand palette'}
      >
        {isOpen ? (
          <>
            <span className="text-sm font-medium text-on-surface">Stage Templates</span>
            <span className="ml-auto text-secondary">
              <CollapseIcon open={isOpen} />
            </span>
          </>
        ) : (
          <span className="text-lg text-secondary font-light hover:text-on-surface transition-colors">
            +
          </span>
        )}
      </button>

      {/* Templates list (collapsed state hidden) */}
      {isOpen && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Scope badge */}
          <div className="px-3 py-2 border-b border-outline-variant">
            <span className="text-[10px] font-medium text-secondary">
              Scope: <span className="font-mono text-on-surface">{scope}</span>
            </span>
          </div>

          <div className="flex-1 overflow-auto py-2">
            {/* SDD STAGES group */}
            <CollapsibleGroup title="SDD STAGES" defaultOpen={true}>
              {SDD_STAGES.map((template) => (
                <TemplateCard
                  key={template.label}
                  template={template}
                  onClick={() => handleAddStage(template)}
                  suggestedArn={getSuggestedArn(template)}
                />
              ))}
            </CollapsibleGroup>

            {/* GENERAL group */}
            <CollapsibleGroup title="GENERAL" defaultOpen={false}>
              {GENERAL_STAGES.map((template) => (
                <TemplateCard
                  key={template.label}
                  template={template}
                  onClick={() => handleAddStage(template)}
                  suggestedArn={getSuggestedArn(template)}
                />
              ))}
            </CollapsibleGroup>
          </div>

          {/* "Add Stage" button at bottom */}
          <div className="p-2 border-t border-outline-variant">
            <button
              type="button"
              onClick={handleAddBlank}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v10M3 8h10" />
              </svg>
              Add Stage
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
