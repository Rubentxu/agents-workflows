# SPEC: monaco-single-source-of-truth

**Change:** monaco-single-source-of-truth
**Phase:** sdd-spec
**Date:** 2026-05-24
**Proposal:** #278 (`sdd/monaco-single-source-of-truth/proposal`)

---

## Overview

ADR-0016 committed to Monaco as the primary editing surface with `PUT /api/content/:arn` as the sole persistence endpoint. The backend validation pipeline and Monaco components are implemented, but all 6 resource editors (Agent, Tool, Workflow, Skill, Prompt, Template) still use HTML forms as the primary editing surface and route saves through type-specific REST endpoints (`PUT /api/agents`, `PUT /api/tools`, etc.). This dual editing model creates state divergence, inconsistent validation, and fragile sync in the workflow visual editor.

This spec defines a 3-4 week refactoring that:
1. Makes Monaco/raw content the **sole editing surface** for all 6 resource types
2. Routes all saves through `PUT /api/content/:arn`
3. Eliminates the dual editing model (form state + Monaco state)
4. Implements bidirectional Visual↔YAML sync in the Workflow editor

---

## Requirements

### R1 — All Editors Persist via Content API
**What:** Every `*EditorPage.tsx` must route its save operation exclusively through `PUT /api/content/:arn`.

**Acceptance:**
- `useContent.updateContent(arn, yamlContent)` is the only persistence call in save handlers
- No `*EditorPage.tsx` invokes `PUT /api/agents`, `PUT /api/tools`, `PUT /api/workflows`, `PUT /api/skills`, `PUT /api/prompts`, or `PUT /api/templates`
- Network tab confirms saves go to `/api/content/:arn` for all 6 resource types

### R2 — Monaco Is the Only Editing Surface
**What:** No `*EditorPage.tsx` presents tabs or a toggle between "Form" and "YAML Preview".

**Acceptance:**
- Every resource editor renders Monaco as the primary (and only) editor
- There is no `<Tab>` component switching between form and Monaco views
- For Skill, Prompt, Template: `MarkdownResourceEditor` (YAML frontmatter header + Markdown body) is the sole editing surface
- For Agent, Tool: `ResourceYamlEditor` (schema-bound YAML) is the sole editing surface
- For Workflow: React Flow canvas is the primary interface; Monaco YAML is the serialization format (not an alternate editor)

### R3 — Inline Validation Markers
**What:** All 4 validation layers surface as Monaco squiggly markers within 500ms of an edit.

**Acceptance:**
- Syntax errors (YAML/JSON parse failures) appear as red squiggles
- Schema violations appear as red squiggles backed by `schemars`-generated JSON Schema
- ARN cross-reference errors appear as yellow squiggles (Layer 3)
- Semantic linter warnings appear as yellow squiggles (Layer 4)
- Debounce is 500ms; markers update reactively via `monaco-yaml` worker

### R4 — Workflow Visual→YAML Sync in Real Time
**What:** Editing a node in the visual canvas updates the Monaco YAML content without requiring "Apply changes".

**Acceptance:**
- When a user drags/resizes/relabels a node in the React Flow canvas, the YAML content in the Monaco editor updates within 500ms
- The sync shim is unidirectional: Visual → YAML only (to prevent edit loops)
- Switching from YAML tab back to Visual tab shows the correctly parsed workflow graph
- "Apply changes" button is removed; the canvas is always in sync with YAML

### R5 — Form State Eliminated or Derived
**What:** Form state either disappears or becomes a read-only projection derived from parsed YAML.

**Acceptance:**
- For Agent, Tool, Template: form is **removed entirely**
- For Skill, Prompt: form is removed; frontmatter fields are readable within the Monaco split view
- For Workflow: form YAML tab is removed; the visual canvas is the editing interface, YAML is serialization output
- No component holds editable form state that can diverge from Monaco content

---

## Scenarios

### S1 — Edit and Save an Agent
**When:** A user opens `arn:local:global:agent/orchestrator` in Studio and edits the `model` field in Monaco YAML editor  
**Then:** On save, the content is sent via `PUT /api/content/arn:local:global:agent/orchestrator`; the file `~/.workflows/global/agents/orchestrator.yaml` is updated; no REST endpoint `PUT /api/agents` is called

