/**
 * DesignPage — /studio/projects/:projectId/design
 * Design section listing resources of a given type.
 */

import { useParams } from 'react-router-dom';

interface DesignPageProps {
  section?: string;
  resourceType?: string;
}

export function DesignPage({ section, resourceType }: DesignPageProps) {
  const { projectId } = useParams();
  const quickLinks = [
    { label: 'Workflows', href: `/studio/projects/${projectId}/design/workflows` },
    { label: 'Agents', href: `/studio/projects/${projectId}/design/agents` },
    { label: 'Skills', href: `/studio/projects/${projectId}/design/skills` },
  ];

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-on-surface capitalize">
          {resourceType ?? section}
        </h1>
        <p className="text-sm text-secondary mt-1">
          Project: {projectId}
        </p>
      </div>

      {/* Placeholder — real list will come from registry MCP */}
      <div className="rounded-lg border border-outline-variant bg-surface p-6 text-center sm:p-8">
        <p className="text-sm text-secondary">
          {resourceType
            ? `No ${resourceType} found. Create one to get started.`
            : 'Select a resource type from the sidebar.'}
        </p>
        {!resourceType && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {quickLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="rounded border border-outline-variant px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                Open {link.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
