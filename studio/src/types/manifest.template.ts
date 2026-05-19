/**
 * Template manifest spec.
 * A Template is a parameterized manifest used to generate other resources.
 */

import type { Manifest, ResourceKind } from './manifest';

export interface TemplateParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  required?: boolean;
  default?: unknown;
}

export interface TemplateSpec {
  description?: string;
  targetKind: ResourceKind;
  parameters: TemplateParameter[];
  /** The manifest template with {{parameter}} placeholders. */
  manifest: Record<string, unknown>;
}

export type TemplateManifest = Manifest<'Template'> & {
  spec: TemplateSpec;
};

export const TEMPLATE_KIND = 'Template' as const;
export type TemplateKind = typeof TEMPLATE_KIND;
