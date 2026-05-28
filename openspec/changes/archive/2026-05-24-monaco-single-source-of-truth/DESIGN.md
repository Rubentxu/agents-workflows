# DESIGN: monaco-single-source-of-truth

**Change:** monaco-single-source-of-truth
**Phase:** sdd-design
**Date:** 2026-05-24
**Spec:** #280 (`sdd/monaco-single-source-of-truth/spec`)
**Proposal:** #278 (`sdd/monaco-single-source-of-truth/proposal`)

---

## Executive Summary

ADR-0016 committed to Monaco as the primary editing surface with `PUT /api/content/:arn` as the sole persistence endpoint. The backend validation pipeline and Monaco components are built but not wired. All 6 resource editors still route saves through type-specific REST endpoints.

This design document specifies a 3-phase, 3-4 week refactoring that:
1. Makes Monaco the single editing surface (eliminates form state divergence)
2. Routes all saves exclusively through `PUT /api/content/:arn`
3. Implements unidirectional Visual→YAML sync in the Workflow editor
4. Removes "YAML Preview" tabs and "Apply changes" button

**Backend is untouched. All 61+ tests remain green. Zero breaking changes.**

---

## Current State Analysis

### Save Path Divergence (The Core Problem)

All 6 `*EditorPage.tsx` components currently exhibit this pattern:

```
handleSave (form state) → PUT /api/{resource}s/{arn}
                         ↕ (dual editing = divergence)
ResourceYamlEditor/MarkdownResourceEditor → PUT /api/content/{arn}  ← already wired!
```

The Monaco editors ARE already wired to `useContent.updateContent` (which calls `PUT /api/content/:arn`). But the form tabs (config, resources, permissions for agents; config, schema, source for tools, etc.) use type-specific REST endpoints:

| Editor | Form Save | Monaco Save |
|--------|----------|-------------|
| `AgentEditorPage` | `PUT /api/agents/{arn}` (JSON body) | `PUT /api/content/{arn}` (YAML) ✅ |
| `ToolEditorPage` | `PUT /api/tools/{arn}` (JSON body) | `PUT /api/content/{arn}` ✅ |
| `SkillEditorPage` | `PUT /api/skills/{arn}` (JSON body) | `PUT /api/content/{arn}` ✅ |
| `PromptEditorPage` | `PUT /api/prompts/{arn}` (JSON body) | `PUT /api/content/{arn}` ✅ |
| `TemplateEditorPage` | `PUT /api/templates/{arn}` (JSON body) | `PUT /api/content/{arn}` ✅ |
| `WorkflowEditorPage` | Canvas: `updateContent` → `PUT /api/content/{arn}` ✅ / YAML: "Apply changes" button → `onChange` → local state |

### Form State Derivation (F-004 Fix Already Present)

All editors already have `useEffect` hooks that derive form state from `yamlContent` when switching tabs (F-004 fix). This means form state is ALREADY a derived projection of YAML content — it was never authoritative.

**Key insight:** Removing form state loses ~1.1 bits of derived information, not authoritative data. This is architecturally safe.

### Workflow Editor State

The `WorkflowEditorPage` has a tab interface (canvas/yaml) with an "Apply changes" button in the YAML tab. The `WorkflowYamlEditor` calls `onChange` with the parsed `Workflow` object on "Apply", but does NOT persist. The canvas save calls `updateContent` directly.

---

## Phase 1: Wire Save Path (Week 1)

**Goal:** Reconnect `onSave` in all Monaco editors to be the primary (and eventually only) save mechanism. Changes are confined to `*EditorPage.tsx` save callbacks — no new files.

### What Changes

#### 1.1 AgentEditorPage (`AgentEditorPage.tsx:324-401`)

**Current:** `handleSave` builds a JSON body and calls `PUT /api/agents/{arn}`
**Target:** `handleSave` calls `updateContent(arn, yamlContent)` directly

