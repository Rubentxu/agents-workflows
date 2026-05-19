# Studio redesign

Studio is the human control plane for agentic resources. It creates, edits,
deletes, maintains, and visualizes resource definitions, while agents discover
and use those resources through MCP and report observed execution data back to
the system.

Studio is not a workflow runner. It does not decide which workflows to run, it
does not launch workflows, and it does not execute stages. Those decisions and
actions belong to agents using MCP.

## Consolidated decisions

This section condenses the product, domain, and UX decisions refined during the
redesign discussion. Treat these decisions as the source of truth for the first
redesign implementation.

### Responsibility boundaries

- Studio is the human control plane for desired-state resource definitions.
- Studio creates, edits, deletes, maintains, and visualizes agentic resources.
- Studio visualizes Agent Executions, Insights, Artifacts, Metrics, Alerts, and
  Execution State reported by agents.
- Studio does not decide which workflow to use.
- Studio does not launch workflows.
- Studio does not execute workflow stages.
- Studio does not validate or simulate workflow execution behavior.
- Agents discover and use resources through MCP.
- Agents decide which workflows to use in their work.
- Agents execute stages and report observed state through MCP.
- Agents must not mutate resource definitions through MCP.

### Product shape

- Studio is a resource management, registry, and observability console.
- Studio is not an execution console, workflow runner, testing console, or
  simulator.
- The redesign is a complete product redesign, not an incremental patch of the
  existing single-page UI.
- The first implementation should be driven by this document before code.
- Existing code may be reused only when it fits the new architecture.

### Users and modes

- Studio supports several modes of work, but these are not necessarily distinct
  users or permission roles.
- The useful modes are designing resources, observing agent-reported behavior,
  inspecting Registry relationships, and administering Projects and Workspaces.
- Do not implement a global profile switcher.
- Use task-oriented navigation sections instead.
- Avoid primary navigation named `Run`; it suggests Studio starts workflows.

### Project and workspace

- Project is the top-level Studio container.
- Workspace is a scoped environment inside a Project.
- Project pages can aggregate data across Workspaces.
- Workspace pages provide scoped detail.
- The Project Dashboard is the main entry point for a Project.
- The Project Dashboard should be balanced, with operational status first and
  resource design/admin access close at hand.
- The Top App Bar includes a workspace context filter.
- Workspace context supports `All workspaces` and specific Workspace selection.
- The workspace context meaning depends on section: Observe filters reported
  data, Design previews effective resources, and Registry changes effective
  resource views.

### Navigation and routing

- Navigation groups are Overview, Design, Observe, Registry, and Admin.
- Design contains Workflows, Agents, Skills, Prompts, Tools, and Templates.
- Observe contains Agent Executions, Insights, Artifacts, Metrics, and Alerts.
- Registry contains Resources, Overrides, and Dependencies.
- Admin contains Projects, Workspaces, Settings, and Integrations.
- Use Project-scoped routes as the primary route family.
- Use Workspace filtering and Workspace detail routes where scoped
  investigation is needed.
- Use `Agent Executions` rather than `Runs` or generic `Executions` in user
  facing navigation.

### Agent Execution language

- Agent Execution is the canonical term for executions reported by agents.
- Use `View Agent Execution`, `Inspect Agent Execution`, and `Observe execution
  state`.
- Avoid `Run workflow`, `Start execution`, `Launch workflow`, and `Execute
  workflow` as Studio actions.
- Recent activity on dashboards should be labeled `Recent Agent Executions`.
- Agent Execution Detail should behave like a timeline/debugger.
- Agent Execution Graph is observed behavior and is separate from the Workflow
  DAG definition.

### Resource model

- All agentic resources are declarative resources managed by Studio.
- Core managed resources are Workflow, Agent, Skill, Prompt, Tool, Template,
  Policy, Project, Workspace, and Resource Override.
- Templates are first-class declarative resources in the Registry.
- Policies are planned declarative resources; design for them now, enforce later
  if needed.
- The primary dashboard creation action is `Create resource`.
- Resource Composer is the generic creation flow for all resource kinds.
- Resource Composer supports starting from a template, blank manifest,
  duplicate, or inherited-resource override.

### Manifest model

- Resource definitions use Kubernetes-inspired YAML manifests.
- Kubernetes is inspiration, not a rule to copy literally.
- The canonical human editing format is YAML.
- Manifest shape is `apiVersion`, `kind`, `metadata`, and `spec`.
- `status` is stored separately as observed state, but may be displayed beside a
  resource in Studio.
