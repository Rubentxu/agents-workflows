/**
 * Studio route configuration.
 * Follows the route map defined in docs/studio-redesign.md.
 */

import { Route, createBrowserRouter, createRoutesFromElements, useParams } from 'react-router-dom';

// Layout
import { StudioShell } from '@/components/layout/StudioShell';
import { ProjectLayout } from '@/components/layout/ProjectLayout';

// Pages
import { ProjectsPage } from '@/components/pages/ProjectsPage';
import { ProjectDashboardPage } from '@/components/pages/ProjectDashboardPage';
import { DesignPage } from '@/components/pages/DesignPage';
import { ObservePage } from '@/components/pages/ObservePage';
import { RegistryPage } from '@/components/pages/RegistryPage';
import { ResourceDetailPage } from '@/components/pages/ResourceDetailPage';
import { AdminPage } from '@/components/pages/AdminPage';
import { NotFoundPage } from '@/components/pages/NotFoundPage';

// Design — Editors (full implementations)
import { WorkflowEditorPage } from '@/components/design/WorkflowEditorPage';
import { AgentEditorPage } from '@/components/design/AgentEditorPage';
import { SkillEditorPage } from '@/components/design/SkillEditorPage';
import { PromptEditorPage } from '@/components/design/PromptEditorPage';
import { ToolEditorPage } from '@/components/design/ToolEditorPage';
import { TemplateEditorPage } from '@/components/design/TemplateEditorPage';

// Design — Generic catalog (single deep module)
import { ResourceCatalogPage } from '@/components/design/ResourceCatalogPage';
import { useMcpTools } from '@/hooks/useMcpTools';

// Observe
import { AgentExecutionListPage } from '@/components/observe/AgentExecutionListPage';
import { AgentExecutionDetailPage } from '@/components/observe/AgentExecutionDetailPage';
import { InsightsListPage } from '@/components/observe/InsightsListPage';
import { ArtifactsListPage } from '@/components/observe/ArtifactsListPage';
import { MetricsPage } from '@/components/observe/MetricsPage';
import { AlertsPage } from '@/components/observe/AlertsPage';

// Registry
import { DependenciesPage } from '@/components/registry/DependenciesPage';

// ─────────────────────────────────────────────────────────────────────────────
// Catalog route configs — each catalog is a thin wrapper around ResourceCatalogPage
// ─────────────────────────────────────────────────────────────────────────────

function WorkflowsCatalog() {
  const { projectId } = useParams();
  const { listWorkflows } = useMcpTools();
  return (
    <ResourceCatalogPage
      resourceLabel="Workflows"
      resourceType="workflow"
      accentColor="blue"
      fetchFn={listWorkflows}
      createPath={`/studio/projects/${projectId}/design/workflows/new/editor`}
      editorPath={(id) => `/studio/projects/${projectId}/design/workflows/${encodeURIComponent(id)}/editor`}
      projectId={projectId}
      deletable
    />
  );
}

function AgentsCatalog() {
  const { projectId } = useParams();
  const { listAgents } = useMcpTools();
  return (
    <ResourceCatalogPage
      resourceLabel="Agents"
      resourceType="agent"
      accentColor="purple"
      fetchFn={listAgents}
      createPath={`/studio/projects/${projectId}/design/agents/new/editor`}
      editorPath={(id) => `/studio/projects/${projectId}/design/agents/${encodeURIComponent(id)}/editor`}
      projectId={projectId}
      deletable
    />
  );
}

function SkillsCatalog() {
  const { projectId } = useParams();
  const { listSkills } = useMcpTools();
  return (
    <ResourceCatalogPage
      resourceLabel="Skills"
      resourceType="skill"
      accentColor="green"
      fetchFn={listSkills}
      createPath={`/studio/projects/${projectId}/design/skills/new/editor`}
      editorPath={(id) => `/studio/projects/${projectId}/design/skills/${encodeURIComponent(id)}/editor`}
      projectId={projectId}
      deletable
    />
  );
}

function PromptsCatalog() {
  const { projectId } = useParams();
  const { listPrompts } = useMcpTools();
  return (
    <ResourceCatalogPage
      resourceLabel="Prompts"
      resourceType="prompt"
      accentColor="blue"
      fetchFn={listPrompts}
      createPath={`/studio/projects/${projectId}/design/prompts/new/editor`}
      editorPath={(id) => `/studio/projects/${projectId}/design/prompts/${encodeURIComponent(id)}/editor`}
      projectId={projectId}
      deletable
    />
  );
}

function ToolsCatalog() {
  const { projectId } = useParams();
  const { listTools } = useMcpTools();
  return (
    <ResourceCatalogPage
      resourceLabel="Tools"
      resourceType="tool"
      accentColor="orange"
      fetchFn={listTools}
      createPath={`/studio/projects/${projectId}/design/tools/new/editor`}
      editorPath={(id) => `/studio/projects/${projectId}/design/tools/${encodeURIComponent(id)}/editor`}
      projectId={projectId}
      deletable
    />
  );
}