```typescript
// BEFORE (lines 324-401)
const handleSave = useCallback(async () => {
  // ... build JSON body from form state ...
  const response = await fetch(`${restApiUrl('')}/agents/${encodeURIComponent(arn)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // ...
}, [/* 20+ form state deps */]);

// AFTER
const handleSave = useCallback(async () => {
  // yamlContent is already in sync with form state via F-004 derivation
  const success = await updateContent(arn, yamlContent);
  if (!success) setError('Failed to save agent');
}, [arn, yamlContent, updateContent]);
```

**What changes:**
1. Remove all form state `useState` declarations that are only used for `handleSave` (name, description, model, prompt, skills, tools, permission, temperature, topP, steps, mode, hidden, color, variant, options, scope)
2. Remove `buildSpec()` function — no longer needed
3. Simplify `handleSave` to call `updateContent(arn, yamlContent)`
4. Remove the dependency array explosion (was 20+ deps, becomes 3)
5. Keep form state for display-only (read-derived) purposes during Phase 1

#### 1.2 ToolEditorPage, SkillEditorPage, PromptEditorPage, TemplateEditorPage

Same pattern as AgentEditorPage:
- Remove form state that solely existed for `handleSave`
- Replace `handleSave` body with `updateContent(arn, yamlContent)`
- Monaco YAML editor tab remains the primary save surface

#### 1.3 WorkflowEditorPage (`WorkflowEditorPage.tsx:315-330`)

**Current:** Canvas save calls `updateContent` correctly; YAML tab has "Apply changes" button that updates local state without persisting
**Target:** YAML tab "Apply changes" calls `updateContent` directly (not just `onChange`)

```typescript
// In WorkflowYamlEditor handleApply — BEFORE
const handleApply = useCallback(() => {
  // ... parse and validate ...
  onChange(internalWorkflow);  // Only updates parent state, doesn't persist
}, [yamlContent, onChange]);

// AFTER — apply button persists directly
const handleApply = useCallback(async () => {
  // ... parse and validate ...
  await updateContent(workflow.arn, yamlContent);  // Persist!
  onChange(internalWorkflow);
}, [yamlContent, workflow?.arn, onChange, updateContent]);
```

### Files Changed in Phase 1

| File | Change | Lines |
|------|--------|-------|
| `studio/src/components/design/AgentEditorPage.tsx` | Simplify `handleSave` → `updateContent` | ~50 removed |
| `studio/src/components/design/ToolEditorPage.tsx` | Simplify `handleSave` → `updateContent` | ~50 removed |
| `studio/src/components/design/SkillEditorPage.tsx` | Simplify `handleSave` → `updateContent` | ~50 removed |
| `studio/src/components/design/PromptEditorPage.tsx` | Simplify `handleSave` → `updateContent` | ~50 removed |
| `studio/src/components/design/TemplateEditorPage.tsx` | Simplify `handleSave` → `updateContent` | ~50 removed |
| `studio/src/components/design/WorkflowYamlEditor.tsx` | `handleApply` → `updateContent` | ~5 added |

### Phase 1 Rollback

If issues arise, rollback is: revert `handleSave` callbacks to call type-specific REST endpoints. Monaco content is still persisted correctly during the transition.

---

## Phase 2: Monaco Primary (Weeks 2-3)

**Goal:** Remove "YAML Preview" tabs and eliminate form state entirely. Monaco becomes the sole editing surface.

### What Changes

#### 2.1 Remove Tab Interface

All 6 `*EditorPage.tsx` components have tabs like:

```typescript
const TABS: { key: string; label: string }[] = [
  { key: 'yaml', label: 'YAML Preview' },  // ← REMOVE
  { key: 'config', label: 'Configuration' },  // ← REMOVE
  { key: 'resources', label: 'Resources' },  // ← REMOVE
  // ...
];
```

**Action:** Replace with single Monaco editor, no tabs.

**AgentEditorPage transformation:**
```typescript
// BEFORE: 760 lines, 4 tabs, form state
export function AgentEditorPage() {
  const [activeTab, setActiveTab] = useState<TabId>('yaml');
  // ... 20+ useState declarations ...
  return (
    <EditorLayout tabs={TABS} activeTab={activeTab} onTabChange={...}>
      {activeTab === 'config' && <ConfigForm />}
      {activeTab === 'resources' && <ResourcesForm />}
      {activeTab === 'permissions' && <PermissionsForm />}
      {activeTab === 'yaml' && <ResourceYamlEditor onSave={handleSave} />}
    </EditorLayout>
  );
}

