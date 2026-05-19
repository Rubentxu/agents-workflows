/**
 * ImpactReviewModal — mandatory confirmation before destructive or shared-resource changes.
 *
 * Shows:
 * - Dependents (resources that reference this one)
 * - Affected workspaces
 * - Recent Agent Executions using the resource
 * - Derived overrides
 * - Policy effects
 * - Explicit confirmation
 *
 * Triggers: delete, global/project override, move, archive
 */

import { useState, useEffect } from 'react';
import { MockImpactAnalyzer } from './MockImpactAnalyzer';
import type { ImpactData } from './ImpactAnalyzer';

export type { ImpactData };

interface ImpactReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  impact: ImpactData;
  action: 'delete' | 'override' | 'archive' | 'move';
}

export function ImpactReviewModal({ isOpen, onClose, onConfirm, impact, action }: ImpactReviewModalProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) setConfirmed(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const actionLabel: Record<string, string> = {
    delete: 'Delete resource',
    override: 'Create override',
    archive: 'Archive resource',
    move: 'Move resource',
  };

  const severityColor = {
    high: 'text-error bg-error/10 border-error/30',
    medium: 'text-warning bg-warning/10 border-warning/30',
    low: 'text-info bg-info/10 border-info/30',
  }[impact.severity];

  const handleConfirm = async () => {
    if (!confirmed) return;
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 300));
      onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16" onClick={onClose}>
      <div className="absolute inset-0 bg-scrim" />

      <div
        className="relative w-full max-w-lg bg-surface border border-outline rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-outline-variant">
          <div className="flex items-start gap-3">
            {/* Warning icon */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border ${severityColor}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-on-surface">Impact Review</h2>
              <p className="text-xs text-secondary mt-0.5">
                {action === 'delete' ? 'This action cannot be undone.' :
                 action === 'override' ? 'This will create a scoped override.' :
                 'This action may affect dependent resources.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-secondary hover:text-on-surface transition-colors text-lg">✕</button>
        </div>

        {/* Severity banner */}
        <div className={`mx-6 mt-4 px-4 py-2.5 rounded-lg border text-sm font-medium ${severityColor}`}>
          <span className="capitalize">{impact.severity}</span> impact — {impact.dependents.length} dependent{impact.dependents.length !== 1 ? 's' : ''},{' '}
          {impact.affectedWorkspaces.length} workspace{impact.affectedWorkspaces.length !== 1 ? 's' : ''} affected
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6 space-y-5">
          {/* Resource being acted on */}
          <div className="bg-surface-container border border-outline-variant rounded-lg p-3">
            <div className="text-[10px] text-secondary uppercase mb-1">Target Resource</div>
            <div className="text-sm font-medium text-on-surface">{impact.resourceName}</div>
            <div className="text-xs font-mono text-secondary mt-0.5">{impact.resourceArn}</div>
            <div className="text-xs text-secondary mt-1">{impact.resourceKind}</div>
          </div>

          {/* Dependents */}
          {impact.dependents.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-secondary uppercase mb-2">
                Dependents ({impact.dependents.length})
              </h3>
              <div className="space-y-1.5">
                {impact.dependents.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 px-3 py-2 bg-surface-container border border-outline-variant rounded text-sm">
                    <span className="text-[10px] text-secondary bg-surface px-1.5 py-0.5 rounded border">{d.kind}</span>
                    <span className="text-on-surface font-medium truncate flex-1">{d.label}</span>
                    <span className="text-xs font-mono text-secondary">{d.arn.split('/').pop()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Affected workspaces */}
          {impact.affectedWorkspaces.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-secondary uppercase mb-2">
                Affected Workspaces ({impact.affectedWorkspaces.length})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {impact.affectedWorkspaces.map((ws) => (
                  <span key={ws} className="text-xs px-2 py-1 bg-surface-container border border-outline-variant rounded text-secondary">
                    {ws}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recent executions */}
          {impact.recentExecutions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-secondary uppercase mb-2">
                Recent Agent Executions ({impact.recentExecutions.length})
              </h3>
              <div className="space-y-1">
                {impact.recentExecutions.slice(0, 5).map((ex) => (
                  <div key={ex.id} className="flex items-center justify-between px-3 py-2 bg-surface-container border border-outline-variant rounded text-sm">
                    <span className="font-mono text-xs text-secondary truncate flex-1">{ex.id}</span>
                    <span className={`text-[10px] font-medium ml-2 ${
                      ex.status === 'completed' ? 'text-success' :
                      ex.status === 'failed' ? 'text-error' :
                      'text-secondary'
                    }`}>{ex.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Derived overrides */}
          {impact.derivedOverrides.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-secondary uppercase mb-2">
                Derived Overrides ({impact.derivedOverrides.length})
              </h3>
              <div className="space-y-1">
                {impact.derivedOverrides.map((ov) => (
                  <div key={ov.id} className="flex items-center gap-2 px-3 py-2 bg-surface-container border border-outline-variant rounded text-sm">
                    <span className="text-[10px] text-secondary">override</span>
                    <span className="text-on-surface font-medium truncate flex-1">{ov.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Policy effects */}
          {impact.policyEffects.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-secondary uppercase mb-2">
                Policy Effects
              </h3>
              <div className="space-y-1">
                {impact.policyEffects.map((policy, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 bg-surface-container border border-outline-variant rounded text-sm">
                    <span className="text-primary text-xs mt-0.5">⚡</span>
                    <span className="text-secondary text-xs">{policy}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Confirmation */}
        <div className="px-6 py-4 border-t border-outline-variant bg-surface-container/30">
          <label className="flex items-start gap-3 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-outline bg-surface accent-primary"
            />
            <span className="text-sm text-secondary">
              I understand this action will affect{' '}
              <strong className="text-on-surface">{impact.dependents.length} dependent{impact.dependents.length !== 1 ? 's' : ''}</strong>
              {' '}and{' '}
              <strong className="text-on-surface">{impact.affectedWorkspaces.length} workspace{impact.affectedWorkspaces.length !== 1 ? 's' : ''}</strong>.
              {action === 'delete' && ' This cannot be undone.'}
            </span>
          </label>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-secondary hover:text-on-surface transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!confirmed || loading}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                action === 'delete'
                  ? 'bg-error text-on-primary hover:bg-error'
                  : 'bg-primary text-on-primary hover:bg-primary/90'
              }`}
            >
              {loading ? 'Processing...' : actionLabel[action]}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to get impact data for a resource.
 * Uses MockImpactAnalyzer in development — swap for McpImpactAnalyzer in production
 * by changing the import below.
 */
export function useImpactReview() {
  const analyzer = new MockImpactAnalyzer();

  const getImpact = async (arn: string, kind: string) => {
    return analyzer.analyze(arn, kind);
  };

  return { getImpact };
}