### S2 — Validation Error in Skill Frontmatter
**When:** A user edits a Skill's YAML frontmatter and types `temeprature: 0.8` (typo in field name)  
**Then:** Within 500ms, Monaco shows a red squiggle under `temeprature`; hovering shows "unknown field 'temeprature', did you mean 'temperature'?"; save is blocked until corrected

### S3 — Workflow Canvas Edit Propagates to YAML
**When:** A user opens a workflow in Studio, selects the "build" stage node in the visual canvas, and changes its `agent` field  
**Then:** The Monaco YAML editor content updates to reflect the new agent reference without the user pressing any "Apply" button

### S4 — YAML Syntax Error Blocks Save
**When:** A user manually edits workflow YAML and introduces a syntax error (e.g., unclosed quote)  
**Then:** Monaco shows a red squiggle on the malformed line; the save handler returns a validation error; the workflow state remains unchanged; no partial file write occurs

### S5 — Create New Resource via Monaco
**When:** A user clicks "New Agent" and the `AgentEditorPage` opens with an empty template  
**Then:** Monaco renders the empty template YAML; user types valid agent config; save creates the file via `PUT /api/content/:arn`; the new ARN is returned and shown in the UI

---

## Non-Requirements

- **No backend changes** — `rest_handlers.rs`, validation pipeline, and bounded contexts are complete and untouched
- **No new `DiagnosticPanel.tsx`** — Monaco markers are the validation UI; no separate diagnostic sidebar
- **No bidirectional Visual↔YAML conflict resolution** — Visual→YAML is unidirectional; manual YAML edits require switching to visual to see rendered result
- **No MCP or domain layer changes** — bounded contexts, repository traits, and application services are not modified
- **No schema generation changes** — `schemars`→JSON Schema pipeline is complete; not modified
- **No external tooling integration** — no special handling for tools that modify YAML files directly

---

## Success Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| SC1 | All 6 `*EditorPage.tsx` save handlers call only `PUT /api/content/:arn` | Network tab audit; grep for `PUT /api/(agents\|tools\|workflows\|skills\|prompts\|templates)` returns zero matches in editor pages |
| SC2 | No `*EditorPage.tsx` has a tab or toggle between form and Monaco | Code inspection of all 6 editor pages; grep for `Tab` component used for form/YAML switching |
| SC3 | Monaco squiggles appear within 500ms for Layer 1 (syntax) and Layer 2 (schema) errors | Manual test per resource type; no debounce > 500ms |
| SC4 | Editing a workflow node in visual canvas updates Monaco YAML within 500ms without "Apply" | Manual test: change node label in canvas, observe Monaco content change |
| SC5 | Form state is gone from Agent, Tool, Template editors | Code inspection; grep for form field state (`useState` for form fields) in editor pages |
| SC6 | All 61+ existing tests pass | `cargo test --lib` and `cargo test` green |
| SC7 | Backend architecture score ≥ 90.0 | `cargo check` and `cargo clippy` pass with no warnings |

---

## Entropy Section (Protocol B — Mandatory)

### Phase-by-Phase H(Δ_existing) Breakdown

| Phase | Description | H(Δ_existing) bits | OCP Violations | Breaking Changes |
|-------|-------------|-------------------|----------------|-----------------|
| **Phase 1** — Wire Save Path | Reconnect `onSave` → `useContent.updateContent` for all 6 editors | 0.8 | 0 | 0 |
| **Phase 2** — Monaco Primary | Remove tabs; eliminate form state from Agent, Tool, Template; convert Skill/Prompt to read-only projection | 1.4 | 0 | 0 |
| **Phase 3** — Visual↔YAML Sync | Unidirectional sync shim (Visual→YAML) in `WorkflowYamlEditor`; remove "Apply" button | 1.1 | 0 | 0 |
| **Total** | | **3.3 bits** | **0** | **0** |

**H(Δ_new) = 2.1 bits** — new connascence pairs introduced by sync shim and content API coupling.

