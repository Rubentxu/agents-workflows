# Studio Gap Analysis — Spec vs Implementation

**Date:** 2026-05-27
**Sources:** `docs/studio-redesign.md`, `docs/adr/0016-monaco-editors-rust-validation-pipeline.md`, `docs/PRD.md`
**Codebase:** `studio/src/`, `crates/validation/`, `crates/schema/`, `crates/mcp-server/`

---

## Executive Summary

The Studio redesign has made **substantial progress** on the shell, navigation, resource editors, workflow editor, and backend content/validation APIs. The core architecture is in place. However, significant gaps remain in: drag-and-drop stage creation in the workflow editor, execution detail data flowing from real APIs (not mock), dependency graph using real data, Resource Composer flow integration, Resource Override flow, and several polish features (diff/history, dark mode design system, command palette resource search completeness).

**The user's claim that "we've lost all graphical workflow editor functionality" is NOT literally true.** The ReactFlow DAG canvas is fully implemented and renders stages as interactive nodes with edges. The inspector edits stage properties. The Monaco YAML panel syncs bidirectionally. However, the editor lacks **drag-and-drop stage creation** and **stage addition/deletion from the canvas**, which means users cannot graphically build workflows from scratch — they can only edit existing ones.

---

## A. Studio Shell (Layout, Navigation, Routing)

### Implemented

| Feature | File | Status |
|---------|------|--------|
| StudioShell with collapsible sidebar | `layout/StudioShell.tsx` | ✅ Implemented |
| TopBar with project selector | `layout/TopBar.tsx` | ✅ Implemented |
| Sidebar with 5 sections (Overview, Design, Observe, Registry, Admin) | `layout/Sidebar.tsx` | ✅ Implemented — matches spec exactly |
| Project layout wrapper | `layout/ProjectLayout.tsx` | ✅ Implemented |
| Command Palette (Ctrl+K) | `layout/CommandPalette.tsx` | ✅ Implemented — searches resources, executions, pages |
| Workspace context selector | `TopBar.tsx` + `primitives/WorkspaceSelector.tsx` | ✅ Implemented |
| Dark/light theme toggle | `TopBar.tsx` + `hooks/useTheme.ts` | ✅ Implemented |
| Connection status indicator | `TopBar.tsx` | ✅ Implemented |
| Notification bell (placeholder) | `TopBar.tsx` | ⚠️ Visual only — no notification center |
| Mobile menu | `StudioShell.tsx` + `TopBar.tsx` | ✅ Implemented |

### Gaps

- **Feature**: Right Context Panel (Details/Inspector/Activity/Help)
  - **Spec Source**: studio-redesign.md → Layout Shell
  - **Current State**: Missing — no right-side context panel in the shell
  - **Priority**: P2
  - **Effort**: L

- **Feature**: Bottom Drawer (Logs/Timeline/Raw JSON/Diagnostics)
  - **Spec Source**: studio-redesign.md → Layout Shell
  - **Current State**: Missing — no bottom drawer in the shell
  - **Priority**: P2
  - **Effort**: L

- **Feature**: Notification center (actionable notifications)
  - **Spec Source**: studio-redesign.md → Top App Bar
  - **Current State**: Placeholder bell icon with dot, no panel
  - **Priority**: P2
  - **Effort**: M

---

## B. Design Section — Resource Editors

### Implemented

