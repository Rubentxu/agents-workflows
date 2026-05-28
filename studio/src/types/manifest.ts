/**
 * Base manifest structure for all agentic resources.
 * Inspired by Kubernetes manifests but tailored to this domain.
 * See docs/studio-redesign.md for the full design rationale.
 */

/**
 * Supported resource kinds managed by Studio.
 */
export type ResourceKind =
  | 'Workflow'
  | 'Agent'
  | 'Skill'
  | 'Prompt'
  | 'Tool'
  | 'Template'
  | 'Policy';

/**
 * All agentic resource types stored in the registry.
 * Used for ARN construction: arn:local:{scope}:{type}/{name}
 */
export const RESOURCE_TYPES = [
  'workflow',
  'agent',
  'skill',
  'prompt',
  'tool',
  'template',
  'policy',
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

/**
 * Supported scopes for ARN construction.
 */
export type ArnScope = 'global' | `project/${string}` | `workspace/${string}`;

/**
 * Supported scopes as a union of string patterns.
 */
export type ArnScopeValue = 'global' | string;

/**
 * Maps ResourceKind to its canonical ARN type suffix.
 */
export const KIND_TO_TYPE: Record<ResourceKind, ResourceType> = {
  Workflow: 'workflow',
  Agent: 'agent',
  Skill: 'skill',
  Prompt: 'prompt',
  Tool: 'tool',
  Template: 'template',
  Policy: 'policy',
};

export const KIND_TO_API_VERSION = {
  Workflow: 'workflows.local/v1',
  Agent: 'agents.local/v1',
  Skill: 'skills.local/v1',
  Prompt: 'prompts.local/v1',
  Tool: 'tools.local/v1',
  Template: 'templates.local/v1',
  Policy: 'policies.local/v1',
} as const satisfies Record<ResourceKind, string>;

export type ApiVersion = (typeof KIND_TO_API_VERSION)[ResourceKind];

export const API_VERSION = KIND_TO_API_VERSION.Workflow;

/**
 * Base metadata shared by all manifests.
 */
export interface ResourceMetadata {
  /** Stable internal identity for history and tracing. Not part of ARN. */
  uid: string;
  /** Self-contained ARN derived from scope + kind + name, stored for convenience. */
  arn?: string;
  /** Unique name within scope and kind. Part of ARN. */
  name: string;
  /** ARN scope: global, project/{id}, or workspace/{id}. */
  scope: ArnScopeValue;
  /** Arbitrary key-value pairs for categorization. */
  labels?: Record<string, string>;
  /** Arbitrary non-identifying metadata for tooling and policies. */
  annotations?: Record<string, string>;
}

/**
 * Base manifest shape for all agentic resources.
 */
export interface Manifest<K extends ResourceKind = ResourceKind> {
  apiVersion: ApiVersion;
  kind: K;
  metadata: ResourceMetadata;
  spec: unknown;
}

/**
 * Constructs an ARN from manifest components.
 * ARN = arn:local:{scope}:{type}/{name}
 */
export function buildArn(
  scope: ArnScopeValue,
  kind: ResourceKind,
  name: string
): string {
  const type = KIND_TO_TYPE[kind];
  return `arn:local:${scope}:${type}/${name}`;
}

/**
 * Parses an ARN into its component parts.
 */
export function parseArn(arn: string): {
  scope: string;
  type: ResourceType;
  name: string;
} | null {
  const match = arn.match(/^arn:local:(.*):(.*)\/(.*)$/);
  if (!match) return null;
  return { scope: match[1], type: match[2] as ResourceType, name: match[3] };
}

/**
 * Checks if a given scope is more specific than another for override precedence.
 * Precedence: workspace > project > global
 */
export function isMoreSpecific(
  candidate: ArnScopeValue,
  current: ArnScopeValue
): boolean {
  if (current === 'global') return candidate !== 'global';
  if (current.startsWith('project/')) {
    return candidate.startsWith('workspace/');
  }
  return false;
}

/**
 * Applies override precedence to pick the most specific scope.
 * Returns the most specific of the two scopes.
 */
export function resolveEffectiveScope(
  scopes: ArnScopeValue[]
): ArnScopeValue {
  // workspace > project > global
  const projectScopes = scopes.filter((s) => s.startsWith('project/'));
  const workspaceScopes = scopes.filter((s) => s.startsWith('workspace/'));

  if (workspaceScopes.length > 0) return workspaceScopes[0];
  if (projectScopes.length > 0) return projectScopes[0];
  return 'global';
}
