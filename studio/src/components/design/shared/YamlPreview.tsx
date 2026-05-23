/**
 * YamlPreview — Read-only panel displaying a resource as formatted JSON/YAML.
 * Currently uses JSON.stringify; actual YAML conversion can be layered in later.
 */

export interface YamlPreviewProps {
  /** The resource data to serialize and display */
  data: unknown;
}

/**
 * Renders a read-only code block showing the serialized resource.
 * Uses JSON.stringify with 2-space indentation as a stand-in for YAML
 * until a yaml library is added to the studio bundle.
 */
export function YamlPreview({ data }: YamlPreviewProps) {
  const serialized = JSON.stringify(data, null, 2);

  return (
    <div className="h-full">
      <pre className="h-full text-xs font-mono text-secondary bg-surface-container border border-outline-variant rounded p-4 overflow-auto">
        {serialized}
      </pre>
    </div>
  );
}
