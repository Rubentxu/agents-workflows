/**
 * Prompt manifest spec.
 * A Prompt is a templated prompt definition used by agents.
 */

import type { Manifest } from './manifest';

export interface PromptVariable {
  name: string;
  description?: string;
  required?: boolean;
  default?: string;
}

export interface PromptSpec {
  description?: string;
  template: string;
  variables?: PromptVariable[];
  examples?: string[];
}

export type PromptManifest = Manifest<'Prompt'> & {
  spec: PromptSpec;
};

export const PROMPT_KIND = 'Prompt' as const;
export type PromptKind = typeof PROMPT_KIND;
