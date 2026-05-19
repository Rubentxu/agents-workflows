/**
 * Sidebar — left navigation panel.
 * Groups: Overview, Design, Observe, Registry, Admin.
 * Each group contains relevant navigation links.
 */

import { Link, useLocation } from 'react-router-dom';

interface SidebarProps {
  activeSection: 'overview' | 'design' | 'observe' | 'registry' | 'admin';
  projectId?: string;
}

const PROJECT_BASE = (id: string) => `/studio/projects/${id}`;

export function Sidebar({ activeSection, projectId }: SidebarProps) {
  const location = useLocation();
  if (!projectId) return null;

  const base = PROJECT_BASE(projectId);

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col border-r border-border-subtle bg-bg-surface overflow-y-auto">
      {/* Overview */}
      <NavSection title="Overview">
        <NavItem
          to={base}
          label="Dashboard"
          active={activeSection === 'overview' && location.pathname === base}
        />
      </NavSection>

      {/* Design */}
      <NavSection title="Design">
        <NavItem
          to={`${base}/design/workflows`}
          label="Workflows"
          active={activeSection === 'design' && isActive(`${base}/design/workflows`)}
        />
        <NavItem
          to={`${base}/design/agents`}
          label="Agents"
          active={activeSection === 'design' && isActive(`${base}/design/agents`)}
        />
        <NavItem
          to={`${base}/design/skills`}
          label="Skills"
          active={activeSection === 'design' && isActive(`${base}/design/skills`)}
        />
        <NavItem
          to={`${base}/design/prompts`}
          label="Prompts"
          active={activeSection === 'design' && isActive(`${base}/design/prompts`)}
        />
        <NavItem
          to={`${base}/design/tools`}
          label="Tools"
          active={activeSection === 'design' && isActive(`${base}/design/tools`)}
        />
        <NavItem
          to={`${base}/design/templates`}
          label="Templates"
          active={activeSection === 'design' && isActive(`${base}/design/templates`)}
        />
      </NavSection>

      {/* Observe */}
      <NavSection title="Observe">
        <NavItem
          to={`${base}/observe/agent-executions`}
          label="Agent Executions"
          active={activeSection === 'observe' && isActive(`${base}/observe/agent-executions`)}
        />
        <NavItem
          to={`${base}/observe/insights`}
          label="Insights"
          active={activeSection === 'observe' && isActive(`${base}/observe/insights`)}
        />
        <NavItem
          to={`${base}/observe/artifacts`}
          label="Artifacts"
          active={activeSection === 'observe' && isActive(`${base}/observe/artifacts`)}
        />
        <NavItem
          to={`${base}/observe/metrics`}
          label="Metrics"
          active={activeSection === 'observe' && isActive(`${base}/observe/metrics`)}
        />
        <NavItem
          to={`${base}/observe/alerts`}
          label="Alerts"
          active={activeSection === 'observe' && isActive(`${base}/observe/alerts`)}
        />
      </NavSection>

      {/* Registry */}
      <NavSection title="Registry">
        <NavItem
          to={`${base}/registry/resources`}
          label="Resources"
          active={activeSection === 'registry' && isActive(`${base}/registry/resources`)}
        />
        <NavItem
          to={`${base}/registry/overrides`}
          label="Overrides"
          active={activeSection === 'registry' && isActive(`${base}/registry/overrides`)}
        />
        <NavItem
          to={`${base}/registry/dependencies`}
          label="Dependencies"
          active={activeSection === 'registry' && isActive(`${base}/registry/dependencies`)}
        />
      </NavSection>

      {/* Admin */}
      <NavSection title="Admin">
        <NavItem
          to={`${base}/admin/workspaces`}
          label="Workspaces"
          active={activeSection === 'admin' && isActive(`${base}/admin/workspaces`)}
        />
        <NavItem
          to={`${base}/admin/settings`}
          label="Settings"
          active={activeSection === 'admin' && isActive(`${base}/admin/settings`)}
        />
        <NavItem
          to={`${base}/admin/integrations`}
          label="Integrations"
          active={activeSection === 'admin' && isActive(`${base}/admin/integrations`)}
        />
      </NavSection>
    </aside>
  );
}

function NavSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <div className="px-4 py-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
        {title}
      </div>
      <nav className="space-y-0.5">{children}</nav>
    </div>
  );
}

interface NavItemProps {
  to: string;
  label: string;
  active: boolean;
}

function NavItem({ to, label, active }: NavItemProps) {
  return (
    <Link
      to={to}
      className={`block px-4 py-1.5 mx-2 text-sm rounded transition-colors ${
        active
          ? 'bg-accent/10 text-accent font-medium'
          : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
      }`}
    >
      {label}
    </Link>
  );
}
