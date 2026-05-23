import { Outlet, useParams, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function ProjectLayout() {
  const { projectId } = useParams();
  const location = useLocation();

  const path = location.pathname;
  let activeSection: 'overview' | 'design' | 'observe' | 'registry' | 'admin' = 'overview';

  if (path.includes('/design/')) activeSection = 'design';
  else if (path.includes('/observe/')) activeSection = 'observe';
  else if (path.includes('/registry/')) activeSection = 'registry';
  else if (path.includes('/admin/')) activeSection = 'admin';

  return (
    <>
      <Sidebar activeSection={activeSection} projectId={projectId} />
      <main role="main" className="app-shell__project-main">
        <Outlet />
      </main>
    </>
  );
}
