/**
 * ObservePage — /studio/projects/:projectId/observe
 * Observe section for agent executions, insights, artifacts, metrics, alerts.
 */

import { useParams } from 'react-router-dom';

interface ObservePageProps {
  section?: string;
}

export function ObservePage({ section }: ObservePageProps) {
  const { projectId } = useParams();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-on-surface capitalize">
          {section}
        </h1>
        <p className="text-sm text-secondary mt-1">
          Project: {projectId}
        </p>
      </div>

      <div className="bg-surface border border-outline-variant rounded-lg p-8 text-center">
        <p className="text-secondary text-sm">
          {section} view — data comes from Agent Executions reported via MCP/Insights.
        </p>
      </div>
    </div>
  );
}
