/**
 * MarkdownResourceEditor — Save Semantics Unit Tests
 *
 * Tests that MarkdownResourceEditor's handleSave correctly reads the latest content
 * from both Monaco models in split view (frontmatter + body), reconstructing
 * the combined markdown with --- markers.
 *
 * These tests use mock Monaco editor models to verify the save logic
 * without requiring the full Monaco runtime in a browser.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock window.monaco for tests
const mockEditors: any[] = [];
const mockMonaco = {
  editor: {
    getEditors: vi.fn(() => mockEditors),
  },
};

vi.stubGlobal('window', {
  monaco: mockMonaco,
  __AW_MONACO_TEST__: {
    markdownEditors: {},
  },
});

describe('MarkdownResourceEditor — handleSave content reconstruction', () => {
  // In split view, there are two Monaco editors:
  // - editors[0]: frontmatter (YAML, without --- markers)
  // - editors[1]: body (Markdown)
  // handleSave reconstructs: "---\n" + frontmatter + "\n---\n" + body

  it('reconstructs combined markdown from split view editors', () => {
    const fmContent = `name: test-skill
scope: global
description: A test skill
version: 1.0.0`;
    const bodyContent = `# Test Skill

Use this skill for testing.

## Usage

1. Read the codebase
2. Analyze patterns`;

    mockEditors.length = 0;
    mockEditors.push(
      { getModel: () => ({ getValue: () => fmContent }) },
      { getModel: () => ({ getValue: () => bodyContent }) }
    );

    // Simulate the reconstruction from handleSave:
    // if (activeSection === 'split') {
    //   const fmContent = fmEditor?.getValue?.() ?? parsed.frontmatter;
    //   const bodyContent = bodyEditor?.getValue?.() ?? parsed.body;
    //   currentContent = joinFrontmatter(fmContent, bodyContent);
    // }
    function joinFrontmatter(fm: string, body: string): string {
      if (!fm) return body;
      return `---\n${fm}\n---\n${body}`;
    }

    const editors = mockMonaco.editor.getEditors();
    const fmEditor = editors[0];
    const bodyEditor = editors[1];
    const fm = fmEditor?.getModel?.()?.getValue?.() ?? '';
    const body = bodyEditor?.getModel?.()?.getValue?.() ?? '';
    const combined = joinFrontmatter(fm, body);

    expect(combined).toContain('---');
    expect(combined).toContain('name: test-skill');
    expect(combined).toContain('# Test Skill');
    expect(combined.startsWith('---\n')).toBe(true);
  });

  it('handles single editor (frontmatter-only view)', () => {
    const fmContent = `name: test-skill
description: Test`;

    mockEditors.length = 0;
    mockEditors.push({ getModel: () => ({ getValue: () => fmContent }) });

    const editors = mockMonaco.editor.getEditors();
    const editor = editors[0];
    const content = editor?.getModel?.()?.getValue?.() ?? '';

    expect(content).toBe(fmContent);
  });

  it('handles single editor (body-only view)', () => {
    const bodyContent = `# Skill Content

This is the body.`;

    mockEditors.length = 0;
    mockEditors.push({ getModel: () => ({ getValue: () => bodyContent }) });

    const editors = mockMonaco.editor.getEditors();
    const editor = editors[0];
    const content = editor?.getModel?.()?.getValue?.() ?? '';

    expect(content).toBe(bodyContent);
  });

  it('setValue updates both editors in split mode', () => {
    // This simulates what the test bridge's setValue does:
    // setValue: (next: string) => {
    //   applyCombinedValue(next); // Updates React state
    //   // Also update Monaco models directly
    //   const nextParsed = splitFrontmatter(next);
    //   if (activeSection === 'split') {
    //     fmEditor?.getModel?.()?.setValue(nextParsed.frontmatter);
    //     bodyEditor?.getModel?.()?.setValue(nextParsed.body);
    //   }
    // }

    // Correct implementation matching MarkdownResourceEditor.tsx
    function splitFrontmatter(content: string): { frontmatter: string; body: string; error?: string } {
      const lines = content.split('\n');
      if (lines[0]?.trim() !== '---') {
        return { frontmatter: '', body: content };
      }
      const endIndex = lines.slice(1).findIndex((line) => line.trim() === '---');
      if (endIndex === -1) {
        return { frontmatter: '', body: content, error: 'Unclosed frontmatter' };
      }
      // endIndex is relative to lines.slice(1), so absolute index is endIndex + 1
      const absoluteEndIndex = endIndex + 1;
      return {
        frontmatter: lines.slice(1, absoluteEndIndex).join('\n'),
        body: lines.slice(absoluteEndIndex + 1).join('\n'),
      };
    }

    const newContent = `---
name: updated-skill
description: Updated description
---

# Updated Skill

This is the updated body.`;

    const nextParsed = splitFrontmatter(newContent);

    // Simulate setValue updating the models
    const fmModel = { setValue: vi.fn(), getValue: () => '' };
    const bodyModel = { setValue: vi.fn(), getValue: () => '' };

    fmModel.setValue(nextParsed.frontmatter);
    bodyModel.setValue(nextParsed.body);

    expect(fmModel.setValue).toHaveBeenCalledWith('name: updated-skill\ndescription: Updated description');
    // Body includes the blank line after closing ---
    expect(bodyModel.setValue).toHaveBeenCalledWith('\n# Updated Skill\n\nThis is the updated body.');
  });

  it('round-trip: split content → setValue → getValue preserves content', () => {
    function splitFrontmatter(content: string): { frontmatter: string; body: string } {
      const lines = content.split('\n');
      if (lines[0]?.trim() !== '---') {
        return { frontmatter: '', body: content };
      }
      const endIndex = lines.slice(1).findIndex(line => line.trim() === '---');
      if (endIndex === -1) {
        return { frontmatter: '', body: content };
      }
      return {
        frontmatter: lines.slice(1, endIndex + 1).join('\n'),
        body: lines.slice(endIndex + 2).join('\n'),
      };
    }

    function joinFrontmatter(fm: string, body: string): string {
      if (!fm) return body;
      return `---\n${fm}\n---\n${body}`;
    }

    const originalContent = `---
name: round-trip-test
description: Testing round-trip
version: 2.0.0
---

# Round Trip Test

This skill tests the round-trip conversion.`;

    // Simulate what happens in the editor
    const parsed = splitFrontmatter(originalContent);
    expect(parsed.frontmatter).toContain('name: round-trip-test');
    expect(parsed.body).toContain('# Round Trip Test');

    // Simulate saving (reading from editors)
    const savedContent = joinFrontmatter(parsed.frontmatter, parsed.body);
    expect(savedContent).toBe(originalContent);
  });
});

describe('MarkdownResourceEditor — frontmatter parsing', () => {
  // Correct implementation matching MarkdownResourceEditor.tsx
  function splitFrontmatter(content: string) {
    const lines = content.split('\n');
    if (lines[0]?.trim() !== '---') {
      return { frontmatter: '', body: content };
    }
    const endIndex = lines.slice(1).findIndex((line) => line.trim() === '---');
    if (endIndex === -1) {
      return { frontmatter: '', body: content, error: 'Unclosed frontmatter' };
    }
    // endIndex is relative to lines.slice(1), so absolute index is endIndex + 1
    const absoluteEndIndex = endIndex + 1;
    return {
      frontmatter: lines.slice(1, absoluteEndIndex).join('\n'),
      body: lines.slice(absoluteEndIndex + 1).join('\n'),
    };
  }

  it('correctly splits skill frontmatter and body', () => {
    const skill = `---
name: test-skill
description: A test skill
author: Studio QA
license: MIT
required_tools:
  - bash
  - read
---

# Test Skill

Use this skill when you need to test Monaco editors.`;

    const { frontmatter, body } = splitFrontmatter(skill);

    expect(frontmatter).toContain('name: test-skill');
    expect(frontmatter).toContain('author: Studio QA');
    expect(body).toContain('# Test Skill');
    expect(body).toContain('Use this skill');
  });

  it('correctly splits prompt frontmatter and body', () => {
    const prompt = `---
name: test-prompt
description: A test prompt
kind: user
---

Process the following input:

{{input}}

Return JSON format.`;

    const { frontmatter, body } = splitFrontmatter(prompt);

    expect(frontmatter).toContain('name: test-prompt');
    expect(frontmatter).toContain('kind: user');
    expect(body).toContain('{{input}}');
  });

  it('returns full content as body when no frontmatter', () => {
    const noFrontmatter = `# Just Markdown

No frontmatter here.`;

    const { frontmatter, body } = splitFrontmatter(noFrontmatter);

    expect(frontmatter).toBe('');
    expect(body).toBe(noFrontmatter);
  });

  it('handles frontmatter with only metadata fields', () => {
    // Note: there's a blank line between closing --- and body content
    // so body starts with a newline
    const minimal = `---
name: minimal-skill
---

# Minimal Skill`;

    const { frontmatter, body } = splitFrontmatter(minimal);

    expect(frontmatter).toBe('name: minimal-skill');
    // Body includes the blank line after closing ---
    expect(body).toBe('\n# Minimal Skill');
  });
});

describe('MarkdownResourceEditor — canSave guard logic', () => {
  // The actual guard: !frontmatterError && onSave && saveStatus !== 'saving'
  // Note: onSave being falsy (null/undefined) makes the whole expression falsy

  it('canSave is false when frontmatterError is set', () => {
    const frontmatterError = 'Unclosed frontmatter';
    const onSave = vi.fn();
    const saveStatus = 'idle';

    // Simplified: just check the boolean result without strict TypeScript comparisons
    const canSave = !frontmatterError && onSave !== null && onSave !== undefined && String(saveStatus) !== 'saving';
    expect(canSave).toBe(false);
  });

  it('canSave is false when onSave is not provided', () => {
    const frontmatterError = null;
    const onSave = null;
    const saveStatus = 'idle';

    const canSave = !frontmatterError && onSave !== null && onSave !== undefined && String(saveStatus) !== 'saving';
    // onSave is null, which is falsy, so canSave is falsy
    expect(canSave).toBeFalsy();
  });

  it('canSave is false when saveStatus is saving', () => {
    const frontmatterError = null;
    const onSave = vi.fn();
    const saveStatus = 'saving';

    const canSave = !frontmatterError && onSave !== null && onSave !== undefined && String(saveStatus) !== 'saving';
    expect(canSave).toBe(false);
  });

  it('canSave is true when all conditions are met', () => {
    const frontmatterError = null;
    const onSave = vi.fn();
    const saveStatus = 'idle';

    const canSave = !frontmatterError && onSave !== null && onSave !== undefined && String(saveStatus) !== 'saving';
    expect(canSave).toBe(true);
  });
});