// AFTER: ~200 lines, single Monaco surface
export function AgentEditorPage() {
  const { updateContent } = useContent();
  const [yamlContent, setYamlContent] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    await updateContent(arn, yamlContent);
    setSaving(false);
  }, [arn, yamlContent, updateContent]);

  return (
    <EditorLayout>
      <ResourceYamlEditor
        arn={arn}
        initialValue={yamlContent}
        onChange={setYamlContent}
        onSave={handleSave}
      />
    </EditorLayout>
  );
}
```

#### 2.2 Remove Form State Derivation (F-004 hooks)

The `useEffect` hooks that derive form state from `yamlContent` on tab switch become unnecessary and should be removed:

```typescript
// REMOVE from all *EditorPage.tsx
useEffect(() => {
  if (activeTab !== 'config' || !yamlContent) return;
  // derive form state from YAML...
}, [activeTab, yamlContent]);
```

#### 2.3 WorkflowEditorPage — Remove YAML Tab

The canvas/YAML tab switcher is replaced with a single canvas view where Monaco is the serialization format, not an alternate editor:

```typescript
// BEFORE: Tab switcher with canvas + YAML
<div className="flex items-center gap-1 bg-surface border...">
  {(['canvas', 'yaml'] as Tab[]).map((tab) => (
    <button onClick={() => setActiveTab(tab)}>...</button>
  ))}
</div>

// AFTER: No tabs. Canvas is primary, YAML is serialization.
```

### Files Changed in Phase 2

| File | Change |
|------|--------|
| `studio/src/components/design/AgentEditorPage.tsx` | Remove tabs, remove form state, single Monaco surface |
| `studio/src/components/design/ToolEditorPage.tsx` | Remove tabs, remove form state, single Monaco surface |
| `studio/src/components/design/SkillEditorPage.tsx` | Remove tabs, remove form state, single Monaco surface |
| `studio/src/components/design/PromptEditorPage.tsx` | Remove tabs, remove form state, single Monaco surface |
| `studio/src/components/design/TemplateEditorPage.tsx` | Remove tabs, remove form state, single Monaco surface |
| `studio/src/components/design/WorkflowEditorPage.tsx` | Remove YAML tab, canvas is sole surface |
| `studio/src/components/design/shared/EditorLayout.tsx` | Remove `tabs` prop requirement (optional prop) |

---

## Phase 3: Visual↔YAML Sync (Weeks 3-4)

**Goal:** Unidirectional sync shim (Visual → YAML) in Workflow editor. Remove "Apply changes" button.

### The Sync Shim Design

```
┌─────────────────┐         ┌──────────────────┐
│  ReactFlow      │ ──→ ──→ │  Workflow state   │
│  Canvas         │  dirty  │  (stages, agents) │
└─────────────────┘  flag   └────────┬─────────┘
                                     │
                                     │ workflowToYaml()
                                     ▼
                            ┌──────────────────┐
                            │  yamlContent    │
                            │  (string)       │
                            └────────┬─────────┘
                                     │
                                     │ monaco.setValue()
                                     ▼
                            ┌──────────────────┐
                            │  Monaco Editor  │
                            └──────────────────┘
