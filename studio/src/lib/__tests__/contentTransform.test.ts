/**
 * Content Transform — Unit Tests
 *
 * Tests the deterministic conversion functions between:
 * - YAML config format (apiVersion: skills.local/v1, kind: Skill, spec: {...})
 * - Markdown frontmatter format (---\nname: ...\n---\n# Body)
 *
 * These tests are purely functional and do NOT require Monaco runtime.
 * They verify the transformation logic in isolation.
 */

import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import {
  isYamlConfigFormat,
  isMarkdownFormat,
  yamlConfigToMarkdown,
  markdownToYamlConfig,
} from '@/lib/contentTransform';

describe('isYamlConfigFormat', () => {
  it('returns true for YAML config with apiVersion and kind', () => {
    expect(isYamlConfigFormat('apiVersion: skills.local/v1\nkind: Skill')).toBe(true);
  });

  it('returns false for markdown frontmatter', () => {
    expect(isYamlConfigFormat('---\nname: test\n---\n# Body')).toBe(false);
  });

  it('returns false for plain markdown without frontmatter', () => {
    expect(isYamlConfigFormat('# Hello\n\nSome content')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isYamlConfigFormat('')).toBe(false);
  });

  it('returns true when only apiVersion present', () => {
    expect(isYamlConfigFormat('apiVersion: agents.local/v1')).toBe(false);
  });

  it('returns true when only kind present', () => {
    expect(isYamlConfigFormat('kind: Agent')).toBe(false);
  });
});