| Feature | File | Status |
|---------|------|--------|
| 6 resource catalogs (Workflow, Agent, Skill, Prompt, Tool, Template) | `router.tsx` + `ResourceCatalogPage.tsx` | ✅ Implemented — all 6 with MCP/REST fetch |
| Workflow editor with ReactFlow + Monaco YAML | `WorkflowEditorPage.tsx` | ✅ Implemented — dual editor with sync |
| Agent editor with Monaco YAML | `AgentEditorPage.tsx` | ✅ Implemented — Monaco as primary surface |
| Skill editor with Monaco frontmatter + MD | `SkillEditorPage.tsx` | ✅ Implemented — `MarkdownResourceEditor` |
| Prompt editor with Monaco frontmatter + MD | `PromptEditorPage.tsx` | ✅ Implemented — `MarkdownResourceEditor` |
| Tool editor with Monaco YAML | `ToolEditorPage.tsx` | ✅ Implemented — Monaco as primary surface |
| Template editor with Monaco frontmatter | `TemplateEditorPage.tsx` | ✅ Implemented — frontmatter editor |
| Monaco YAML editor with schema validation | `monaco/YamlMonacoEditor.tsx` | ✅ Implemented |
| Monaco Markdown editor | `monaco/MarkdownMonacoEditor.tsx` | ✅ Implemented |
| Unified editor shell (dual pane) | `monaco/UnifiedEditor.tsx` | ✅ Implemented |
| Resource YAML editor with schema binding | `monaco/ResourceYamlEditor.tsx` | ✅ Implemented |
| Content API hooks (GET/PUT /api/content) | `hooks/useContent.ts` | ✅ Implemented |
| Dirty guard (unsaved changes warning) | `hooks/useDirtyGuard.ts` | ✅ Used in Agent/Skill/Prompt/Tool/Template editors |
| New resource creation (blank manifest) | All editor pages | ✅ Implemented |

### Gaps

- **Feature**: Diff and History view for any resource
  - **Spec Source**: studio-redesign.md → Resource editors, ADR-0016 → Phase 4
  - **Current State**: Partial — `InlineDiffSummary` shows stage count diff for workflows only; no full diff/history view
  - **Priority**: P1
  - **Effort**: L

- **Feature**: Read-only → Edit transition (resources open read-only, editing is explicit)
  - **Spec Source**: studio-redesign.md → Resource Detail, Registry → Resource Detail
  - **Current State**: Missing — editors open directly in edit mode
  - **Priority**: P1
  - **Effort**: M

- **Feature**: Scope, ARN, and Override panel in editors
  - **Spec Source**: studio-redesign.md → Resource editors
  - **Current State**: Missing — editors show ARN in header but no dedicated panel for scope/override management
  - **Priority**: P1
  - **Effort**: M

- **Feature**: Read-only status panel (observed state alongside manifest)
  - **Spec Source**: studio-redesign.md → Resource editors
  - **Current State**: Missing — no status display in editors
  - **Priority**: P2
  - **Effort**: M

- **Feature**: Dependencies and usages tab in editors
  - **Spec Source**: studio-redesign.md → Resource editors
  - **Current State**: Missing — no "used by" / "uses" in editors
  - **Priority**: P1
  - **Effort**: M

- **Feature**: Resource lifecycle states (draft/published/deprecated/archived)
  - **Spec Source**: studio-redesign.md → Workflow design
  - **Current State**: Missing — no lifecycle state management
  - **Priority**: P1
  - **Effort**: L

- **Feature**: Validation-on-save gate (POST /api/validate before PUT)
  - **Spec Source**: ADR-0016 → Save Flow
  - **Current State**: Partial — backend validates on PUT, frontend has `useContent.validateContent()` but editors don't consistently gate save on validation results
  - **Priority**: P0
  - **Effort**: S

- **Feature**: Debounced real-time validation while typing
  - **Spec Source**: ADR-0016 → Validation-on-save vs validation-on-change
  - **Current State**: Missing in most editors — not consistently implemented
  - **Priority**: P1
  - **Effort**: M

---

## C. Workflow Editor Specifically

### Implemented

| Feature | File | Status |
|---------|------|--------|
| ReactFlow DAG canvas with stage nodes | `WorkflowEditorPage.tsx` | ✅ Implemented |
| Custom stage node component | `nodes/WorkflowStageNode.tsx` | ✅ Implemented |
| Stage inspector (right panel) | `inspector/WorkflowInspector.tsx` | ✅ Implemented — edits label, description, agent, deps, execution mode, retry |
| Monaco YAML editor with bidirectional sync | `WorkflowYamlEditor.tsx` | ✅ Implemented — canvas↔YAML round-trip working |
| Edge creation via connection (drag to connect) | `WorkflowEditorPage.tsx` `onConnect` | ✅ Implemented |
| Save via PUT /api/content/:arn | `WorkflowEditorPage.tsx` `handleSave` | ✅ Implemented |
| Inline diff summary (stage count changes) | `shared/InlineDiffSummary.tsx` | ✅ Implemented |
| Background, Controls, MiniMap | ReactFlow components | ✅ Implemented |
| New workflow creation | `WorkflowEditorPage.tsx` | ✅ Implemented |

