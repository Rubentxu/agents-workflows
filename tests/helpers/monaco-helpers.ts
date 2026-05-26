/**
 * Monaco Editor Helpers for E2E Tests
 *
 * Provides utilities for interacting with Monaco editors in Playwright.
 * Monaco is rendered via @monaco-editor/react and uses a hidden textarea
 * for text input capture.
 */

import type { Page, Locator } from '@playwright/test';

type TestRegistryKind = 'yamlEditors' | 'markdownEditors' | 'workflowEditors';

/**
 * Monaco editor container selector
 */
export const MONACO_EDITOR_SELECTOR = '.monaco-editor';

/**
 * Monaco text input (the actual editable textarea inside Monaco)
 * Monaco uses different structures; try multiple selectors.
 */
export const MONACO_TEXTAREA_SELECTOR = '.monaco-editor textarea'; // Fallback selector for Monaco's actual textarea

/**
 * Wait for Monaco editor to be fully loaded and ready for input.
 * Monaco takes time to initialize its web worker and language services.
 */
export async function waitForMonacoReady(page: Page, timeout = 15000): Promise<void> {
  // Listen for console errors
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // First wait for Monaco container
  try {
    await page.waitForSelector(MONACO_EDITOR_SELECTOR, { timeout, state: 'attached' });
  } catch (e) {
    // Monaco container not found - dump debug info
    const pageContent = await page.content();
    const hasMonaco = pageContent.includes('monaco-editor');
    const hasWindowMonaco = await page.evaluate(() => !!(window as any).monaco);
    console.error('DEBUG: Monaco container not found. hasMonaco in DOM:', hasMonaco, 'window.monaco exists:', hasWindowMonaco);
    console.error('Console errors:', consoleErrors);
    throw e;
  }
  // Monaco is ready when the textarea inside it is focusable
  try {
    await page.waitForSelector(MONACO_TEXTAREA_SELECTOR, { timeout });
  } catch (e) {
    // Monaco container exists but textarea not found - check window.monaco
    const hasWindowMonaco = await page.evaluate(() => !!(window as any).monaco);
    const monacoEditors = await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.());
    console.error('DEBUG: Monaco textarea not found. window.monaco exists:', hasWindowMonaco, 'monaco.getEditors():', monacoEditors);
    console.error('Console errors:', consoleErrors);
    throw e;
  }
  // Additional wait: ensure Monaco editor instances are available via window.monaco
  try {
    await page.waitForFunction(
      () => {
        const editors = (window as any).monaco?.editor?.getEditors?.();
        return editors && editors.length > 0;
      },
      { timeout }
    );
  } catch (e) {
    const editors = await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.());
    console.error('DEBUG: Monaco editors not available. getEditors():', editors);
    console.error('Console errors:', consoleErrors);
    throw e;
  }
  // Additional settle time for Monaco language services
  await page.waitForTimeout(500);

  // CRITICAL: Also wait for the React ref (editorRef.current) to be set.
  // Monaco can be globally ready (window.monaco exists) but the React component's
  // onMount callback may not have fired yet, leaving editorRef.current null.
  // handleSave reads from editorRef.current?.getValue() with value as fallback,
  // so stale editorRef (null) causes save to use old React state.
  try {
    await page.waitForFunction(
      () => {
        // Check if any Monaco editor instance has been mounted in the DOM
        // AND that we have a reference to it via window.monaco
        const editors = (window as any).monaco?.editor?.getEditors?.();
        return editors && editors.length > 0 && editors[0]?.getModel?.() != null;
      },
      { timeout }
    );
  } catch (e) {
    console.error('DEBUG: Monaco editor model not available in React context');
    throw e;
  }
}

/**
 * Click on the Monaco editor to focus it.
 * This is often needed before typing.
 */
export async function focusMonaco(page: Page): Promise<void> {
  const editor = page.locator(MONACO_EDITOR_SELECTOR).first();
  await editor.click();
  await page.waitForTimeout(200);
}

/**
 * Type text into Monaco editor.
 * Handles the Monaco-specific input mechanism.
 *
 * Note: Monaco uses a hidden textarea for input. For simple fills,
 * we use the Monaco API via evaluate. For typed input, we click and use keyboard.
 */
export async function typeInMonaco(page: Page, text: string, options?: {
  clearFirst?: boolean;
  skipFocus?: boolean;
}): Promise<void> {
  const { clearFirst = false, skipFocus = false } = options ?? {};

  if (!skipFocus) {
    await focusMonaco(page);
  }

  if (clearFirst) {
    // Select all and delete
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
  }

  await page.keyboard.type(text, { delay: 10 });
}

/**
 * Fill Monaco using Monaco's command stack which properly triggers change events.
 * We use editor.action.replaceAll to replace all content which should properly
 * trigger all change listeners.
 */
