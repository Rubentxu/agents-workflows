/**
 * useValidationGate — Shared hook that gates save operations on validation.
 * Calls POST /api/validate before allowing PUT /api/content/:arn.
 * If validation errors are found, save is blocked and diagnostics are returned.
 */

import { useState, useCallback } from 'react';
import { useContent, type ValidationDiagnostic, type ValidationResult } from './useContent';

export type GateDecision =
  | { allowed: true }
  | { allowed: false; diagnostics: ValidationDiagnostic[]; hasErrors: boolean };

export function useValidationGate() {
  const { validateContent } = useContent();
  const [validating, setValidating] = useState(false);
  const [lastResult, setLastResult] = useState<ValidationResult | null>(null);

  const validateBeforeSave = useCallback(
    async (arn: string, content: string): Promise<GateDecision> => {
      setValidating(true);
      try {
        const result = await validateContent(arn, content);
        setLastResult(result);
        if (!result) return { allowed: true }; // validation endpoint not available

        const errors = result.diagnostics.filter((d) => d.severity === 'error');
        if (errors.length > 0) {
          return { allowed: false, diagnostics: result.diagnostics, hasErrors: true };
        }
        return { allowed: true };
      } catch {
        // If validation fails, allow save (don't block on network errors)
        return { allowed: true };
      } finally {
        setValidating(false);
      }
    },
    [validateContent],
  );

  return { validating, lastResult, validateBeforeSave };
}
