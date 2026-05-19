/**
 * useWorkspaceContext — manages current workspace context with localStorage persistence.
 * Provides reactive workspace state for the entire application.
 */

import { useEffect } from 'react';
import { useWorkspaceStore, type Workspace } from '@/stores/workspaceStore';

export interface WorkspaceContextValue {
  activeWorkspace: Workspace | null;
  allWorkspaces: Workspace[];
  setActiveWorkspace: (id: string | null) => void;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const {
    activeWorkspaceId,
    workspaces,
    loading,
    error,
    setActiveWorkspace,
    refreshWorkspaces,
  } = useWorkspaceStore();

  useEffect(() => {
    if (workspaces.length === 0 && !loading) {
      refreshWorkspaces();
    }
  }, []);

  const activeWorkspace =
    activeWorkspaceId === null
      ? null
      : workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  return {
    activeWorkspace,
    allWorkspaces: workspaces,
    setActiveWorkspace,
    loading,
    error,
    refresh: refreshWorkspaces,
  };
}