### Gaps

- **Feature**: Drag-and-drop stage creation from a palette
  - **Spec Source**: studio-redesign.md → Workflow editor, PRD → 4.1.1
  - **Current State**: Missing — no stage palette, no drag-to-add. Users must manually edit YAML to add stages
  - **Priority**: P0
  - **Effort**: L

- **Feature**: Add/delete stage buttons
  - **Spec Source**: studio-redesign.md → Canvas-first DAG editing
  - **Current State**: Missing — no UI to add or delete stages from canvas
  - **Priority**: P0
  - **Effort**: M

- **Feature**: Dependency management via edge deletion
  - **Spec Source**: studio-redesign.md → DAG canvas editing
  - **Current State**: Partial — edges can be created via connection, but deleting edges (dependencies) is not wired
  - **Priority**: P1
  - **Effort**: S

- **Feature**: Wizards for multi-step edits
  - **Spec Source**: studio-redesign.md → Workflow editor
  - **Current State**: Missing — no wizard flows
  - **Priority**: P2
  - **Effort**: M

- **Feature**: Node repositioning persistence
  - **Spec Source**: PRD → 4.1.1 (implied by visual editor)
  - **Current State**: Partial — positions are calculated by index; manual moves aren't persisted on save
  - **Priority**: P2
  - **Effort**: S

- **Feature**: Workflow versioning (draft → publish flow)
  - **Spec Source**: studio-redesign.md → Workflow lifecycle states
  - **Current State**: Missing
  - **Priority**: P1
  - **Effort**: L

---

## D. Observe Section

### Implemented

| Feature | File | Status |
|---------|------|--------|
| Agent Execution list with filters | `AgentExecutionListPage.tsx` | ✅ Implemented — real API data via `useExecutionApi` |
| Agent Execution detail with tabs | `AgentExecutionDetailPage.tsx` | ✅ Implemented — 9 tabs (overview, graph, timeline, logs, artifacts, insights, errors, metrics, events) |
| Execution timeline component | `ExecutionTimeline.tsx` | ✅ Implemented |
| Log viewer component | `LogViewer.tsx` | ✅ Implemented |
| System health panel | `SystemHealthPanel.tsx` | ✅ Implemented |
| Insights list with severity filters | `InsightsListPage.tsx` | ✅ Implemented — real API data via `useInsightsApi` |
| Artifacts list | `ArtifactsListPage.tsx` | ✅ Implemented — real API data |
| Metrics page with 5 tabs | `MetricsPage.tsx` | ✅ Implemented — Executions, Workflows, Agents, Resources, System tabs |
| Metrics SSE stream | `hooks/useMetricsStream.ts` + `stores/metricsStore.ts` | ✅ Implemented — real-time via SSE |
| Alerts page with state filters | `AlertsPage.tsx` | ✅ Implemented — REST API fetch |
| Time window selector (1h/24h/7d/30d) | `MetricsPage.tsx` | ✅ Implemented |

### Gaps

- **Feature**: Agent Execution Detail — real execution graph data
  - **Spec Source**: studio-redesign.md → Agent Execution observability
  - **Current State**: Partial — graph tab renders ReactFlow but uses MOCK data (`mockGraph` with hardcoded 4 stages). Real execution stage data not fetched from API
  - **Priority**: P0
  - **Effort**: M

- **Feature**: Agent Execution Detail — real artifacts tab
  - **Spec Source**: studio-redesign.md → Agent Execution Detail
  - **Current State**: Placeholder — shows `EmptyState` with "No artifacts yet"
  - **Priority**: P1
  - **Effort**: M

- **Feature**: Agent Execution Detail — real insights tab
  - **Spec Source**: studio-redesign.md → Agent Execution Detail
  - **Current State**: Placeholder — shows `EmptyState`
  - **Priority**: P1
  - **Effort**: M

- **Feature**: Agent Execution Detail — real events (raw) tab
  - **Spec Source**: studio-redesign.md → Agent Execution Detail
  - **Current State**: Placeholder — shows "Raw events coming soon"
  - **Priority**: P2
  - **Effort**: M

- **Feature**: Agent Execution Detail — real metrics tab
  - **Spec Source**: studio-redesign.md → Agent Execution Detail
  - **Current State**: Shows `SystemHealthPanel` (global system health), not execution-specific metrics
  - **Priority**: P2
  - **Effort**: S