- Studio edits `metadata` and `spec`.
- Agents/MCP report `status` and operational state.
- Do not add `metadata.namespace`; `metadata.scope` already carries that
  concept.
- `metadata.scope`, `kind`, and `metadata.name` derive the ARN.
- `metadata.uid` is an internal stable identity used for history and tracing.
- Changing `metadata.scope` is an explicit move, duplicate, promote, or override
  action, not normal field editing.
- References inside manifests use full ARN values only.
- Do not support relative references such as `agent/reviewer`.
- Explicit ARN references resolve exactly and are not silently replaced by
  overrides.

### ARN, scope, and overrides

- ARN means Agent Resource Name.
- ARN carries reference, hierarchy, and policy context.
- ARN format is `arn:local:{scope}:{type}/{name}`.
- Supported scopes are `global`, `project/{projectId}`, and
  `workspace/{workspaceId}`.
- Effective resource lookup uses `workspace > project > global` only when the UI
  is looking up by `kind` and `name` in context.
- Effective resource precedence does not apply to explicit ARN references.
- Resource Override is an explicit scoped copy of an inherited resource.
- Overrides keep an origin reference.
- Overrides should only exist when there are scope-specific changes.
- Studio may create a draft override in the UI.
- Registry persists the override only when there is a real diff against origin.
- Saving a draft override with no changes leaves the inherited resource in use.
- Resource Detail opens read-only by default.
- Editing inherited or shared resources requires explicit actions such as Edit
  original, Customize for project, Customize for workspace, Duplicate, or Revert
  override.

### Workflow design

- Workflows appear in Design as managed resources.
- Workflow definitions belong at global or Project scope unless explicitly
  scoped otherwise.
- Workspace-specific operational data belongs to Workspace context and observed
  state.
- Workflow Detail is a summary/operational page, not the editor.
- Workflow Editor is a full-page editor.
- Workflow Editor is hybrid: editable DAG canvas, inspector/forms, wizards where
  helpful, and YAML raw editing.
- Workflow Editor uses workspace context only as a preview of effective
  resource resolution.
- Saving edits the resource's own ARN unless the user explicitly creates an
  override, moves, or duplicates the resource.
- Workflow lifecycle states are `draft`, `published`, `deprecated`, and
  `archived`.
- Published workflow versions should be stable.
- Editing a published workflow should create or open a draft version.
- Publishing a draft creates a new published version.

### Resource editors

- Workflows, Agents, Skills, Prompts, Tools, Templates, and Policies should use
  a common resource editor pattern.
- Every resource editor should provide detail, form/visual editing, YAML raw
  editing, diff/history, scope/ARN/override panel, metadata/spec editing,
  read-only status panel, dependencies, and usages.
- Workflow gets a DAG canvas.
- Agent gets model/provider configuration and resource bindings.
- Skill gets instructions, triggers, required resources, and compact rules.
- Prompt gets a textual editor, variables, examples, and optional local preview.
- Tool gets schema, capabilities, permissions, and integration metadata.
- Template gets parameter schema, target kind, example values, and manifest
  preview.

### Observability

- Observe pages focus on agent-reported state.
- Agent Execution Detail includes header, timeline, graph, artifacts, insights,
  raw events, errors, metrics, resource references, and related resources.
- Metrics must support both execution-centric and resource-centric views.
- Metrics tabs are Agent Executions, Workflows, Agents, Resources, and System.
- Alerts are derived from Insights/Metrics at first, not necessarily a separate
  bounded context.
- Alert states are `open`, `acknowledged`, and `resolved`.
- Alert severities are `info`, `warning`, and `critical`.

### Registry, dependencies, and impact

- Registry is ARN-centered and scope-aware.
- Resource Detail uses encoded ARN in the route query.
- Dependencies are shown as a graph of resource relationships by ARN.
- Dependencies include Workflow-to-Agent, Agent-to-Prompt/Skill/Tool,
  Template-to-target kind, Override-to-origin, Agent Execution-to-used resource,
  Artifact-to-Agent Execution, and Insight-to-Agent Execution/stage.
- Impact Review is mandatory before destructive or shared-resource changes.
- Impact Review must show dependents, affected Workspaces, recent Agent
  Executions using the resource, derived overrides, policy effects, and explicit
  confirmation.

### Dashboard and shell

