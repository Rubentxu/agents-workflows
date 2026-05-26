/**
 * useSaveToast — Automatically shows toast notifications based on save state.
 *
 * Usage in any editor page:
 *   const toastRef = useSaveToast(saving, error, 'Agent');
 *   // Pass toastRef.onSaved() after successful save, toastRef.onError() on failure
 */
import { useRef, useCallback } from 'react';
import toast from 'react-hot-toast';

export interface SaveToastRef {
  /** Call after successful save — shows success toast */
  onSaved: () => void;
  /** Call after save error — shows error toast with message */
  onError: (message: string) => void;
}

export function useSaveToast(resourceType: string): SaveToastRef {
  const resourceTypeRef = useRef(resourceType);
  resourceTypeRef.current = resourceType;

  const onSaved = useCallback(() => {
    toast.success(`${resourceTypeRef.current} saved`, { icon: '✓' });
  }, []);

  const onError = useCallback((message: string) => {
    toast.error(message, { duration: 5000 });
  }, []);

  return { onSaved, onError };
}
