/**
 * Agent manifest spec.
 * An Agent is a configured LLM with bound skills, prompts, and tools.
 */

import type { Manifest } from './manifest';

export interface AgentSpec {
  description?: string;
  model: string;
  provider?: string;
  skills: string[]; // Skill ARNs
  prompts: string[]; // Prompt ARNs
  tools: string[]; // Tool ARNs
  timeout_ms?: number;
  max_tokens?: number;
  temperature?: number;
}

export type AgentManifest = Manifest<'Agent'> & {
  spec: AgentSpec;
};

export const AGENT_KIND = 'Agent' as const;
export type AgentKind = typeof AGENT_KIND;