- **Feature**: SSE live updates for execution list
  - **Spec Source**: PRD → F-007 (Metrics Streaming)
  - **Current State**: Missing — execution list requires manual refresh
  - **Priority**: P1
  - **Effort**: M

- **Feature**: Artifact detail page (`/observe/artifacts/:artifactId`)
  - **Spec Source**: studio-redesign.md → Route map
  - **Current State**: Missing — clicking artifacts navigates to execution detail, no dedicated artifact viewer
  - **Priority**: P1
  - **Effort**: M

- **Feature**: Alert acknowledge/resolve actions
  - **Spec Source**: studio-redesign.md → Alert states (open/acknowledged/resolved)
  - **Current State**: Partial — alerts fetched with state filters, but no UI action buttons to acknowledge/resolve
  - **Priority**: P1
  - **Effort**: S

---

## E. Registry Section

### Implemented

| Feature | File | Status |
|---------|------|--------|
| Resources list (all types) | `RegistryPage.tsx` | ✅ Implemented — section-based page |
| Resource detail page (ARN-based) | `ResourceDetailPage.tsx` | ✅ Implemented |
| Dependencies page with ReactFlow graph | `DependenciesPage.tsx` | ⚠️ Implemented with MOCK data only |
| Impact Review Modal | `ImpactReviewModal.tsx` | ✅ Implemented — full UI with dependents, workspaces, executions, overrides, policy effects |
| Impact Analyzer (mock) | `MockImpactAnalyzer.ts` | ✅ Implemented |
| Impact Analyzer (MCP) | `McpImpactAnalyzer.ts` | ✅ Implemented |
| Resource Composer modal | `ResourceComposer.tsx` | ✅ Implemented — 6-step wizard (kind, path, metadata, spec, YAML, confirm) |

### Gaps

- **Feature**: Dependencies page using real registry data
  - **Spec Source**: studio-redesign.md → Registry and dependencies
  - **Current State**: MOCK data only — hardcoded nodes/edges with warning banner "Preview graph using mock relationship data"
  - **Priority**: P0
  - **Effort**: L

- **Feature**: Overrides page with override management
  - **Spec Source**: studio-redesign.md → Registry → Overrides
  - **Current State**: Route exists (`/registry/overrides` → `RegistryPage section="overrides"`), but no dedicated override management UI
  - **Priority**: P1
  - **Effort**: L

- **Feature**: Resource Override flow (customize inherited → draft → save with diff check)
  - **Spec Source**: studio-redesign.md → Resource Override
  - **Current State**: Partial — Resource Composer has "override" creation path, but no draft override flow, no diff-against-origin check, no "no changes" message
  - **Priority**: P1
  - **Effort**: L

- **Feature**: Effective resource views (workspace > project > global precedence)
  - **Spec Source**: studio-redesign.md → Effective resource views
  - **Current State**: Missing — no UI that resolves and displays effective resources per workspace context
  - **Priority**: P1
  - **Effort**: L

- **Feature**: Resource Composer — template selection from real data
  - **Spec Source**: studio-redesign.md → Resource Composer
  - **Current State**: Partial — step 2 has "from template" option, but doesn't fetch actual templates
  - **Priority**: P2
  - **Effort**: M

- **Feature**: Resource Composer — duplicate flow
  - **Spec Source**: studio-redesign.md → Resource Composer
  - **Current State**: Partial — option exists in UI, but doesn't pre-fill from source resource
  - **Priority**: P2
  - **Effort**: M

- **Feature**: Resource Detail opens read-only by default
  - **Spec Source**: studio-redesign.md → Registry → Resource Detail
  - **Current State**: Missing — ResourceDetailPage exists but opens directly
  - **Priority**: P1
  - **Effort**: M

- **Feature**: Impact Review integration with delete/edit flows
  - **Spec Source**: studio-redesign.md → Impact Review
  - **Current State**: Partial — modal exists, `useImpactReview` hook uses MockImpactAnalyzer; not wired into actual delete/edit actions in the UI
  - **Priority**: P0
  - **Effort**: M

---

## F. Admin Section

### Implemented

