/**
 * executionStore — workflow execution state.
 * Manages execution plan and in-progress execution state.
 */

import { create } from 'zustand';
import type { ExecutionPlan } from '@/types';

interface ExecutionState {
  executionPlan: ExecutionPlan | null;
  setExecutionPlan: (plan: ExecutionPlan | null) => void;
  isExecuting: boolean;
  setIsExecuting: (executing: boolean) => void;
}

export const useExecutionStore = create<ExecutionState>((set) => ({
  executionPlan: null,
  setExecutionPlan: (executionPlan) => set({ executionPlan }),
  isExecuting: false,
  setIsExecuting: (isExecuting) => set({ isExecuting }),
}));
