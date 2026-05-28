# Design: Studio Workflow Editor P0 Sprint

## Technical Approach

Seven independent P0 items covering the workflow editor lifecycle (add/delete stages, delete edges), validation gating, real API data for execution/dependencies, and impact review integration. All items are additive or replace-mock-with-real — no architectural changes. Each item touches distinct components; no coupling between work items.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|----------|---------|--------|-----------|
| Stage ID generation | UUID v4 / `stage-{n}` / user-provided | `stage-{incremental}` based on existing stage count | User-friendly, deterministic, matches existing convention |
| Validation gate extraction | Inline per editor / Shared hook | Shared `useValidationGate` hook in `hooks/` | AgentEditorPage already has inline pattern; extracting avoids 7x duplication |
| Edge deletion trigger | Right-click only / Click+Delete key / Both | Right-click context menu + selected edge Delete key | Matches ReactFlow event model (onEdgeContextMenu + onEdgesChange) |
| Dependencies data source | New MCP tool / REST endpoint / Client-side from list_nodes | New MCP tool `list_edges` + existing `list_nodes` | Backend already has edges table; MCP is the primary API path |
| Execution graph data | Direct REST GET / MCP `execution_get` | MCP `execution_get` + `workflow_get_dag` | Both exist; combine execution status with DAG structure |

## Data Flow

### WG-1: Add Stage

```
StagePalette (click/drag template)
  → callback: onAddStage(template)
  → WorkflowEditorPage: addStageToWorkflow()
    → stageId = `stage-${workflow.stages.length + 1}`
    → newStage = { id: stageId, agent: '', depends_on: [], description: '', ...defaults }
    → setWorkflow({ ...wf, stages: [...wf.stages, newStage] })
    → setNodes(buildNodes(newStages, existingNodes))
    → WorkflowYamlEditor sync auto-triggers (useEffect watches stages)
```

### WG-2: Delete Stage

```
WorkflowInspector [Delete button] OR canvas keydown Delete/Backspace
  → ConfirmDialog "Delete stage {id}? This removes all connected edges."
  → onConfirm:
    → removedId = selectedNodeId
    → newStages = workflow.stages.filter(s => s.id !== removedId)
    → newStages.forEach(s => s.depends_on = s.depends_on.filter(d => d !== removedId))
    → setWorkflow({ ...wf, stages: newStages })
    → setNodes(nds => nds.filter(n => n.id !== removedId))
    → setEdges(eds => eds.filter(e => e.source !== removedId && e.target !== removedId))
    → setSelectedNodeId(null)
```

### WG-3: Edge Deletion

```
ReactFlow onEdgesChange (edge removal) OR onEdgeContextMenu "Remove dependency"
  → removedEdge: { source, target }
  → find stage where id === target → remove source from its depends_on
  → setWorkflow(applyStagePatch(wf, targetId, {
      dependsOn: current.dependsOn.filter(d => d !== source)
    }))
  → setEdges handles visual removal via ReactFlow built-in
```

### WG-5: Real Execution Graph

```
AgentExecutionDetailPage.fetchExecution()
  → POST /mcp { name: "execution_get", arguments: { arn: executionArn } }
    → { completed_stages, pending_stages, stage_outputs, status }
  → POST /mcp { name: "workflow_get_dag", arguments: { arn: workflowArn } }
    → { nodes: [{ id, stage, depends_on }], edges: [{ from, to }] }
  → combine: ExecutionGraph.nodes = dag.nodes.map(n => ({
      id: n.id, stageId: n.stage,
      status: completed.includes(n.id) ? 'completed' : pending.includes(n.id) ? 'pending' : ...
    }))
```

### WG-6: Real Dependencies

