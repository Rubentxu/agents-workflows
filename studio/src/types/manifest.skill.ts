/**
 * Skill manifest spec.
 * A Skill provides specialized instructions and triggers for agents.
 */

import type { Manifest } from './manifest';

export interface SkillSpec {
  description?: string;
  instructions: string;
  triggers: string[];
  compact_rules?: boolean;
  required_tools?: string[];
  required_skills?: string[];
}

export type SkillManifest = Manifest<'Skill'> & {
  spec: SkillSpec;
};

export const SKILL_KIND = 'Skill' as const;
export type SkillKind = typeof SKILL_KIND;