- The Project Dashboard starts with a health/activity strip.
- Health metrics include active Agent Executions, failed Agent Executions,
  success rate, average duration, queued work if reported, artifact count, and
  open alerts.
- Default time window is `Last 24h`, with `1h`, `24h`, `7d`, and `30d` options.
- Workspace Status Grid uses compact Workspace cards ordered by failure,
  activity, then recency.
- Workspace cards show name, environment badge, health status, active work,
  failures, last execution timestamp, and quick navigation actions.
- Studio should include a Command Palette / Global Search with `Ctrl+K` and
  `Cmd+K`.
- Command Palette searches Projects, Workspaces, Workflows, Agent Executions,
  Artifacts, Registry resources by ARN, Agents, Skills, Prompts, and Tools.
- Command Palette can trigger safe navigation and resource management actions,
  but not workflow launch or execution.

### Design system and tooling

- Studio uses Tailwind CSS 4.
- Use a custom design system implemented with Tailwind.
- Material Design 3 is a conceptual reference only.
- Do not use MUI or copy Google's visual style literally.
- Use Material concepts for semantic color roles, surfaces, interaction states,
  accessibility, navigation hierarchy, and subtle motion.
- The visual identity should feel like a professional Developer Operations
  Console for agentic resources, not a generic Google app.

## Product boundaries

Studio owns desired state for agentic resources:

- Workflows
- Agents
- Skills
- Prompts
- Tools
- Templates
- Policies
- Projects
- Workspaces
- Resource overrides

MCP exposes resources for agents to discover and use. Agents report observed
state through MCP, including Agent Executions, Insights, Artifacts, Metrics, and
Execution State. Agents must not mutate resource definitions through MCP.

## Core model

### Project and workspace

A Project is the top-level Studio container. It represents an initiative,
product, repository, or logical installation.

A Workspace is an isolated environment inside a Project. Agent Executions,
Artifacts, Metrics, Insights, and operational state are workspace-scoped or can
be aggregated at the Project level.

Studio supports both levels:

- Project-level aggregate pages for cross-workspace visibility.
- Workspace-level filtered pages for scoped investigation.

### Agent Resource Name

ARN means Agent Resource Name. It is inspired by AWS ARN and carries identity,
hierarchy, and policy context.

```txt
arn:local:{scope}:{type}/{name}
```

Supported scopes:

- `global`
- `project/{projectId}`
- `workspace/{workspaceId}`

Examples:

```txt
arn:local:global:agent/orchestrator
arn:local:project/app:workflow/sdd-full
arn:local:workspace/dev:artifact/execution-001/report
```

References in manifests must use full ARN values. Studio should not support
relative references such as `agent/reviewer`.

Explicit ARN references resolve exactly to the referenced ARN. Override
precedence does not silently replace an explicit reference.

### Effective resource views

The specificity rule applies only to effective resource views and UI lookup by
`kind` and `name` in a context:

```txt
workspace > project > global
```

This rule supports:

- Registry views from a workspace context.
- Catalog views showing inherited resources.
- Customize inherited resource flows.
- Detecting inherited and overridden resources.

It does not apply to explicit ARN references inside manifests.

### Resource overrides

A Resource Override is an explicit scoped copy of an inherited resource. It
keeps a reference to its origin and exists only when it introduces
scope-specific changes.

Studio should create a draft override in the UI when the user chooses to
customize an inherited resource. The Registry should only persist the override
when there is a real diff against the origin.

If the user saves without changes, Studio should keep using the inherited
resource and show a no-changes message.

### Declarative manifests

Agentic resources use Kubernetes-inspired YAML manifests. Kubernetes is an
inspiration, not a template to copy exactly.

```yaml
apiVersion: workflows.local/v1
kind: Workflow
metadata:
  uid: 01HX...
  name: sdd-full
  scope: project/app
  labels: {}
  annotations: {}
spec: {}
```

Rules:

- Studio edits `metadata` and `spec`.
- Agents and MCP report observed state separately.
- `status` is separate from the stored desired-state manifest.
- Studio may display `status` alongside the manifest, but should not store it
  as part of definition history.
- `metadata.scope`, `kind`, and `metadata.name` derive the ARN.
- `metadata.uid` is an internal stable identity for history and tracing.
- Do not add `metadata.namespace`; `scope` already carries that concept.
- Changing `metadata.scope` is not normal editing. It requires explicit move,
  duplicate, promote, or override actions.

Example status shape, stored separately:

```yaml
status:
  observedGeneration: 3
  conditions: []
  lastExecution:
    state: completed
```