```
DependenciesPage
  → useMcpTools().listNodes() → all RegistryNode[]
  → NEW: mcpRequest('list_edges', {}) → [{ from_id, to_id, relationship_type }]
  → build DepNode[] + DepEdge[] from real data
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `studio/src/components/design/WorkflowEditorPage.tsx` | Modify | Add palette slot, addStage/deleteStage handlers, keyboard listener, onEdgesChange sync |
| `studio/src/components/design/StagePalette.tsx` | **Create** | Collapsible left panel with stage templates, "Add Stage" button |
| `studio/src/components/design/inspector/WorkflowInspector.tsx` | Modify | Add "Delete Stage" button in header |
| `studio/src/hooks/useValidationGate.ts` | **Create** | Shared hook: calls validateContent, returns { validate: () => GateResult } |
| `studio/src/components/design/AgentEditorPage.tsx` | Modify | Replace inline validation with `useValidationGate` |
| `studio/src/components/design/SkillEditorPage.tsx` | Modify | Add validation gate on save |
| `studio/src/components/design/PromptEditorPage.tsx` | Modify | Add validation gate on save |
| `studio/src/components/design/ToolEditorPage.tsx` | Modify | Add validation gate on save |
| `studio/src/components/design/TemplateEditorPage.tsx` | Modify | Add validation gate on save |
| `studio/src/components/observe/AgentExecutionDetailPage.tsx` | Modify | Replace mockGraph with real API data |
| `studio/src/hooks/useExecutionApi.ts` | Modify | Add `getExecutionDetail(arn)` and `getWorkflowDag(arn)` |
| `studio/src/components/registry/DependenciesPage.tsx` | Modify | Replace mock data with real `list_nodes` + `list_edges` |
| `studio/src/components/registry/ImpactReviewModal.tsx` | Modify | Switch `MockImpactAnalyzer` → `McpImpactAnalyzer` in `useImpactReview` |
| `crates/mcp-server/src/main.rs` | Modify | Register new `list_edges` MCP tool (WG-6 blocker) |
| `crates/mcp-server/src/handler.rs` | Modify | Implement `list_edges` handler querying SQLite edges table |
| `studio/src/hooks/useMcpTools.ts` | Modify | Add `listEdges()` method |

## Interfaces / Contracts

### New: `useValidationGate` hook
```typescript
function useValidationGate(): {
  validating: boolean;
  gateResult: ValidationResult | null;
  validateBeforeSave: (arn: string, content: string) => Promise<GateDecision>;
}
type GateDecision = { allowed: true } | { allowed: false; diagnostics: ValidationDiagnostic[]; severity: 'error' | 'warning' };
```

### New: `StagePalette` component props
```typescript
interface StagePaletteProps {
  isOpen: boolean;
  onToggle: () => void;
  onAddStage: (template: StageTemplate) => void;
  existingStageIds: string[];
}
type StageTemplate = { label: string; defaults: Partial<Stage> };
```

### New MCP tool: `list_edges`
```json
{
  "name": "list_edges",
  "inputSchema": {
    "type": "object",
    "properties": {
      "node_type": { "type": "string" },
      "relationship_type": { "type": "string" },
      "limit": { "type": "integer" }
    }
  },
  "output": { "edges": [{ "from_id": "string", "to_id": "string", "relationship_type": "string" }] }
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| E2E | Stage add/delete cycle: add stage → edit properties → save → reload → verify persisted | Playwright: `e2e/studio-workflow-inspector.spec.ts` |
| E2E | Edge delete: create edge → delete → verify YAML dep removed | Playwright: new test case |
| E2E | Validation gate: save with errors → diagnostics shown, save blocked | Playwright |
| E2E | Execution graph: navigate to execution detail → graph tab shows real data | Playwright |
| Integration | `useValidationGate`: error/warning/clean scenarios | Vitest + MSW |
| Unit | `manifestToWorkflow` / `workflowToYaml`: stage add/delete edge cases | Vitest |

### Browser Verification Targets

| Viewport | Check |
|----------|-------|
| 1440×900+ | Palette visible, inspector visible, YAML panel visible — no overflow |
| 1280×720 | Palette collapsed by default, inspector overlays |
| Console | No uncaught errors during add/delete/save cycle |

## Migration / Rollout

No migration required. All changes are additive frontend work. The new `list_edges` MCP tool is a non-breaking addition to the MCP API.

## Open Questions

- [ ] WG-6: Confirm `list_edges` MCP tool design with backend team — is `relationship_type` filter sufficient, or do we need `scope` filter?
- [ ] WG-5: Execution API currently returns `completed_stages` and `pending_stages` as string arrays — sufficient for status mapping, but no per-stage timing data. Is `stage_outputs` enough for duration info?
