/**
 * Dashboard store — holds state for the Project Dashboard.
 * All types imported from @/types/dashboard (single source of truth).
 */

import { create } from 'zustand';
import type { RegistryNode } from '@/types';
import type {
  WorkspaceStatus,
  AgentExecutionRow,
  HealthStrip,
} from '@/types/dashboard';

// Re-export so callers can import from the store directly
export type { WorkspaceStatus, AgentExecutionRow, HealthStrip } from '@/types/dashboard';

interface DashboardState {
  // Workspace statuses
  workspaces: WorkspaceStatus[];
  setWorkspaces: (ws: WorkspaceStatus[]) => void;

  // Recent agent executions
  recentExecutions: AgentExecutionRow[];
  setRecentExecutions: (execs: AgentExecutionRow[]) => void;

  // Workflow catalog preview — registry nodes filtered to workflows
  recentWorkflows: RegistryNode[];
  setRecentWorkflows: (nodes: RegistryNode[]) => void;

  // Health strip summary
  health: HealthStrip;
  setHealth: (h: Partial<HealthStrip>) => void;

  // Loading states
  loadingWorkspaces: boolean;
  loadingExecutions: boolean;
  loadingWorkflows: boolean;
  setLoadingWorkspaces: (v: boolean) => void;
  setLoadingExecutions: (v: boolean) => void;
  setLoadingWorkflows: (v: boolean) => void;

  // Errors
  errors: {
    workspaces?: string;
    executions?: string;
    workflows?: string;
  };
  setError: (key: keyof DashboardState['errors'], msg: string) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  workspaces: [],
  setWorkspaces: (workspaces) => set({ workspaces }),

  recentExecutions: [],
  setRecentExecutions: (recentExecutions) => set({ recentExecutions }),

  recentWorkflows: [],
  setRecentWorkflows: (recentWorkflows) => set({ recentWorkflows }),

  health: {
    activeExecutions: 0,
    failedExecutions: 0,
    successRate: 0,
    avgDurationMs: 0,
    queued: 0,
    artifactCount: 0,
    openAlerts: 0,
  },
  setHealth: (h) => set((state) => ({ health: { ...state.health, ...h } })),

  loadingWorkspaces: false,
  loadingExecutions: false,
  loadingWorkflows: false,
  setLoadingWorkspaces: (loadingWorkspaces) => set({ loadingWorkspaces }),
  setLoadingExecutions: (loadingExecutions) => set({ loadingExecutions }),
  setLoadingWorkflows: (loadingWorkflows) => set({ loadingWorkflows }),

  errors: {},
  setError: (key, msg) =>
    set((state) => ({ errors: { ...state.errors, [key]: msg } })),
}));
