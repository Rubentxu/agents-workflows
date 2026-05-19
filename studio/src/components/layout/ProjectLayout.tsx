/**
 * ProjectLayout — layout wrapper for project-scoped routes.
 * Renders the left sidebar navigation and an Outlet for page content.
 */

import { Outlet, useParams, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function ProjectLayout() {
  const { projectId } = useParams();
  const location = useLocation();

  // Determine active section from current path
  const path = location.pathname;
  let activeSection: 'overview' | 'design' | 'observe' | 'registry' | 'admin' = 'overview';

  if (path.includes('/design/')) activeSection = 'design';
  else if (path.includes('/observe/')) activeSection = 'observe';
  else if (path.includes('/registry/')) activeSection = 'registry';
  else if (path.includes('/admin/')) activeSection = 'admin';
  else if (path.includes(`/projects/${projectId}$`)) activeSection = 'overview';

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left sidebar */}
      <Sidebar activeSection={activeSection} projectId={projectId} />

      {/* Page content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