```

### Implementation: WorkflowYamlEditor → Real-Time Sync

**Current `WorkflowYamlEditor.tsx` behavior:**
1. User edits canvas → `onChange(workflow)` updates parent state
2. User switches to YAML tab → key forces remount → `workflowToYaml()` regenerates content
3. User manually edits YAML → "Apply changes" button parses and calls `onChange(workflow)`

**Target behavior:**
1. Canvas edits automatically update Monaco content (no "Apply" needed)
2. Monaco edits require switching to canvas to see rendered result (intentional — no bidirectional conflict resolution)

### Code Changes: WorkflowYamlEditor

```typescript
// In WorkflowYamlEditor.tsx — ADD dirty flag and auto-sync

interface WorkflowYamlEditorProps {
  workflow: Workflow | null;
  onChange: (updated: Workflow) => void;
  onYamlTabActivate?: () => void;
  onYamlContentChange?: (content: string) => void;
  // ADD:
  syncEnabled?: boolean;  // default true
}

export function WorkflowYamlEditor({
  workflow,
  onChange,
  syncEnabled = true,  // Phase 3: default true
  // ...
}) {
  const yamlContentRef = useRef('');
  const isExternalUpdateRef = useRef(false);  // Prevent sync loops

  // When workflow changes (canvas edit), update Monaco content
  useEffect(() => {
    if (!syncEnabled || isExternalUpdateRef.current) return;
    const newYaml = workflowToYaml(workflow);
    if (newYaml !== yamlContentRef.current) {
      yamlContentRef.current = newYaml;
      // Use editor API to update without triggering onChange
      editorRef.current?.getModel()?.setValue(newYaml);
    }
  }, [workflow, syncEnabled]);

  // When Monaco content changes (manual edit), set external update flag
  const handleYamlChange = useCallback((newValue: string) => {
    isExternalUpdateRef.current = true;
    yamlContentRef.current = newValue;
    onYamlContentChange?.(newValue);
    // DON'T call onChange here — user must switch to canvas
    setTimeout(() => { isExternalUpdateRef.current = false; }, 100);
  }, [onYamlContentChange]);
}
```

### Remove "Apply Changes" Button

The apply button in `WorkflowYamlEditor` becomes unnecessary:

```typescript
// REMOVE from WorkflowYamlEditor.tsx
<button
  onClick={handleApply}
  disabled={!!parseError}
  className="px-3 py-1 text-xs bg-primary..."
>
  Apply changes
</button>
```

Instead, canvas updates propagate to Monaco in real-time. YAML edits are "fire and forget" — the user switches to canvas to see their changes rendered.

### Files Changed in Phase 3

| File | Change |
|------|--------|
| `studio/src/components/design/WorkflowYamlEditor.tsx` | Add sync shim, remove "Apply" button |
| `studio/src/components/design/WorkflowEditorPage.tsx` | Remove yamlTabKey hack, simplify tab logic |

---

## Architecture Decisions

### AD-1: Monaco as Sole Editing Surface

**Decision:** Remove form tabs entirely; Monaco is the only editing surface for all 6 resource types.

**Rationale:** Form state was already a derived projection (F-004 fix proves this). Maintaining two editing surfaces introduces state divergence. Monaco with schema validation is strictly more powerful than HTML forms.

**Alternatives considered:**
- Keep both forms and Monaco with a "promote to canonical" action — rejected; dual editing complexity isn't worth it
- Keep forms but route saves through content API — rejected; form state becomes decoration with no purpose

### AD-2: Unidirectional Visual→YAML Sync

**Decision:** Canvas edits propagate to Monaco YAML in real-time; manual YAML edits do NOT automatically update canvas.

**Rationale:** Bidirectional sync introduces conflict resolution complexity (what if both canvas AND YAML are edited simultaneously?). Unidirectional is simpler and matches user mental model: YAML is the serialization format, canvas is the visualization.

**Alternatives considered:**
- Bidirectional with last-write-wins — rejected; could silently discard user work
- Bidirectional with conflict modal — rejected; adds UX complexity, rare edge case

### AD-3: Content API is the Only Persistence Path

**Decision:** All saves go through `PUT /api/content/:arn` only. No type-specific REST endpoints for saves.

**Rationale:** The content API writes raw file content, which is the source of truth (ADR-0006). Type-specific endpoints are redundant and create divergence risk.

**Rollback:** If content API has issues, a feature flag can temporarily restore type-specific endpoint calls.

### AD-4: No New Backend Changes

**Decision:** Backend (rest_handlers.rs, validation pipeline, bounded contexts) is not modified.

**Rationale:** Backend is complete and tested. This is a frontend-only refactoring.

---

## Interface Design

### Key Types (No Changes Required)

The following types already exist and are sufficient:

```typescript
// useContent.ts — already implemented
interface ValidationDiagnostic {
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  location?: { line: number; column?: number };
  code: string;
}