describe('isMarkdownFormat', () => {
  it('returns true when content starts with ---', () => {
    expect(isMarkdownFormat('---\nname: test\n---\n# Body')).toBe(true);
  });

  it('returns false for YAML config', () => {
    expect(isMarkdownFormat('apiVersion: skills.local/v1\nkind: Skill')).toBe(false);
  });

  it('returns false for plain markdown without frontmatter', () => {
    expect(isMarkdownFormat('# Hello\n\nSome content')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isMarkdownFormat('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(isMarkdownFormat('   \n\n  ')).toBe(false);
  });
});

describe('yamlConfigToMarkdown — Skill', () => {
  it('converts a full skill YAML config to markdown with frontmatter', () => {
    const yamlConfig = yaml.dump({
      apiVersion: 'skills.local/v1',
      kind: 'Skill',
      metadata: { name: 'test-skill', scope: 'global' },
      spec: {
        description: 'A test skill',
        version: '1.0.0',
        author: 'Studio QA',
        license: 'MIT',
        required_tools: ['bash', 'read'],
        content: '# Test Skill\n\nUse this skill for testing.',
      },
    });

    const result = yamlConfigToMarkdown(yamlConfig);

    expect(result).toContain('---');
    expect(result).toContain('name: test-skill');
    expect(result).toContain('scope: global');
    expect(result).toContain('description: A test skill');
    expect(result).toContain('version: 1.0.0');
    expect(result).toContain('author: Studio QA');
    expect(result).toContain('license: MIT');
    expect(result).toContain('# Test Skill');
  });

  it('preserves body content from spec.content', () => {
    const yamlConfig = yaml.dump({
      apiVersion: 'skills.local/v1',
      kind: 'Skill',
      metadata: { name: 'test-skill', scope: 'global' },
      spec: {
        description: 'Test',
        content: '## Section\n\nSome content here.',
      },
    });

    const result = yamlConfigToMarkdown(yamlConfig);
    expect(result).toContain('## Section');
    expect(result).toContain('Some content here.');
  });

  it('returns original content if not YAML config format', () => {
    const markdown = '# Already Markdown\n\nContent here.';
    expect(yamlConfigToMarkdown(markdown)).toBe(markdown);
  });

  it('returns original content if YAML parsing fails', () => {
    const invalidYaml = 'name: [unclosed list';
    expect(yamlConfigToMarkdown(invalidYaml)).toBe(invalidYaml);
  });

  it('handles required_tools as array', () => {
    const yamlConfig = yaml.dump({
      apiVersion: 'skills.local/v1',
      kind: 'Skill',
      metadata: { name: 'tool-skill', scope: 'global' },
      spec: {
        description: 'Skill with tools',
        required_tools: ['bash', 'read', 'edit'],
      },
    });

    const result = yamlConfigToMarkdown(yamlConfig);
    expect(result).toContain('required_tools');
    expect(result).toContain('bash');
  });
});

describe('yamlConfigToMarkdown — Prompt', () => {
  it('converts a full prompt YAML config to markdown', () => {
    const yamlConfig = yaml.dump({
      apiVersion: 'prompts.local/v1',
      kind: 'Prompt',
      metadata: { name: 'test-prompt', scope: 'global' },
      spec: {
        description: 'A test prompt',
        kind: 'user',
        content: 'Process the following input:\n\n{{input}}',
      },
    });

    const result = yamlConfigToMarkdown(yamlConfig);
    expect(result).toContain('name: test-prompt');
    expect(result).toContain('kind: user');
    expect(result).toContain('Process the following input');
    expect(result).toContain('{{input}}');
  });
});

describe('yamlConfigToMarkdown — Template', () => {
  it('converts a full template YAML config to markdown', () => {
    const yamlConfig = yaml.dump({
      apiVersion: 'templates.local/v1',
      kind: 'Template',
      metadata: { name: 'test-template', scope: 'global' },
      spec: {
        description: 'A test template',
        format: 'json',
        target_kind: 'prompt',
        content: '{"result": "{{value}}"}',
      },
    });

    const result = yamlConfigToMarkdown(yamlConfig);
    expect(result).toContain('name: test-template');
    expect(result).toContain('format: json');
    expect(result).toContain('target_kind: prompt');
  });
});

describe('markdownToYamlConfig — Skill', () => {
  it('converts markdown with frontmatter to YAML config format', () => {
    const markdown = `---
name: test-skill
scope: global
description: A test skill
version: 2.0.0
author: Studio QA
license: MIT
required_tools:
  - bash
  - read
---

# Test Skill

Use this skill for testing.

## Usage

1. Read the codebase
2. Analyze patterns
`;

    const result = markdownToYamlConfig(markdown, 'Skill');

    // Parse the result as YAML to verify structure
    const parsed = yaml.load(result) as Record<string, unknown>;
    expect(parsed.apiVersion).toBe('skills.local/v1');
    expect(parsed.kind).toBe('Skill');
    expect((parsed.metadata as Record<string, unknown>).name).toBe('test-skill');
    expect((parsed.metadata as Record<string, unknown>).scope).toBe('global');
    expect((parsed.spec as Record<string, unknown>).description).toBe('A test skill');
    expect((parsed.spec as Record<string, unknown>).version).toBe('2.0.0');
    expect((parsed.spec as Record<string, unknown>).content).toContain('# Test Skill');
  });

  it('round-trips: yaml → markdown → yaml preserves content', () => {
    const originalYaml = yaml.dump({
      apiVersion: 'skills.local/v1',
      kind: 'Skill',
      metadata: { name: 'round-trip-skill', scope: 'global' },
      spec: {
        description: 'Testing round-trip conversion',
        version: '1.0.0',
        required_tools: ['bash'],
        content: '# Round Trip Skill\n\nContent here.',
      },
    });

    const markdown = yamlConfigToMarkdown(originalYaml);
    const restoredYaml = markdownToYamlConfig(markdown, 'Skill');

    const originalParsed = yaml.load(originalYaml) as Record<string, unknown>;
    const restoredParsed = yaml.load(restoredYaml) as Record<string, unknown>;

    expect((restoredParsed.metadata as Record<string, unknown>).name).toBe(
      (originalParsed.metadata as Record<string, unknown>).name
    );
    expect((restoredParsed.spec as Record<string, unknown>).content).toBe(
      (originalParsed.spec as Record<string, unknown>).content
    );
  });

  it('returns original content if not markdown format', () => {
    const yamlContent = 'apiVersion: skills.local/v1\nkind: Skill';
    expect(markdownToYamlConfig(yamlContent, 'Skill')).toBe(yamlContent);
  });

  it('returns original content if frontmatter is unclosed', () => {
    const unclosed = '---\nname: test\nunclosed frontmatter';
    expect(markdownToYamlConfig(unclosed, 'Skill')).toBe(unclosed);
  });

  it('returns original content if frontmatter YAML parsing fails', () => {
    const invalidFrontmatter = `---
name: [invalid yaml
---

# Body
`;
    expect(markdownToYamlConfig(invalidFrontmatter, 'Skill')).toBe(invalidFrontmatter);
  });

  it('handles body-only markdown (no frontmatter fields)', () => {
    const markdown = `# Just a heading

Some content without frontmatter.
`;
    const result = markdownToYamlConfig(markdown, 'Skill');
    // Should return as-is since it doesn't start with ---
    expect(result).toBe(markdown);
  });

  it('removes name and scope from spec (they are in metadata)', () => {
    const markdown = `---
name: metadata-skill
scope: global
description: Test
---

# Body
`;

    const result = markdownToYamlConfig(markdown, 'Skill');
    const parsed = yaml.load(result) as Record<string, unknown>;
    const spec = parsed.spec as Record<string, unknown>;

    // name and scope should be in metadata, not spec
    expect(spec).not.toHaveProperty('name');
    expect(spec).not.toHaveProperty('scope');
    expect((parsed.metadata as Record<string, unknown>).name).toBe('metadata-skill');
  });
});

describe('markdownToYamlConfig — Prompt', () => {
  it('converts markdown frontmatter to prompt YAML config', () => {
    const markdown = `---
name: test-prompt
scope: global
description: A test prompt
kind: user
---

Process the following:

{{input}}

Return JSON.
`;

    const result = markdownToYamlConfig(markdown, 'Prompt');
    const parsed = yaml.load(result) as Record<string, unknown>;

    expect(parsed.apiVersion).toBe('prompts.local/v1');
    expect(parsed.kind).toBe('Prompt');
    expect((parsed.spec as Record<string, unknown>).kind).toBe('user');
    expect((parsed.spec as Record<string, unknown>).content).toContain('Process the following');
  });
});

describe('markdownToYamlConfig — Template', () => {
  it('converts markdown frontmatter to template YAML config', () => {
    const markdown = `---
name: json-template
scope: global
description: JSON template
format: json
target_kind: prompt
---

{
  "result": "{{value}}",
  "timestamp": "{{timestamp}}"
}
`;

    const result = markdownToYamlConfig(markdown, 'Template');
    const parsed = yaml.load(result) as Record<string, unknown>;

    expect(parsed.apiVersion).toBe('templates.local/v1');
    expect(parsed.kind).toBe('Template');
    expect((parsed.spec as Record<string, unknown>).format).toBe('json');
    expect((parsed.spec as Record<string, unknown>).target_kind).toBe('prompt');
  });
});

describe('markdownToYamlConfig — edge cases', () => {
  it('handles empty frontmatter gracefully', () => {
    const markdown = `---
---

# Body content only
`;
    // When frontmatter is empty (--- immediately followed by ---),
    // the function returns the original content unchanged since
    // there's no meaningful frontmatter to convert.
    const result = markdownToYamlConfig(markdown, 'Skill');
    expect(result).toBe(markdown);
  });

  it('handles frontmatter with no body', () => {
    const markdown = `---
name: no-body
description: Test
---
`;
    const result = markdownToYamlConfig(markdown, 'Skill');
    const parsed = yaml.load(result) as Record<string, unknown>;
    expect((parsed.spec as Record<string, unknown>).content).toBe('');
  });

  it('preserves special characters in body content', () => {
    const markdown = `---
name: special-chars
---

# Title with "quotes" and 'apostrophes'

\`\`\`javascript
const x = { key: "value" };
\`\`\`
`;
    const result = markdownToYamlConfig(markdown, 'Skill');
    const parsed = yaml.load(result) as Record<string, unknown>;
    expect((parsed.spec as Record<string, unknown>).content).toContain('"quotes"');
    expect((parsed.spec as Record<string, unknown>).content).toContain("'apostrophes'");
  });

  it('uses default name when name is missing in frontmatter', () => {
    const markdown = `---
scope: global
description: No name field
---

# Body
`;
    const result = markdownToYamlConfig(markdown, 'Skill');
    const parsed = yaml.load(result) as Record<string, unknown>;
    expect((parsed.metadata as Record<string, unknown>).name).toBe('unnamed');
  });

  it('uses default scope when scope is missing', () => {
    const markdown = `---
name: no-scope
---

# Body
`;
    const result = markdownToYamlConfig(markdown, 'Skill');
    const parsed = yaml.load(result) as Record<string, unknown>;
    expect((parsed.metadata as Record<string, unknown>).scope).toBe('global');
  });
});