### Templates

Templates are first-class declarative resources in the Registry.

```yaml
apiVersion: workflows.local/v1
kind: Template
metadata:
  name: code-review-workflow
  scope: project/app
spec:
  targetKind: Workflow
  parameters:
    - name: repository
      type: string
      required: true
  manifest:
    apiVersion: workflows.local/v1
    kind: Workflow
    metadata:
      name: "{{ name }}"
      scope: "{{ scope }}"
    spec:
      stages: []
```

Templates should support inheritance, overrides, detail pages, YAML editing,
and discovery by the Resource Composer.

### Policies

Policies are planned declarative resources. The first redesign should reserve
space for them, but enforcement can be phased in later.

```yaml
apiVersion: workflows.local/v1
kind: Policy
metadata:
  name: prod-resource-protection
  scope: project/app
spec:
  rules:
    - action: delete
      resources:
        scopes: ["project/app", "global"]
      effect: requireApproval
```

## Navigation

Studio uses task-oriented sections, not a profile switcher. The old
Build/Run/Operate language is misleading because Studio does not run
workflows.

Navigation groups:

```txt
Overview

Design
  Workflows
  Agents
  Skills
  Prompts
  Tools
  Templates

Observe
  Agent Executions
  Insights
  Artifacts
  Metrics
  Alerts

Registry
  Resources
  Overrides
  Dependencies

Admin
  Projects
  Workspaces
  Settings
  Integrations
```

## Route map

```txt
/studio
/studio/projects
/studio/projects/:projectId

/studio/projects/:projectId/design/workflows
/studio/projects/:projectId/design/workflows/:workflowId
/studio/projects/:projectId/design/workflows/:workflowId/editor
/studio/projects/:projectId/design/agents
/studio/projects/:projectId/design/skills
/studio/projects/:projectId/design/prompts
/studio/projects/:projectId/design/tools
/studio/projects/:projectId/design/templates

/studio/projects/:projectId/observe/agent-executions
/studio/projects/:projectId/observe/agent-executions/:executionId
/studio/projects/:projectId/observe/insights
/studio/projects/:projectId/observe/artifacts
/studio/projects/:projectId/observe/artifacts/:artifactId
/studio/projects/:projectId/observe/metrics
/studio/projects/:projectId/observe/alerts

/studio/projects/:projectId/registry/resources
/studio/projects/:projectId/registry/resource?arn={encodedArn}
/studio/projects/:projectId/registry/overrides
/studio/projects/:projectId/registry/dependencies

/studio/projects/:projectId/admin/workspaces
/studio/projects/:projectId/admin/workspaces/:workspaceId
/studio/projects/:projectId/admin/settings
/studio/projects/:projectId/admin/integrations
```

## Layout shell

The redesigned Studio uses a shared shell.

```txt
Top App Bar
  Project selector
  Workspace context indicator/filter
  Global search / Command palette
  Notification center
  Connection/status indicator

Left Sidebar
  Overview
  Design
  Observe
  Registry
  Admin

Main Content
  Page header
  Page body

Right Context Panel optional
  Details / Inspector / Activity / Help

Bottom Drawer optional
  Logs / Timeline / Raw JSON / Diagnostics
```

The workspace context filter supports `All workspaces` and specific workspace
contexts. Its meaning depends on the section:

- Observe filters agent-reported operational data.
- Design remains definition-oriented, but can preview effective resources.
- Registry shows effective resources, inherited resources, and overrides.

Every page must make the current context clear:

- Project aggregate
- Workspace filtered
- Effective resources for workspace

## Project dashboard

The Project Dashboard is balanced, with an operational first row. It answers
what is happening now while still giving quick access to resource design and
administration.

Structure:

```txt
Project Header
Health / Activity Strip
Workspace Status Grid
Quick Actions
Recent Agent Executions
Workflow Catalog Preview
Recent Artifacts
Insights / Alerts
```

Health metrics:

- Active Agent Executions
- Failed Agent Executions
- Success rate
- Average duration
- Queued work if reported by agents
- Artifact count
- Open alerts

Default time window is `Last 24h`, with `1h`, `24h`, `7d`, and `30d` options.

The primary dashboard CTA is `Create resource`, not `Run workflow`.

## Resource Composer

Resource Composer is the generic creation flow for declarative resources.

```txt
1. Choose kind
2. Choose scope
3. Choose template
4. Fill metadata
5. Fill spec form
6. Review YAML
7. Create resource
```