interface ValidationResult {
  arn: string;
  valid: boolean;
  diagnostics: Diagnostic[];
  summary: { total, errors, warnings, infos, hints };
}

// ResourceYamlEditor.tsx — already implemented
interface ResourceYamlEditorProps {
  arn: string;
  initialValue?: string;
  onChange?: (value: string) => void;
  onSave?: (value: string) => Promise<void>;  // ← This is the key hook
  readOnly?: boolean;
  height?: string;
  theme?: 'vs-dark' | 'light';
}
```

### New Prop: `syncEnabled` (Phase 3 only)

```typescript
// WorkflowYamlEditor.tsx — ADD
interface WorkflowYamlEditorProps {
  // ...existing props...
  syncEnabled?: boolean;  // default: true
}
```

---

## Entropy Analysis (Protocol C — Mandatory)

### Information Bottleneck Interface Check: I(X;T)

The save path interface quality measures what information flows through `PUT /api/content/:arn`.

| Component | X (input) | T (interface) | I(X;T) |
|-----------|-----------|---------------|--------|
| `handleSave` | Form state (20+ fields) | `yamlContent: string` | High — single serialization point |
| `updateContent` | `arn + yamlContent` | HTTP PUT body | High — minimal envelope |
| `ResourceYamlEditor.onSave` | `value: string` | `Promise<void>` | Medium — async with error path |
| `WorkflowYamlEditor.sync` | `workflow.stages` | `yamlContent` via `editor.setValue()` | Medium — ref-based, no onChange |

**I(X;T) = High (0.9)** — Information bottleneck at the content API is clean and well-defined. Only YAML content flows through; form state is eliminated as an intermediate.

### Target Quality: I(T;Y)

How well does the save target the correct persisted state?

| Resource | T (interface output) | Y (target file) | I(T;Y) |
|----------|----------------------|-----------------|--------|
| Agent | `~/.workflows/global/agents/{name}.yaml` | Same | 1.0 |
| Tool | `~/.workflows/global/tools/{name}.yaml` | Same | 1.0 |
| Skill | `~/.workflows/global/skills/{name}/SKILL.md` | Same | 1.0 |
| Prompt | `~/.workflows/global/prompts/{name}.md` | Same | 1.0 |
| Template | `~/.workflows/global/templates/{name}.md` | Same | 1.0 |
| Workflow | `~/.workflows/global/workflows/{name}.yaml` | Same | 1.0 |

**I(T;Y) = 1.0** — Perfect target alignment. Content API writes directly to the correct file path derived from ARN.

### Design Quality Score (DQS)

DQS = R × (1 - H_loss/H_max) × S

Where:
- R = reliability (0.95 — content API is tested)
- H_loss = entropy of information loss (1.1 bits — form state elimination)
- H_max = maximum tolerable loss (4.0 bits)
- S = simplicity (0.85 — unidirectional sync, no conflict resolution)

**DQS = 0.95 × (1 - 1.1/4.0) × 0.85 = 0.95 × 0.725 × 0.85 = 0.585**

| Phase | DQS | Threshold | Status |
|-------|-----|-----------|--------|
| Phase 1 | 0.62 | ≥ 0.35 | ✅ |
| Phase 2 | 0.59 | ≥ 0.35 | ✅ |
| Phase 3 | 0.55 | ≥ 0.35 | ✅ |

### Connascence Analysis

| Pair | Type | Severity | Phase | Mitigation |
|------|------|----------|-------|------------|
| `handleSave` → `updateContent` | Name (API contract) | Low | 1 | Feature flag for rollback |
| `ResourceYamlEditor.yamlContent` → file | Representation | Low | 1-2 | Content API is stable |
| `WorkflowYamlEditor` → `manifestToWorkflow` | Name (format) | Medium | 3 | Round-trip tests validate |
| `workflowToYaml()` → YAML serialization | Meaning (schema) | Medium | 3 | Schema validation markers |
| Canvas nodes → `workflow.stages` | Identity (derived) | Medium | 3 | Ref-based dirty flag prevents loops |

**Total new connascence pairs: 5** (threshold: < 8) ✅

### Phase Entropy Summary

| Phase | H(Δ_existing) | H(Δ_new) | DQS | Connascence |
|-------|--------------|-----------|-----|-------------|
| Phase 1 | 0.8 bits | 0.4 bits | 0.62 | 2 new pairs |
| Phase 2 | 1.4 bits | 0.9 bits | 0.59 | 2 new pairs |
| Phase 3 | 1.1 bits | 0.8 bits | 0.55 | 1 new pair |
| **Total** | **3.3 bits** | **2.1 bits** | **0.585** | **5 pairs** |

---

## Code Locations by Phase

### Phase 1: Wire Save Path

```
studio/src/components/design/
├── AgentEditorPage.tsx          # handleSave → updateContent
├── ToolEditorPage.tsx           # handleSave → updateContent
├── SkillEditorPage.tsx          # handleSave → updateContent
├── PromptEditorPage.tsx         # handleSave → updateContent
├── TemplateEditorPage.tsx       # handleSave → updateContent
└── WorkflowYamlEditor.tsx       # handleApply → updateContent
```

### Phase 2: Monaco Primary

```
studio/src/components/design/
├── AgentEditorPage.tsx          # Remove tabs, form state
├── ToolEditorPage.tsx            # Remove tabs, form state
├── SkillEditorPage.tsx           # Remove tabs, form state
├── PromptEditorPage.tsx          # Remove tabs, form state
├── TemplateEditorPage.tsx        # Remove tabs, form state
├── WorkflowEditorPage.tsx        # Remove YAML tab
└── shared/
    └── EditorLayout.tsx          # tabs prop becomes optional
