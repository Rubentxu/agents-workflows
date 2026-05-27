/**
 * Content Format Transformation Utilities
 *
 * Handles conversion between:
 * - YAML config format (apiVersion: skills.local/v1, kind: Skill, spec: {...})
 * - Markdown frontmatter format (---\nname: ...\n---\n# Body)
 *
 * Used by Skill, Prompt, and Template editor pages to bridge the storage format
 * (YAML config) with the editor format (markdown with frontmatter).
 */

import yaml from 'js-yaml';

/**
 * Check if content is in YAML config format (starts with apiVersion)
 */
export function isYamlConfigFormat(content: string): boolean {
  return content.includes('apiVersion:') && content.includes('kind:');
}

/**
 * Check if content is in markdown frontmatter format (starts with ---)
 */
export function isMarkdownFormat(content: string): boolean {
  const lines = content.split('\n');
  return lines[0]?.trim() === '---';
}

/**
 * Parse YAML config into structured object
 */
function parseYamlConfig(content: string): Record<string, unknown> | null {
  try {
    return yaml.load(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Convert YAML config format to markdown with frontmatter.
 * For skills/prompts/templates.
 */
export function yamlConfigToMarkdown(content: string): string {
  if (!isYamlConfigFormat(content)) {
    return content; // Already markdown or other format
  }

  const config = parseYamlConfig(content);
  if (!config) return content;

  const spec = (config['spec'] as Record<string, unknown>) || {};

  // Build frontmatter from spec fields
  const frontmatterLines: string[] = [];

  // metadata fields
  const metadata = (config['metadata'] as Record<string, unknown>) || {};
  if (metadata['name']) frontmatterLines.push(`name: ${metadata['name']}`);
  if (metadata['scope']) frontmatterLines.push(`scope: ${metadata['scope']}`);

  // spec fields that should be in frontmatter
  const fmFields = ['description', 'version', 'author', 'license', 'kind', 'format', 'target_kind', 'template'];
  for (const field of fmFields) {
    if (spec[field] !== undefined) {
      const value = spec[field];
      if (typeof value === 'string') {
        frontmatterLines.push(`${field}: ${value}`);
      } else if (typeof value === 'object' && value !== null) {
        frontmatterLines.push(`${field}: ${yaml.dump(value).trim()}`);
      } else {
        frontmatterLines.push(`${field}: ${String(value)}`);
      }
    }
  }

  // Handle required_tools, triggers, references as arrays
  // Arrays need proper block-style indentation when embedded in frontmatter:
  //   required_tools:
  //     - bash
  //     - read
  const arrayFields = ['required_tools', 'triggers', 'references', 'tags'];
  for (const field of arrayFields) {
    if (spec[field] !== undefined) {
      const dumped = yaml.dump(spec[field]).trim();
      const lines = dumped.split('\n');
      // First line: key on its own line
      frontmatterLines.push(`${field}:`);
      // Subsequent lines: each array item indented by 2 spaces
      for (const line of lines) {
        frontmatterLines.push(`  ${line}`);
      }
    }
  }

  // Build markdown body from spec.content (for skills/prompts) or spec.body
  let body = '';
  if (typeof spec['content'] === 'string') {
    body = spec['content'] as string;
  } else if (typeof spec['body'] === 'string') {
    body = spec['body'] as string;
  } else if (typeof spec['template'] === 'string') {
    body = spec['template'] as string;
  }

  return `---\n${frontmatterLines.join('\n')}\n---\n${body}`;
}

/**
 * Convert markdown with frontmatter to YAML config format.
 * For skills/prompts/templates.
 */
export function markdownToYamlConfig(
  content: string,
  kind: 'Skill' | 'Prompt' | 'Template'
): string {
  if (!isMarkdownFormat(content)) {
    return content; // Already YAML config or other format
  }

  const lines = content.split('\n');

  // Find frontmatter boundaries
  if (lines[0]?.trim() !== '---') {
    return content;
  }

  const endIndex = lines.slice(1).findIndex((line) => line.trim() === '---');
  if (endIndex === -1) {
    return content; // Unclosed frontmatter
  }

  // endIndex is relative to lines.slice(1), so add 1 to get absolute index
  const absoluteEndIndex = endIndex + 1;
  const frontmatter = lines.slice(1, absoluteEndIndex).join('\n');
  const body = lines.slice(absoluteEndIndex + 1).join('\n');

  // Parse frontmatter
  let frontmatterObj: Record<string, unknown> | null = null;
  try {
    frontmatterObj = yaml.load(frontmatter) as Record<string, unknown>;
  } catch {
    return content;
  }

  // Handle null/undefined result from yaml.load (e.g., empty string)
  if (frontmatterObj === null || frontmatterObj === undefined) {
    return content;
  }

  // Build YAML config structure
  const name = (frontmatterObj['name'] as string) || 'unnamed';
  const scope = (frontmatterObj['scope'] as string) || 'global';

  // Extract known fields that should be preserved in spec
  // (name/scope go to metadata, not spec)
  const {
    name: _,
    scope: __,
    description,
    version,
    author,
    license,
    required_tools,
    triggers,
    references,
    tags,
    kind: fmKind,
    format,
    target_kind,
    template,
    ...restFrontmatter
  } = frontmatterObj;

  // Determine which spec field receives the body, per resource type
  let specBodyField: string;
  let specBodyValue: unknown = body;
  if (kind === 'Prompt') {
    specBodyField = 'template';
    specBodyValue = body;
  } else if (kind === 'Template') {
    specBodyField = 'manifest';
    // Template body is a YAML/JSON manifest template, parse it
    try {
      specBodyValue = yaml.load(body) || body;
    } catch {
      specBodyValue = body;
    }
  } else {
    specBodyField = 'content';
    specBodyValue = body;
  }

  const config: Record<string, unknown> = {
    apiVersion: `${kind.toLowerCase()}s.local/v1`,
    kind,
    metadata: {
      name,
      scope,
    },
    spec: {
      // Preserve frontmatter fields in spec
      ...restFrontmatter,
      // Explicitly include fields that might have been extracted above
      ...(description !== undefined && { description }),
      ...(version !== undefined && { version }),
      ...(author !== undefined && { author }),
      ...(license !== undefined && { license }),
      ...(required_tools !== undefined && { required_tools }),
      ...(triggers !== undefined && { triggers }),
      ...(references !== undefined && { references }),
      ...(tags !== undefined && { tags }),
      ...(fmKind !== undefined && { kind: fmKind }),
      ...(format !== undefined && { format }),
      ...(target_kind !== undefined && { target_kind }),
      ...(template !== undefined && { template }),
      [specBodyField]: specBodyValue,
    },
  };

  return yaml.dump(config, { indent: 2, lineWidth: -1, noRefs: true });
}