Creation paths:

- Start from template
- Start from blank manifest
- Duplicate existing resource
- Create override from inherited resource

The composer should show the resulting ARN, scope, kind, name uniqueness,
policy warnings, and whether the action creates a new resource or an override.

## Resource pages and editors

All agentic resources share a common editor pattern:

- Detail page
- Form or visual editor
- YAML raw editor
- Diff and history
- Scope, ARN, and override panel
- Metadata and spec editor
- Read-only status panel
- Dependencies and usages

Specializations by kind:

- Workflow: DAG canvas, stages, dependencies, inputs, outputs, and artifact
  contracts.
- Agent: model/provider config, bound skills/prompts/tools, capabilities,
  limits, and timeouts.
- Skill: instructions, triggers, required resources, and compact rules.
- Prompt: text editor, variables, examples, and rendering preview when local.
- Tool: capabilities, input/output schema, permissions, and integration data.
- Template: parameter schema, target kind, example values, and manifest preview.

### Workflow editor

The Workflow Editor is a full-page hybrid editor:

- Canvas-first DAG editing for structure.
- Inspector/form editing for precise properties.
- Wizards for multi-step edits where useful.
- YAML raw editor for advanced users.

The workspace context can preview effective resources, but does not change the
edit target implicitly. Saving edits the resource's own ARN unless the user
explicitly creates an override or moves/duplicates the resource.

## Agent Execution observability

Use Agent Execution as the canonical term for executions reported by agents.
Avoid labels that imply Studio starts work, such as Run, Start Execution, or
Launch Workflow.

Agent Execution Detail is a timeline/debugger page with tabs:

- Timeline
- Graph
- Artifacts
- Insights
- Raw Events

The Agent Execution Graph is observed behavior, not the Workflow DAG
definition. It may show executed stages, skipped stages, retries, failures,
branching, durations, artifacts, and insights.

## Metrics

Metrics should support both execution-centric and resource-centric views.

Tabs:

- Agent Executions
- Workflows
- Agents
- Resources
- System

Execution-centric metrics include duration, stage timings, success/failure
rates, retries, and errors.

Resource-centric metrics include most-used workflows, active agents, resource
usage, failure rates by resource, and latency associated with resources.

System metrics include MCP health, stream health, Registry health, and storage
or artifact usage.

## Registry and dependencies

The Registry must be scope-aware and ARN-centered.

The generic Resource Detail route uses an encoded ARN:

```txt
/studio/projects/:projectId/registry/resource?arn={encodedArn}
```

Resource Detail opens read-only by default. Editing is explicit through actions
such as Edit original, Customize for project, Customize for workspace,
Duplicate, or Revert override.

The Dependencies page shows a graph of resource relationships by ARN:

- Workflows to Agents
- Workflows to Skills, Prompts, and Tools where applicable
- Agents to Prompts, Skills, and Tools
- Templates to target resource kinds
- Overrides to origin resources
- Agent Executions to used resource ARNs
- Artifacts to Agent Executions
- Insights to Agent Executions and stages

## Impact Review

Studio must require Impact Review before destructive or shared-resource
changes. This is especially important for global resources, project resources,
resources with dependents, resources with derived overrides, and resources used
recently by Agent Executions.

Impact Review should show:

- Dependents
- Affected workspaces
- Recent Agent Executions using the resource
- Derived overrides
- Policy effects
- Explicit confirmation

## Design system direction

Studio uses Tailwind CSS 4 and a custom design system. Material Design 3 is a
conceptual reference only, not a component dependency and not a visual clone.

Use Material Design concepts for:

- Color roles
- Surface and elevation hierarchy
- Interaction states
- Accessibility
- Navigation structure
- Subtle motion

The visual identity should feel like a Developer Operations Console and
Resource Design Console, not a generic Google application.

## Implementation approach

This is a complete Studio redesign, not a patch of the current single-page UI.
Existing code can be reused only where it fits the new architecture, such as
ReactFlow canvas pieces, MCP/SSE hooks, and type definitions.

Recommended implementation order:

1. Define resource manifest schemas and routing contracts.
2. Build the new layout shell and route skeleton.
3. Implement Project Dashboard with mocked or existing data.
4. Implement Registry Resource Detail and Resource Composer.
5. Implement Design catalog pages and resource editors.
6. Implement Agent Execution list/detail and observed graph views.
7. Implement Metrics, Alerts, and Dependencies views.
8. Add Impact Review to destructive flows.
