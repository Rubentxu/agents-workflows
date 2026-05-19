/**
 * registryCacheStore — cached registry nodes from MCP.
 * Holds the flat list of all resource nodes for sidebar and canvas.
 */

import { create } from 'zustand';
import type { RegistryNode } from '@/types';

interface RegistryCacheState {
  nodes: RegistryNode[];
  setNodes: (nodes: RegistryNode[]) => void;
  addNode: (node: RegistryNode) => void;
  removeNode: (id: string) => void;
}

export const useRegistryCacheStore = create<RegistryCacheState>((set) => ({
  nodes: [],
  setNodes: (nodes) => set({ nodes }),
  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  removeNode: (id) => set((state) => ({
    nodes: state.nodes.filter((n) => n.id !== id),
  })),
}));
