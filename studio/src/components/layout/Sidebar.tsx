import { Link, useLocation } from 'react-router-dom';
import { useShellContext } from './StudioShell';

interface SidebarProps {
  activeSection?: 'overview' | 'design' | 'observe' | 'registry' | 'admin';
  projectId?: string;
}

const PROJECT_BASE = (id: string) => `/studio/projects/${id}`;

interface NavItemDef {
  to: string;
  label: string;
  icon: string;
  section: string;
}

interface NavSectionDef {
  title: string;
  items: NavItemDef[];
}

function buildSections(base: string): NavSectionDef[] {
  return [
    {
      title: 'Overview',
      items: [
        { to: base, label: 'Dashboard', icon: '◐', section: 'overview' },
      ],
    },
    {
      title: 'Design',
      items: [
        { to: `${base}/design/workflows`, label: 'Workflows', icon: '◇', section: 'design' },
        { to: `${base}/design/agents`, label: 'Agents', icon: '⬡', section: 'design' },
        { to: `${base}/design/skills`, label: 'Skills', icon: '⬢', section: 'design' },
        { to: `${base}/design/prompts`, label: 'Prompts', icon: '◈', section: 'design' },
        { to: `${base}/design/tools`, label: 'Tools', icon: '⚙', section: 'design' },
        { to: `${base}/design/templates`, label: 'Templates', icon: '▢', section: 'design' },
      ],
    },
    {
      title: 'Observe',
      items: [
        { to: `${base}/observe/agent-executions`, label: 'Executions', icon: '▶', section: 'observe' },
        { to: `${base}/observe/insights`, label: 'Insights', icon: '◉', section: 'observe' },
        { to: `${base}/observe/artifacts`, label: 'Artifacts', icon: '☋', section: 'observe' },
        { to: `${base}/observe/metrics`, label: 'Metrics', icon: '◫', section: 'observe' },
        { to: `${base}/observe/alerts`, label: 'Alerts', icon: '△', section: 'observe' },
      ],
    },
    {
      title: 'Registry',
      items: [
        { to: `${base}/registry/resources`, label: 'Resources', icon: '◫', section: 'registry' },
        { to: `${base}/registry/overrides`, label: 'Overrides', icon: '↻', section: 'registry' },
        { to: `${base}/registry/dependencies`, label: 'Dependencies', icon: '⟐', section: 'registry' },
      ],
    },
    {
      title: 'Admin',
      items: [
        { to: `${base}/admin/workspaces`, label: 'Workspaces', icon: '▣', section: 'admin' },
        { to: `${base}/admin/settings`, label: 'Settings', icon: '⚙', section: 'admin' },
        { to: `${base}/admin/integrations`, label: 'Integrations', icon: '⇄', section: 'admin' },
      ],
    },
  ];
}

export function Sidebar({ projectId }: SidebarProps) {
  const location = useLocation();
  const { sidebarCollapsed, mobileMenuOpen, setMobileMenuOpen } = useShellContext();

  if (!projectId) return null;

  const base = PROJECT_BASE(projectId);
  const sections = buildSections(base);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const handleNavClick = () => {
    if (mobileMenuOpen) {
      setMobileMenuOpen(false);
    }
  };

  return (
    <aside
      className={`app-shell__sidebar${mobileMenuOpen ? ' app-shell__sidebar--mobile-open' : ''}`}
      role="navigation"
      aria-label="Main navigation"
    >
      {sections.map((section) => (
        <div key={section.title} className="nav-section">
          <div className="nav-section__label">{section.title}</div>
          <nav>
            {section.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={handleNavClick}
                className={`nav-item${isActive(item.to) ? ' nav-item--active' : ''}`}
                title={sidebarCollapsed ? item.label : undefined}
                aria-current={isActive(item.to) ? 'page' : undefined}
              >
                <span className="nav-item__icon" aria-hidden="true">{item.icon}</span>
                <span className="nav-item__label">{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      ))}
    </aside>
  );
}