function TemplatesCatalog() {
  const { projectId } = useParams();
  const { listTemplates } = useMcpTools();
  return (
    <ResourceCatalogPage
      resourceLabel="Templates"
      resourceType="template"
      accentColor="cyan"
      fetchFn={listTemplates}
      createPath={`/studio/projects/${projectId}/design/templates/new/editor`}
      editorPath={(id) => `/studio/projects/${projectId}/design/templates/${encodeURIComponent(id)}/editor`}
      projectId={projectId}
      deletable
    />
  );
}

// Route path constants for type safety and maintainability
export const STUDIO_PATH = '/studio';
export const PROJECTS_PATH = '/studio/projects';
export const PROJECT_PATH = '/studio/projects/:projectId';
export const DESIGN_PATH = `${PROJECT_PATH}/design`;
export const OBSERVE_PATH = `${PROJECT_PATH}/observe`;
export const REGISTRY_PATH = `${PROJECT_PATH}/registry`;
export const ADMIN_PATH = `${PROJECT_PATH}/admin`;

/**
 * Build the full route tree for Studio.
 * Route tree follows docs/studio-redesign.md.
 */
export function createStudioRouter(): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(
    createRoutesFromElements(
      <Route path={STUDIO_PATH} element={<StudioShell />} errorElement={<NotFoundPage />}>
        {/* /studio → redirect to /studio/projects */}
        <Route index element={<ProjectsPage />} />

        {/* /studio/projects */}
        <Route path="projects" element={<ProjectsPage />} />

        {/* /studio/projects/:projectId — Project Layout wraps sub-routes */}
        <Route path={PROJECT_PATH} element={<ProjectLayout />}>
          {/* /studio/projects/:projectId */}
          <Route index element={<ProjectDashboardPage />} />

          {/* Design section */}
          <Route path="design">
            <Route index element={<DesignPage section="design" />} />

            {/* Workflows */}
            <Route path="workflows" element={<WorkflowsCatalog />} />
            <Route path="workflows/new/editor" element={<WorkflowEditorPage />} />
            <Route path="workflows/:workflowId/editor" element={<WorkflowEditorPage />} />

            {/* Agents */}
            <Route path="agents" element={<AgentsCatalog />} />
            <Route path="agents/new/editor" element={<AgentEditorPage />} />
            <Route path="agents/:agentId/editor" element={<AgentEditorPage />} />

            {/* Skills */}
            <Route path="skills" element={<SkillsCatalog />} />
            <Route path="skills/new/editor" element={<SkillEditorPage />} />
            <Route path="skills/:skillId/editor" element={<SkillEditorPage />} />

            {/* Prompts */}
            <Route path="prompts" element={<PromptsCatalog />} />
            <Route path="prompts/new/editor" element={<PromptEditorPage />} />
            <Route path="prompts/:promptId/editor" element={<PromptEditorPage />} />

            {/* Tools */}
            <Route path="tools" element={<ToolsCatalog />} />
            <Route path="tools/new/editor" element={<ToolEditorPage />} />
            <Route path="tools/:toolId/editor" element={<ToolEditorPage />} />

            {/* Templates */}
            <Route path="templates" element={<TemplatesCatalog />} />
            <Route path="templates/new/editor" element={<TemplateEditorPage />} />
            <Route path="templates/:templateId/editor" element={<TemplateEditorPage />} />
          </Route>

          {/* Observe section */}
          <Route path="observe">
            <Route index element={<ObservePage section="observe" />} />
            <Route path="agent-executions" element={<AgentExecutionListPage />} />
            <Route path="agent-executions/:executionId" element={<AgentExecutionDetailPage />} />
            <Route path="insights" element={<InsightsListPage />} />
            <Route path="artifacts" element={<ArtifactsListPage />} />
            <Route path="metrics" element={<MetricsPage />} />
            <Route path="alerts" element={<AlertsPage />} />
          </Route>

          {/* Registry section */}
          <Route path="registry">
            <Route index element={<RegistryPage section="registry" />} />
            <Route path="resources" element={<RegistryPage section="resources" />} />
            <Route path="resource" element={<ResourceDetailPage />} />
            <Route path="overrides" element={<RegistryPage section="overrides" />} />
            <Route path="dependencies" element={<DependenciesPage />} />
          </Route>

          {/* Admin section */}
          <Route path="admin">
            <Route index element={<AdminPage />} />
            <Route path="workspaces" element={<AdminPage />} />
            <Route path="workspaces/:workspaceId" element={<AdminPage />} />
            <Route path="settings" element={<AdminPage />} />
            <Route path="integrations" element={<AdminPage />} />
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    )
  );
}
