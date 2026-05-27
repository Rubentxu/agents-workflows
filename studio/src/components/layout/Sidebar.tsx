/**
 * Sidebar — Main navigation sidebar for Workflow Studio.
 * Uses Lucide React icons with a clean, professional SaaS aesthetic.
 * Matches the design spec: outline icons, 16px, consistent spacing,
 * blue active state, subtle hover, section labels in uppercase.
 */

import { Link, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Workflow,
  Bot,
  Layers,
  MessageSquareText,
  Wrench,
  FileText,
  Play,
  BarChart3,
  Package,
  ChartNoAxesCombined,
  TriangleAlert,
  Database,
  SlidersHorizontal,
  Network,
  Grid3X3,
  Settings,
  Plug,
} from 'lucide-react';
import { useShellContext } from './StudioShell';

// ─── Types ────────────────────────────────────────────────────────

interface SidebarProps {
  activeSection?: 'overview' | 'design' | 'observe' | 'registry' | 'admin';
  projectId?: string;
}

interface NavItemDef {
  to: string;
  label: string;
  icon: LucideIcon;
  section: string;
}

interface NavSectionDef {
  title: string;
  items: NavItemDef[];
}

// ─── Helpers ──────────────────────────────────────────────────────

const PROJECT_BASE = (id: string) => `/studio/projects/${id}`;

function toTestId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ─── Navigation config with Lucide icons ──────────────────────────

function buildSections(base: string): NavSectionDef[] {
  return [
    {
      title: 'Overview',
      items: [
        { to: base, label: 'Dashboard', icon: LayoutDashboard, section: 'overview' },
      ],
    },
    {
      title: 'Design',
      items: [
        { to: `${base}/design/workflows`, label: 'Workflows', icon: Workflow, section: 'design' },
        { to: `${base}/design/agents`, label: 'Agents', icon: Bot, section: 'design' },
        { to: `${base}/design/skills`, label: 'Skills', icon: Layers, section: 'design' },
        { to: `${base}/design/prompts`, label: 'Prompts', icon: MessageSquareText, section: 'design' },
        { to: `${base}/design/tools`, label: 'Tools', icon: Wrench, section: 'design' },
        { to: `${base}/design/templates`, label: 'Templates', icon: FileText, section: 'design' },
      ],
    },
    {
      title: 'Observe',
      items: [
        { to: `${base}/observe/agent-executions`, label: 'Agent Executions', icon: Play, section: 'observe' },
        { to: `${base}/observe/insights`, label: 'Insights', icon: BarChart3, section: 'observe' },
        { to: `${base}/observe/artifacts`, label: 'Artifacts', icon: Package, section: 'observe' },
        { to: `${base}/observe/metrics`, label: 'Metrics', icon: ChartNoAxesCombined, section: 'observe' },
        { to: `${base}/observe/alerts`, label: 'Alerts', icon: TriangleAlert, section: 'observe' },
      ],
    },
    {
      title: 'Registry',
      items: [
        { to: `${base}/registry/resources`, label: 'Resources', icon: Database, section: 'registry' },
        { to: `${base}/registry/overrides`, label: 'Overrides', icon: SlidersHorizontal, section: 'registry' },
        { to: `${base}/registry/dependencies`, label: 'Dependencies', icon: Network, section: 'registry' },
      ],
    },
    {
      title: 'Admin',
      items: [
        { to: `${base}/admin/workspaces`, label: 'Workspaces', icon: Grid3X3, section: 'admin' },
        { to: `${base}/admin/settings`, label: 'Settings', icon: Settings, section: 'admin' },
        { to: `${base}/admin/integrations`, label: 'Integrations', icon: Plug, section: 'admin' },
      ],
    },
  ];
}

// ─── Sidebar Item ─────────────────────────────────────────────────

function SidebarItem({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: NavItemDef;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      to={item.to}
      onClick={onClick}
      className={[
        'nav-item group',
        active ? 'nav-item--active' : '',
      ].filter(Boolean).join(' ')}
      title={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      data-testid={`sidebar-nav-${toTestId(item.label)}`}
    >
      <Icon
        className={[
          'nav-item__icon',
          active
            ? 'nav-item__icon--active'
            : 'nav-item__icon--default',
        ].join(' ')}
        size={16}
        strokeWidth={active ? 2 : 1.8}
        aria-hidden="true"
      />
      <span className="nav-item__label">{item.label}</span>
    </Link>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────

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
      className={[
        'app-shell__sidebar',
        mobileMenuOpen ? ' app-shell__sidebar--mobile-open' : '',
      ].join('')}
      id="sidebar-navigation"
      role="navigation"
      aria-label="Main navigation"
      data-testid="sidebar-navigation"
    >
      <div className="sidebar-scroll">
        {sections.map((section) => (
          <div key={section.title} className="nav-section" data-testid={`sidebar-section-${toTestId(section.title)}`}>
            <div className="nav-section__label">{section.title}</div>
            <nav className="nav-section__items">
              {section.items.map((item) => (
                <SidebarItem
                  key={item.to}
                  item={item}
                  active={isActive(item.to)}
                  collapsed={sidebarCollapsed}
                  onClick={handleNavClick}
                />
              ))}
            </nav>
          </div>
        ))}
      </div>
    </aside>
  );
}
