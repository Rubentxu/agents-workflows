/**
 * Policy manifest spec.
 * A Policy defines rules for resource governance and approval requirements.
 */

import type { Manifest } from './manifest';

export type PolicyAction = 'delete' | 'edit' | 'create' | 'execute';
export type PolicyEffect = 'allow' | 'deny' | 'requireApproval';

export interface PolicyRule {
  action: PolicyAction;
  resources: {
    scopes?: string[];
    kinds?: string[];
    names?: string[];
  };
  effect: PolicyEffect;
  conditions?: Record<string, unknown>;
}

export interface PolicySpec {
  description?: string;
  rules: PolicyRule[];
}

export type PolicyManifest = Manifest<'Policy'> & {
  spec: PolicySpec;
};

export const POLICY_KIND = 'Policy' as const;
export type PolicyKind = typeof POLICY_KIND;
