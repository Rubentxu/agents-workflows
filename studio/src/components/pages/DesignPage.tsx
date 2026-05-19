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

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-on-surface capitalize">
          {resourceType ?? section}
        </h1>
        <p className="text-sm text-secondary mt-1">
          Project: {projectId}
        </p>
      </div>

      {/* Placeholder — real list will come from registry MCP */}
      <div className="bg-surface border border-outline-variant rounded-lg p-8 text-center">
        <p className="text-secondary text-sm">
          {resourceType
            ? `No ${resourceType} found. Create one to get started.`
            : 'Select a resource type from the sidebar.'}
        </p>
      </div>
    </div>
  );
}