| Feature | File | Status |
|---------|------|--------|
| Admin page with tabs | `AdminPage.tsx` | ✅ Implemented — Workspaces, Projects, Settings, Integrations |
| Workspaces CRUD (create, delete) | `AdminPage.tsx` → WorkspacesTab | ✅ Implemented — real API via `useWorkspaceApi` |
| Settings tab (server config display) | `AdminPage.tsx` → SettingsTab | ✅ Implemented — reads config from API |
| Projects tab (current project info) | `AdminPage.tsx` → ProjectsTab | ✅ Implemented |

### Gaps

- **Feature**: Integrations tab
  - **Spec Source**: studio-redesign.md → Admin → Integrations
  - **Current State**: Placeholder — shows "Coming Soon" message
  - **Priority**: P2
  - **Effort**: XL (depends on what integrations are scoped)

- **Feature**: Projects page — multi-project management
  - **Spec Source**: studio-redesign.md → Admin → Projects
  - **Current State**: Partial — `ProjectsPage.tsx` exists but AdminPage's Projects tab just shows current project info and links to /studio/projects
  - **Priority**: P2
  - **Effort**: M

- **Feature**: Workspace detail page (`/admin/workspaces/:workspaceId`)
  - **Spec Source**: studio-redesign.md → Route map
  - **Current State**: Placeholder — routes to `AdminPage` with no workspace detail view
  - **Priority**: P2
  - **Effort**: M

---

## G. Content API + Validation Pipeline

### Implemented

| Feature | File | Status |
|---------|------|--------|
| GET /api/content/:arn | `rest_handlers.rs:1046` | ✅ Implemented — reads file or falls back to config_json |
| PUT /api/content/:arn | `rest_handlers.rs:1091` | ✅ Implemented — validates, writes file, re-indexes SQLite |
| POST /api/validate/:arn | `rest_handlers.rs:1166` | ✅ Implemented — full validation pipeline |
| GET /api/schemas/:type | `rest_handlers.rs:1015` | ✅ Implemented — returns schemars-generated JSON Schema |
| Validation crate — syntax validation | `crates/validation/src/syntax.rs` | ✅ Implemented |
| Validation crate — schema validation | `crates/validation/src/schema.rs` | ✅ Implemented |
| Validation crate — ARN cross-reference | `crates/validation/src/arn.rs` | ✅ Implemented |
| Validation crate — semantic linters | `crates/validation/src/lib.rs` | ✅ Implemented |
| Schema crate — JSON Schema generation | `crates/schema/src/lib.rs` | ✅ Implemented |
| Filesystem as source of truth | `rest_handlers.rs` | ✅ File → parse → index; write → file → re-index |
| Frontmatter extraction | `rest_handlers.rs` | ✅ Implemented — handles YAML+Markdown resources |

### Gaps

- **Feature**: ARN → filesystem path resolution for all resource types
  - **Spec Source**: ADR-0016 → Phase 1
  - **Current State**: Partial — works for known types, but `get_content_path` may return `None` for some ARN formats (workspace-scoped resources)
  - **Priority**: P1
  - **Effort**: M

- **Feature**: Re-index from file after write (atomic)
  - **Spec Source**: ADR-0016 → Save Flow
  - **Current State**: Partial — `save_node` updates SQLite, but full re-index from file not guaranteed atomic
  - **Priority**: P1
  - **Effort**: M

- **Feature**: Diagnostic display as Monaco markers (squiggly underlines)
  - **Spec Source**: ADR-0016 → Layer 4 → Phase 4
  - **Current State**: Partial — `WorkflowYamlEditor` shows diagnostics, but not consistently across all editors
  - **Priority**: P1
  - **Effort**: S

---

## H. Missing Features (Not Even Started)

