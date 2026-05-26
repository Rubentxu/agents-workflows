/**
 * useDirtyGuard — Prevent data loss when navigating away from dirty editors.
 *
 * Two layers of protection:
 *  1. React Router `useBlocker()` — blocks client-side navigation
 *  2. `window.beforeunload` — blocks browser tab close/refresh
 *
 * Usage:
 *   const { isDirty, markDirty, markClean } = useDirtyGuard(initialContent, currentContent);
 *   // Pass isDirty to EditorLayout to show dirty indicator
 */
import { useEffect, useState, useCallback } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Compare two YAML strings, ignoring trailing whitespace and blank-line differences.
 * Returns true if the content has semantically changed.
 */
function contentHasChanged(original: string, current: string): boolean {
  // Normalize trailing whitespace on each line and trim final newlines
  const normalize = (s: string) =>
    s
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .trimEnd();
  return normalize(original) !== normalize(current);
}

export interface DirtyGuardResult {
  /** Whether the current content differs from the original */
  isDirty: boolean;
  /** Called after successful save to reset the dirty state */
  markClean: (newOriginal: string) => void;
  /** Called when the user confirms navigation — proceed */
  confirmNavigation: () => void;
  /** Called when the user cancels navigation — stay on page */
  cancelNavigation: () => void;
  /** The blocker state: 'unblocked' | 'blocked' | 'proceeding' */
  blockerState: 'unblocked' | 'blocked' | 'proceeding';
}

export function useDirtyGuard(
  originalContent: string,
  currentContent: string,
): DirtyGuardResult {
  const [savedContent, setSavedContent] = useState(originalContent);

  // Re-derive dirty from saved content vs current — ignores transient whitespace
  const isDirty = contentHasChanged(savedContent, currentContent);

  // React Router blocker — prevents client-side navigation when dirty
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  // Browser tab close/refresh guard
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers require returnValue to be set
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Reset saved content after successful save
  const markClean = useCallback((newOriginal: string) => {
    setSavedContent(newOriginal);
  }, []);

  // Allow navigation to proceed
  const confirmNavigation = useCallback(() => {
    if (blocker.state === 'blocked') {
      blocker.proceed();
    }
  }, [blocker]);

  // Cancel navigation, stay on page
  const cancelNavigation = useCallback(() => {
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
  }, [blocker]);

  return {
    isDirty,
    markClean,
    confirmNavigation,
    cancelNavigation,
    blockerState: blocker.state,
  };
}
