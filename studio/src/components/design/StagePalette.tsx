/**
 * StagePalette — collapsible left panel in the Workflow Editor.
 * Contains stage templates that users can click to add to the canvas.
 * Supports "Empty Stage" and "SDD Stage" templates.
 */

import type { Stage } from '@/types/workflow';

export interface StageTemplate {
  label: string;
  defaults: Partial<Stage>;
}

interface StagePaletteProps {
  isOpen: boolean;
  onToggle: () => void;
  onAddStage: (template: StageTemplate) => void;
}

const STAGE_TEMPLATES: StageTemplate[] = [
  {
    label: 'Empty Stage',
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
  {
    label: 'SDD Stage',
    defaults: {
      description: 'SDD-based stage with convention prefix',
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

function TemplateCard({
  template,
  onClick,
}: {
  template: StageTemplate;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg border border-outline-variant bg-surface hover:bg-surface-container-hover hover:border-primary/40 transition-all text-sm group"
    >
      <div className="font-medium text-on-surface group-hover:text-primary transition-colors">
        {template.label}
      </div>
      <div className="text-[10px] text-secondary mt-0.5 font-mono">
        {template.label === 'Empty Stage' ? 'Blank stage — no preset' : 'sdd-* naming convention'}
      </div>
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

export function StagePalette({ isOpen, onToggle, onAddStage }: StagePaletteProps) {
  const handleAddStage = (template: StageTemplate) => {
    onAddStage(template);
  };

  const handleAddBlank = () => {
    // Add empty stage (no template selection)
    handleAddStage(STAGE_TEMPLATES[0]);
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
          <div className="flex-1 overflow-auto p-2 space-y-2">
            {STAGE_TEMPLATES.map((template) => (
              <TemplateCard
                key={template.label}
                template={template}
                onClick={() => handleAddStage(template)}
              />
            ))}
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
