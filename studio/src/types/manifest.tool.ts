/**
 * Tool manifest spec.
 * A Tool represents a callable capability available to agents.
 */

import type { Manifest } from './manifest';

export interface ToolInputSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
}

export interface ToolOutputSchema {
  type: 'object';
  properties?: Record<string, unknown>;
}

export interface ToolSpec {
  description?: string;
  capabilities: string[];
  input_schema: ToolInputSchema;
  output_schema?: ToolOutputSchema;
  permissions?: string[];
}

export type ToolManifest = Manifest<'Tool'> & {
  spec: ToolSpec;
};

export const TOOL_KIND = 'Tool' as const;
export type ToolKind = typeof TOOL_KIND;