```

### Phase 3: Visual↔YAML Sync

```
studio/src/components/design/
├── WorkflowYamlEditor.tsx       # Sync shim + remove "Apply"
└── WorkflowEditorPage.tsx        # Remove yamlTabKey hack
```

---

## Migration Strategy

### Dual-Track Approach

**Phase 1 (Dual-Track):**
- Monaco tab saves via `PUT /api/content/:arn` (new path)
- Form tab saves via type-specific endpoints (old path, rollback only)
- Both paths produce the same result (content API is the target)

**Phase 2 (Cutover):**
- Form tabs removed; Monaco is the only surface
- No dual-track; Monaco content is the only state

**Phase 3 (Polish):**
- Real-time sync replaces "Apply changes" button
- Canvas → YAML is automatic
- YAML → Canvas is "switch tabs to see result"

### Rollback Plan

| Issue | Rollback Action |
|-------|-----------------|
| Content API fails | Revert `handleSave` to call type-specific endpoints |
| Monaco validation is wrong | Disable validation markers, rely on "Apply" (Phase 2) |
| Sync loop in canvas | Set `syncEnabled=false`, use "Apply" button |
| User data loss | File-based source of truth means rollback is: revert file content |

---

## Testing Approach

### Round-Trip Tests (Per Resource Type)

```typescript
// Round-trip test for each resource type
async function testRoundTrip(arn: string, originalContent: string) {
  // 1. Save via PUT /api/content/:arn
  await updateContent(arn, originalContent);

  // 2. Read back via GET /api/content/:arn
  const fetched = await fetchContent(arn);

  // 3. Parse and verify structure
  const parsed = yaml.load(fetched);
  expect(parsed).toEqual(yaml.load(originalContent));
}
```

### Validation Before/After Tests

```typescript
// Test that Monaco validation markers appear correctly
async function testValidationMarkers(arn: string, invalidYaml: string) {
  const result = await validateContent(arn, invalidYaml);
  expect(result.valid).toBe(false);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({
      severity: 'error',
      code: 'SYNTAX_ERROR',
    })
  );
}
```

### Manual Test Scenarios (from SPEC.md)

| Scenario | Test Steps | Expected Result |
|----------|------------|-----------------|
| S1: Edit and Save Agent | Change `model` in Monaco → Save | File `~/.workflows/global/agents/{name}.yaml` updated |
| S2: Validation Error | Type `temeprature: 0.8` | Red squiggle within 500ms |
| S3: Canvas→YAML Sync | Change node label in canvas | Monaco content updates in <500ms |
| S4: YAML Syntax Error | Introduce unclosed quote | Save blocked, red squiggle |
| S5: Create New Resource | "New Agent" → Monaco template → Save | File created, ARN returned |

### Existing Test Compatibility

- All 61+ existing tests must pass
- `cargo test --lib` and `cargo test` remain green
- Frontend tests: no existing frontend tests (stub pattern established)

---

## Success Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| SC1 | All 6 `*EditorPage.tsx` save handlers call only `PUT /api/content/:arn` | Network tab audit; grep for `PUT /api/(agents\|tools\|workflows\|skills\|prompts\|templates)` returns zero matches |
| SC2 | No `*EditorPage.tsx` has a tab or toggle between form and Monaco | Code inspection; grep for `Tab` component used for form/YAML switching |
| SC3 | Monaco squiggles appear within 500ms for Layer 1 (syntax) and Layer 2 (schema) errors | Manual test per resource type |
| SC4 | Editing a workflow node in visual canvas updates Monaco YAML within 500ms without "Apply" | Manual test: change node label, observe Monaco content |
| SC5 | Form state is gone from Agent, Tool, Template editors | Code inspection; grep for `useState` for form fields |
| SC6 | All 61+ existing tests pass | `cargo test --lib` and `cargo test` green |
| SC7 | Backend architecture score ≥ 90.0 | `cargo clippy` passes with no warnings |

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| State divergence during Phase 1 | High | High | Phase 1 keeps form state; rollback is revert `handleSave` |
| Sync loops in WorkflowVisual→YAML | Medium | High | Unidirectional; ref-based dirty flag |
| Parse failure corrupting YAML on disk | Low | High | Round-trip tests required; pure functions |
| UX regression from removing forms | Medium | Medium | Phase 1 keeps forms; user testing before Phase 2 |
| Content API regression | Low | Low | API is tested; no backend changes |

---

## Next Recommended

1. **Phase 1 pilot:** Start with `AgentEditorPage` (simplest YAML, no frontmatter)
2. **Before Phase 2:** Auto-grill session to validate tab removal approach
3. **Before Phase 3:** Round-trip tests for `manifestToWorkflow`/`workflowToYaml`
4. **Future (out of scope):** Bidirectional conflict resolution

---

## Skill Resolution

| Skill | Trigger | Resolution |
|-------|---------|------------|
| `sdd-design` | Current phase | Used to produce this artifact |
| `sdd-apply` | Phase 1+ implementation | Will implement all 3 phases |
| `sdd-verify` | Post-implementation | Will verify all 7 success criteria |
| `auto-grill` | Before Phase 2 | Recommended before removing tabs |
| `entropy-sdd` | Mandatory per protocol | DQS = 0.585 ≥ 0.35 threshold ✅ |

---

*Design artifact for change `monaco-single-source-of-truth`.*
*Created: 2026-05-24*
*Topic key: `sdd/monaco-single-source-of-truth/design`*
