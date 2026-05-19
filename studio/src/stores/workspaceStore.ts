/**
 * Workspace store — global state for active workspace context.
 * Persists activeWorkspaceId in localStorage.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API = '/api';

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  environment?: 'dev' | 'staging' | 'prod';
}

interface WorkspaceStore {
  activeWorkspaceId: string | null;
  workspaces: Workspace[];
  loading: boolean;
  error: string | null;
  setActiveWorkspace: (id: string | null) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  refreshWorkspaces: () => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set) => ({
      activeWorkspaceId: null,
      workspaces: [],
      loading: false,
      error: null,

      setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

      setWorkspaces: (workspaces) => set({ workspaces }),

      refreshWorkspaces: async () => {
        set({ loading: true, error: null });
        try {
          const response = await fetch(`${API}/workspaces`);
          if (!response.ok) {
            throw new Error(`Failed to list workspaces: HTTP ${response.status}`);
          }
          const data = (await response.json()) as { workspaces?: Workspace[] };
          set({ workspaces: data.workspaces ?? [], loading: false });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to load workspaces';
          set({ error: message, loading: false });
        }
      },
    }),
    {
      name: 'workspace-context',
      partialize: (state) => ({ activeWorkspaceId: state.activeWorkspaceId }),
    }
  )
);