| Feature | Spec Source | Priority | Effort |
|---------|-------------|----------|--------|
| **Stage palette / drag-and-drop stage creation** | studio-redesign.md → Workflow editor, PRD → 4.1.1 | P0 | L |
| **Resource Composer flow from dashboard** | studio-redesign.md → Dashboard → "Create resource" CTA | P1 | M |
| **Diff/History view** | studio-redesign.md → Resource editors → "Diff and history" | P1 | L |
| **Read-only → Edit transition** | studio-redesign.md → Resource Detail | P1 | M |
| **Workspace context filter affecting all sections** | studio-redesign.md → workspace context | P1 | L |
| **Effective resource resolution per workspace** | studio-redesign.md → Effective resource views | P1 | L |
| **Resource lifecycle states (draft/published/deprecated/archived)** | studio-redesign.md → Workflow design | P1 | L |
| **Command palette — ARN-based search** | studio-redesign.md → Command Palette | P2 | S |
| **Command palette — tool/template search** | studio-redesign.md → Command Palette | P2 | S |
| **Custom design system (Tailwind CSS 4 + Material concepts)** | studio-redesign.md → Design system | P2 | XL |
| **Workflow DAG cycle detection (visual)** | ADR-0016 → Phase 4 | P2 | M |
| **Resource Composer — pre-fill from template** | studio-redesign.md → Resource Composer | P2 | M |
| **Resource Composer — duplicate flow** | studio-redesign.md → Resource Composer | P2 | M |
| **Template parameter schema preview** | studio-redesign.md → Template editor | P2 | M |
| **Workflow wizards (multi-step)** | studio-redesign.md → Workflow editor | P2 | M |

---

## I. Verdict on "Lost All Graphical Workflow Editor Functionality"

**The claim is NOT literally true.** Here is what the workflow editor DOES do:

1. ✅ Renders stages as ReactFlow nodes with custom `WorkflowStageNode` component
2. ✅ Shows dependency edges (animated smoothstep)
3. ✅ Click a node → inspector opens with editable fields (label, description, agent ARN, execution mode, dependencies, retry config)
4. ✅ Inspector changes update the workflow state AND propagate to YAML via bidirectional sync
5. ✅ Monaco YAML editor with live parsing; valid YAML updates canvas, invalid YAML shows error without corrupting visual
6. ✅ Connect nodes by dragging edges
7. ✅ Save via PUT /api/content/:arn
8. ✅ Inline diff summary showing stage count changes
9. ✅ Background grid, zoom controls, minimap

**What it DOES NOT do (the actual gap):**

1. ❌ No stage palette to drag new stages onto the canvas
2. ❌ No "Add Stage" button anywhere in the UI
3. ❌ No "Delete Stage" button (right-click or otherwise)
4. ❌ Edge deletion not wired (can't remove dependencies graphically)
5. ❌ Node positions not persisted on save

**Conclusion:** Users can VIEW and EDIT existing workflows graphically but cannot CREATE new stages or DELETE stages from the canvas. This makes the visual editor a **viewer + property editor**, not a full **graphical builder**. To create a workflow from scratch, users must write YAML. The "lost functionality" is likely the inability to graphically build workflows — which was never fully implemented, not something that regressed.

---

## J. Priority Summary

### P0 — Blocks Core Flow

| # | Gap | Effort |
|---|-----|--------|
| 1 | Drag-and-drop stage creation / Add Stage button in workflow editor | L |
| 2 | Delete Stage button in workflow editor | M |
| 3 | Agent Execution Detail — real execution graph data (not mock) | M |
| 4 | Dependencies page — real registry data (not mock) | L |
| 5 | Validation gate on save in all editors | S |
| 6 | Impact Review wired into delete/edit flows | M |

### P1 — Important

| # | Gap | Effort |
|---|-----|--------|
| 7 | Diff/History view for resources | L |
| 8 | Read-only → Edit transition | M |
| 9 | Resource lifecycle states | L |
| 10 | Override management flow | L |
| 11 | Effective resource views | L |
| 12 | Artifact detail page + real data in execution detail | M |
| 13 | Alert acknowledge/resolve actions | S |
| 14 | Dependencies/usages in editor | M |
| 15 | SSE live updates for execution list | M |
| 16 | ARN cross-reference diagnostics in all editors | M |
| 17 | Workspace context filter affecting all sections | L |
| 18 | Edge deletion in workflow editor | S |

### P2 — Polish

| # | Gap | Effort |
|---|-----|--------|
| 19 | Right Context Panel | L |
| 20 | Bottom Drawer | L |
| 21 | Notification center | M |
| 22 | Integrations tab (admin) | XL |
| 23 | Custom design system refinement | XL |
| 24 | Template parameter preview | M |
| 25 | Workflow wizards | M |
| 26 | Resource Composer template pre-fill | M |
| 27 | Workspace detail page | M |
| 28 | Node position persistence in workflow editor | S |
