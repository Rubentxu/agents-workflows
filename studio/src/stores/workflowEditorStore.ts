/**
 * workflowEditorStore — state for the workflow editor.
 * Manages the current workflow being edited and selected node state.
 */

import { create } from 'zustand';
import type { Workflow } from '@/types';

interface WorkflowEditorState {
  workflow: Workflow | null;
  setWorkflow: (workflow: Workflow | null) => void;
  updateWorkflow: (updates: Partial<Workflow>) => void;

  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
}

export const useWorkflowEditorStore = create<WorkflowEditorState>((set) => ({
  workflow: null,
  setWorkflow: (workflow) => set({ workflow }),
  updateWorkflow: (updates) => set((state) => ({
    workflow: state.workflow ? { ...state.workflow, ...updates } : null,
  })),

  selectedNodeId: null,
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
}));