export async function fillMonaco(page: Page, text: string): Promise<void> {
  await waitForMonacoReady(page);

  // Click to focus Monaco
  await page.locator('.monaco-editor').first().click();
  await page.waitForTimeout(100);

  // Use Monaco's built-in command to replace all content
  await page.evaluate((text: string) => {
    const monacoEditor = (window as any).monaco?.editor?.getEditors?.()?.[0];
    if (!monacoEditor) return;

    // First, select all content using Monaco command
    monacoEditor.getAction('editor.action.selectAll')?.run();

    // Then use executeEdits which properly fires events when triggered from a command
    const model = monacoEditor.getModel();
    if (model) {
      const selection = monacoEditor.getSelection();
      if (selection) {
        monacoEditor.executeEdits('e2e-fill', [{
          range: selection,
          text: text,
          forceMoveMarkers: true
        }]);
      } else {
        const range = model.getFullModelRange();
        monacoEditor.executeEdits('e2e-fill', [{
          range: range,
          text: text,
          forceMoveMarkers: true
        }]);
      }
    }

    // Manually trigger the onDidChangeModelContent event which React's onChange listens to.
    // This ensures React state is updated to match Monaco's model after programmatic edits.
    const event = {
      changes: [{
        range: model?.getFullModelRange() || { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
        rangeLength: 0,
        text: text
      }]
    };
    monacoEditor.onDidChangeModelContent?.(event);

    // Also trigger React synthetic event by dispatching input event on the textarea
    const textarea = monacoEditor.getDomNode?.()?.querySelector('textarea');
    if (textarea) {
      textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
  }, text);

  // Wait for React to process the state update
  await page.waitForTimeout(500);

  // Debug state
  const afterState = await page.evaluate(() => {
    const monacoEditor = (window as any).monaco?.editor?.getEditors?.()?.[0];
    return {
      value: monacoEditor?.getValue?.()?.substring(0, 50)
    };
  });
  console.log('After fill:', JSON.stringify(afterState));
}

async function callTestRegistry<T>(
  page: Page,
  kind: TestRegistryKind,
  key: string,
  method: string,
  ...args: unknown[]
): Promise<T> {
  // Wait for registry entry to exist and be ready (Monaco model loaded).
  await page.waitForFunction(
    ({ kind, key, method }) => {
      const registry = (window as any).__AW_MONACO_TEST__?.[kind];
      if (!registry?.[key]) return false;
      const editor = registry[key];
      // Check method exists AND ready promise resolves
      if (typeof editor[method] !== 'function') return false;
      // The ready promise is stored on the editor object
      return editor.ready !== undefined;
    },
    { kind, key, method },
    { timeout: 10000 }
  );

  // Wait for the ready promise to resolve (Monaco model is fully initialized).
  await page.evaluate(
    ({ kind, key }) => {
      const registry = (window as any).__AW_MONACO_TEST__?.[kind];
      const editor = registry?.[key];
      if (editor?.ready) {
        // Cast to Promise<unknown> since we don't have typed access here.
        return (editor.ready as Promise<unknown>).then(() => {});
      }
    },
    { kind, key }
  );

  return page.evaluate(
    ({ kind, key, method, args }) => {
      const registry = (window as any).__AW_MONACO_TEST__?.[kind];
      const editor = registry?.[key];
      if (!editor || typeof editor[method] !== 'function') {
        throw new Error(`Monaco test registry entry not found: ${kind}/${key}/${method}`);
      }
      return editor[method](...args);
    },
    { kind, key, method, args }
  );
}

export async function setYamlEditorValue(page: Page, arn: string, text: string): Promise<void> {
  await callTestRegistry(page, 'yamlEditors', arn, 'setValue', text);
  // Wait for React state to flush and Monaco model to settle after programmatic setValue.
  // setValue calls handleChange (async React state update) AND model.setValue (sync).
  // The editorRef.current must also be confirmed set (handled by waitForMonacoReady).
  // This extra settle time ensures the full React+Monaco update cycle completes.
  await page.waitForTimeout(300);
}

export async function getYamlEditorValue(page: Page, arn: string): Promise<string> {
  return callTestRegistry<string>(page, 'yamlEditors', arn, 'getValue');
}

export async function saveYamlEditor(page: Page, arn: string): Promise<void> {
  await callTestRegistry(page, 'yamlEditors', arn, 'save');
  await page.waitForTimeout(200);
}

export async function setMarkdownEditorValue(page: Page, arn: string, text: string): Promise<void> {
  await callTestRegistry(page, 'markdownEditors', arn, 'setValue', text);
  // Wait for React state to flush and Monaco model to settle after programmatic setValue.
  await page.waitForTimeout(300);
}

export async function getMarkdownEditorValue(page: Page, arn: string): Promise<string> {
  return callTestRegistry<string>(page, 'markdownEditors', arn, 'getValue');
}

export async function saveMarkdownEditor(page: Page, arn: string): Promise<void> {
  await callTestRegistry(page, 'markdownEditors', arn, 'save');
  await page.waitForTimeout(200);
}

export async function setMarkdownEditorSection(
  page: Page,
  arn: string,
  section: 'frontmatter' | 'body' | 'split'
): Promise<void> {
  await callTestRegistry(page, 'markdownEditors', arn, 'setSection', section);
  await page.waitForTimeout(100);
}

export async function setWorkflowEditorValue(page: Page, arn: string, text: string): Promise<void> {
  await callTestRegistry(page, 'workflowEditors', arn, 'setValue', text);
  // Wait for React state to flush and Monaco model to settle after programmatic setValue.
  await page.waitForTimeout(300);
}

export async function getWorkflowEditorValue(page: Page, arn: string): Promise<string> {
  return callTestRegistry<string>(page, 'workflowEditors', arn, 'getValue');
}

/**
 * Get the current content of a Monaco editor.
 * For split view editors (Skill/Prompt/Template), returns the frontmatter/YAML
 * content with --- markers reconstructed (the first editor shows frontmatter without markers).
 */
export async function getMonacoContent(page: Page): Promise<string> {
  return page.evaluate(() => {
    const editors = (window as any).monaco?.editor?.getEditors?.() ?? [];
    if (editors.length === 0) return '';

    // For split view editors: first editor is YAML/frontmatter (without --- markers),
    // second is body. Reconstruct --- markers for the test.
    for (let i = 0; i < editors.length; i++) {
      const editor = editors[i];
      const value = editor?.getValue?.() ?? '';
      if (value && value.includes(': ')) {
        // This looks like frontmatter content (YAML key-value pairs)
        // Check if it starts with 'name:' which indicates frontmatter without --- markers
        const firstLine = value.split('\n')[0]?.trim();
        if (firstLine && !firstLine.startsWith('---') && value.includes('scope:')) {
          // This is frontmatter content without --- markers, reconstruct them
          return `---\n${value}\n---`;
        }
        return value;
      }
    }

    // Fallback: return focused editor's content, or first editor's content
    const focused = editors.find((e: any) => e.hasTextFocus?.());
    if (focused) {
      const value = focused.getValue?.() ?? '';
      if (value) return value;
    }

    return editors[0]?.getValue?.() ?? '';
  });
}

/**
 * Wait for Monaco to show a validation error marker.
 * Useful for verifying YAML validation is working.
 */
export async function waitForMonacoError(page: Page, errorText: string, timeout = 5000): Promise<void> {
  // Monaco shows errors in the editor via decorations and the overview ruler
  // We can check for error class on the line
  await page.waitForTimeout(1000); // Wait for validation to run
  // Check if error is visible in the editor status area
  const errorLocator = page.locator('.monaco-editor .monaco-editor-overlaymessage');
  await expect(async () => {
    const errorVisible = await errorLocator.filter({ hasText: errorText }).isVisible().catch(() => false);
    if (!errorVisible) {
      throw new Error(`Expected Monaco error containing: ${errorText}`);
    }
  }).toPass({ timeout });
}

// Re-export expect for use in helper functions
import { expect } from '@playwright/test';

/**
 * Verify Monaco editor is visible and has the expected content.
 */
export async function expectMonacoContent(page: Page, expectedContent: string): Promise<void> {
  const content = await getMonacoContent(page);
  expect(content).toContain(expectedContent);
}

/**
 * Click a button in the Monaco toolbar area.
 * The toolbar is rendered above the editor by ResourceYamlEditor/MarkdownResourceEditor.
 * Note: The page may have duplicate buttons (e.g., Save in EditorLayout header and Monaco toolbar).
 * We target the Monaco toolbar specifically by finding buttons with bg-primary class.
 */
export async function clickMonacoToolbarButton(page: Page, buttonText: string): Promise<void> {
  // Monaco toolbar buttons have bg-primary class, EditorLayout buttons have btn class
  // Use .last() because Monaco toolbar Save is rendered after EditorLayout Save
  const monacoButton = page.locator(`button:has-text("${buttonText}"):not(.btn):not([class*="btn--"])`).last();
  await monacoButton.click();
}

/**
 * Get the Monaco toolbar Save button locator.
 * Use this when you need to assert on button state (enabled/disabled) during save operations.
 */
export function getMonacoSaveButton(page: Page): Locator {
  return page.locator('button:has-text("Save"):not(.btn):not([class*="btn--"])').last();
}

/**
 * Save button in the Monaco editor header.
 * ResourceYamlEditor and MarkdownResourceEditor render Save in their toolbar.
 */
export async function saveMonacoEditor(page: Page): Promise<void> {
  await clickMonacoToolbarButton(page, 'Save');
  // Wait for save to complete
  await page.waitForResponse(
    r => r.url().includes('/api/') && r.status() < 400,
    { timeout: 10000 }
  ).catch(() => {});
}

/**
 * For MarkdownResourceEditor: switch between frontmatter/body/split view.
 */
export async function switchMarkdownView(page: Page, view: 'frontmatter' | 'body' | 'split'): Promise<void> {
  const buttonMap = {
    frontmatter: 'YAML',
    body: 'MD',
    split: 'Split',
  };
  await page.getByRole('button', { name: buttonMap[view] }).click();
  await page.waitForTimeout(300); // Allow view to switch
}
