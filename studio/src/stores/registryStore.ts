/**
 * registryStore — UI state for the Registry page.
 * Manages the resource list, filters, loading and error state for /registry.
 */

import { create } from 'zustand';
import type { RegistryNode } from '@/types';

interface RegistryFilters {
  kind: string;
  scope: string;
  query: string;
}

interface RegistryState {
  resources: RegistryNode[];
  setResources: (resources: RegistryNode[]) => void;
  filters: RegistryFilters;
  setFilters: (filters: Partial<RegistryFilters>) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export const useRegistryStore = create<RegistryState>((set) => ({
  resources: [],
  setResources: (resources) => set({ resources }),
  filters: { kind: 'all', scope: 'all', query: '' },
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  loading: false,
  setLoading: (loading) => set({ loading }),
  error: null,
  setError: (error) => set({ error }),
}));