### Information Loss from Form Elimination

| Resource Type | Form Fields Lost | Lost Information (bits) | Mitigated By |
|---------------|-----------------|------------------------|--------------|
| Agent | All (YAML is direct representation) | 0 | Monaco YAML is 1:1 with domain |
| Tool | All (YAML is direct) | 0 | Monaco YAML is 1:1 |
| Template | All (native format) | 0 | Monaco syntax highlighting sufficient |
| Skill | frontmatter fields shown in Monaco | 0.3 | Split Monaco view preserves readability |
| Prompt | frontmatter fields shown in Monaco | 0.3 | Split Monaco view preserves readability |
| Workflow | form projections eliminated | 0.5 | Visual canvas is the natural projection |

**Total information loss: 1.1 bits** — acceptable because the eliminated form state was itself a derived projection from YAML, not authoritative domain data.

### Entropy Budget Summary

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| H(Δ_existing) total | 3.3 bits | < 4.0 | ✅ |
| H(Δ_new) | 2.1 bits | > 0 | ✅ |
| New connascence pairs | 5 | < 8 | ✅ |
| OCP violations | 0 | 0 | ✅ |
| Breaking changes | 0 | 0 | ✅ |
| DQS estimated | 0.42 | ≥ 0.35 | ✅ |

### Hidden Connascence to Track

| Pair | Type | Severity | Mitigation |
|------|------|----------|------------|
| `WorkflowYamlEditor.yamlContent` internal state ↔ `workflow.stages` prop | Meaning (stale sync) | Medium | Unidirectional sync shim; ref-based dirty tracking |
| `handleSave` callback ↔ `useContent.updateContent` | Name (API contract) | Low | Feature flag; rollback via revert to REST endpoints |
| `manifestToWorkflow` ↔ `workflowToYaml` | Name (format conversion) | Medium | Round-trip tests; both functions are pure transformations |

---

## Next Recommended

1. **Phase 1 pilot:** Start with `AgentEditorPage` (simplest YAML, no frontmatter) to validate the pattern before rolling out to all 6 editors
2. **Phase 2 focus:** After wiring save paths, immediately remove "YAML Preview" tabs and verify no regressions in the editing experience
3. **Phase 3 deferral option:** If timeline slips, the Visual→YAML sync can be deferred to a follow-up cycle — the "Apply changes" button remains functional as fallback
4. **Future work (out of scope):** Bidirectional conflict resolution when YAML and visual diverge simultaneously

---

## Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **State divergence during Phase 1 transition** | High | High | Phase 1 wires save path but keeps form state; rollback is revert `handleSave` callback |
| **Sync loops in WorkflowVisual→YAML** | Medium | High | Unidirectional sync only; ref-based dirty flag prevents re-triggering |
| **Parse failure corrupting YAML on disk** | Low | High | `manifestToWorkflow`/`workflowToYaml` are pure; round-trip tests required before Phase 3 |
| **UX regression from removing forms** | Medium | Medium | Maintain both modes during Phase 1; user testing before full removal |
| **Backend content API regression** | Low | Low | API is implemented and tested; no backend changes in scope |

---

## Skill Resolution

| Skill | Trigger | Resolution |
|-------|---------|------------|
| `sdd-spec` | Current phase | Used to produce this artifact |
| `sdd-apply` | Phase 1+ implementation | Will use for all 3 phases of implementation |
| `sdd-verify` | Post-implementation | Will verify all 7 success criteria |
| `auto-grill` | Before Phase 2 | Recommended before removing tabs and form state |
| `entropy-sdd` | Mandatory per protocol | Entropy section produced; DQS within threshold |

---

## Rollout Phases Summary

```
Week 1:  Phase 1 — Wire Save Path (Agent → Tool → Workflow → Skill → Prompt → Template)
Weeks 2–3: Phase 2 — Monaco Primary (remove tabs, eliminate form state)
Weeks 3–4: Phase 3 — Visual↔YAML Sync (unidirectional shim, remove "Apply" button)
```

**Total estimated: 3–4 weeks. Backend is untouched. All 61+ tests remain green.**
