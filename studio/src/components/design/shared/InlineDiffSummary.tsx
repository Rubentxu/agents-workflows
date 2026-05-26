/**
 * InlineDiffSummary — counts-only advisory diff displayed before save.
 * Shows changed field counts (stages modified, added, removed).
 * This is advisory only; it does not block save.
 */

import { useMemo } from 'react';

export interface DiffSummary {
  stagesModified: number;
  stagesAdded: number;
  stagesRemoved: number;
  fieldsChanged: Record<string, number>;
}

interface StageLike {
  id: string;
  [key: string]: unknown;
}

interface InlineDiffSummaryProps {
  original: { stages?: StageLike[] } | null;
  current: { stages?: StageLike[] } | null;
}

export function computeDiff(original: { stages?: StageLike[] } | null, current: { stages?: StageLike[] } | null): DiffSummary {
  if (!original && !current) {
    return { stagesModified: 0, stagesAdded: 0, stagesRemoved: 0, fieldsChanged: {} };
  }

  const originalStages = original?.stages ?? [];
  const currentStages = current?.stages ?? [];
  const originalIds = new Set(originalStages.map((s) => s.id));
  const currentIds = new Set(currentStages.map((s) => s.id));

  const stagesAdded = [...currentIds].filter((id) => !originalIds.has(id)).length;
  const stagesRemoved = [...originalIds].filter((id) => !currentIds.has(id)).length;
  const stagesModified = [...currentIds].filter((id) => originalIds.has(id)).length;

  const fieldsChanged: Record<string, number> = {};
  if (original && current) {
    for (const stage of currentStages) {
      if (originalIds.has(stage.id)) {
        const origStage = originalStages.find((s) => s.id === stage.id);
        if (origStage) {
          for (const key of Object.keys(stage)) {
            if (key !== 'id' && JSON.stringify(stage[key]) !== JSON.stringify((origStage as Record<string, unknown>)[key])) {
              fieldsChanged[key] = (fieldsChanged[key] ?? 0) + 1;
            }
          }
        }
      }
    }
  }

  return { stagesModified, stagesAdded, stagesRemoved, fieldsChanged };
}

export function InlineDiffSummary({ original, current }: InlineDiffSummaryProps) {
  const diff = useMemo(() => computeDiff(original, current), [original, current]);

  if (diff.stagesModified === 0 && diff.stagesAdded === 0 && diff.stagesRemoved === 0) {
    return null;
  }

  const parts: string[] = [];
  if (diff.stagesModified > 0) parts.push(`${diff.stagesModified} modified`);
  if (diff.stagesAdded > 0) parts.push(`${diff.stagesAdded} added`);
  if (diff.stagesRemoved > 0) parts.push(`${diff.stagesRemoved} removed`);

  return (
    <div className="flex items-center gap-2 text-xs text-secondary" data-testid="inline-diff-summary">
      <span className="text-warning">ⓘ</span>
      <span>{parts.join(', ')}</span>
      {Object.keys(diff.fieldsChanged).length > 0 && (
        <span className="text-secondary">
          ({Object.entries(diff.fieldsChanged).map(([k, v]) => `${k}: ${v}`).join(', ')})
        </span>
      )}
    </div>
  );
}
