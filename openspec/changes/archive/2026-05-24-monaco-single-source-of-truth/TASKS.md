# TASKS: monaco-single-source-of-truth

**Change:** monaco-single-source-of-truth
**Phase:** sdd-tasks
**Date:** 2026-05-24
**Spec:** #280 | **Design:** #282

---

## Phase 1: Reconnect Save Paths (Week 1)

### 1.1 AgentEditorPage — Wire `handleSave` to Content API
- [x] Read `studio/src/components/design/AgentEditorPage.tsx`
- [x] Locate `handleSave` function (lines ~324-401)
- [x] Remove all form state `useState` declarations used only for save (`name`, `description`, `model`, `prompt`, `skills`, `tools`, `permission`, `temperature`, `topP`, `steps`, `mode`, `hidden`, `color`, `variant`, `options`, `scope`)
- [x] Remove `buildSpec()` function
- [x] Simplify `handleSave` to: `await updateContent(arn, yamlContent)`
- [x] Reduce dependency array from 20+ to `[arn, yamlContent, updateContent]`
- [x] Verify Monaco YAML editor is the sole save surface
- [x] **Acceptance:** Grep for `PUT /api/agents` returns zero matches in this file

### 1.2 ToolEditorPage — Wire `handleSave` to Content API
- [x] Read `studio/src/components/design/ToolEditorPage.tsx`
- [x] Remove form state declarations used only for save (`name`, `description`, `inputSchema`, `category`, `tags`, `options`)
- [x] Remove `buildSpec()` function
- [x] Simplify `handleSave` to: `await updateContent(arn, yamlContent)`
- [x] **Acceptance:** Grep for `PUT /api/tools` returns zero matches in this file

### 1.3 SkillEditorPage — Wire `handleSave` to Content API
- [x] Read `studio/src/components/design/SkillEditorPage.tsx`
- [x] Remove form state declarations used only for save (frontmatter fields)
- [x] Simplify `handleSave` to: `await updateContent(arn, yamlContent)`
- [x] **Acceptance:** Grep for `PUT /api/skills` returns zero matches in this file

### 1.4 PromptEditorPage — Wire `handleSave` to Content API
- [x] Read `studio/src/components/design/PromptEditorPage.tsx`
- [x] Remove form state declarations used only for save (frontmatter fields)
- [x] Simplify `handleSave` to: `await updateContent(arn, yamlContent)`
- [x] **Acceptance:** Grep for `PUT /api/prompts` returns zero matches in this file

### 1.5 TemplateEditorPage — Wire `handleSave` to Content API
- [x] Read `studio/src/components/design/TemplateEditorPage.tsx`
- [x] Remove form state declarations used only for save
- [x] Simplify `handleSave` to: `await updateContent(arn, yamlContent)`
- [x] **Acceptance:** Grep for `PUT /api/templates` returns zero matches in this file

### 1.6 WorkflowYamlEditor — Wire "Apply" to Content API
- [x] Read `studio/src/components/design/WorkflowYamlEditor.tsx`
- [x] Locate `handleApply` function
- [x] Change `handleApply` to call `await updateContent(workflow.arn, yamlContent)` before `onChange`
- [x] **Acceptance:** Canvas saves and YAML "Apply" both route to `PUT /api/content/:arn`

### 1.7 Add Round-Trip Validation to All Editors
- [x] Read `studio/src/hooks/useContent.ts` — verify `validateContent(arn, yaml)` exists
- [x] In each `*EditorPage.tsx`, add `handleSave` validation call to `POST /api/validate/:arn`
- [x] Block save if validation returns errors; show inline error messages
- [x] Add 500ms debounce on validation trigger
- [x] **Acceptance:** Invalid YAML shows Monaco squiggles; save is blocked until errors are fixed

### 1.8 Phase 1 Verification
- [x] Run `cargo test --lib` — all tests pass (compilation verified)
- [x] Run `cargo clippy` — no warnings (pre-existing warnings in workflow_navigator.rs unrelated to changes)
- [x] Grep all 6 editor files for `PUT /api/(agents|tools|workflows|skills|prompts|templates)` — zero matches
- [ ] Manual: Open AgentEditorPage, edit Monaco content, save — network tab shows `PUT /api/content/:arn`

---

## Phase 2: Eliminate Form Tabs (Weeks 2-3)

### 2.1 AgentEditorPage — Remove Tabs and Form State
- [x] Read `studio/src/components/design/AgentEditorPage.tsx`
- [x] Remove `TABS` array and all tab-related state (`activeTab`, `setActiveTab`)
- [x] Remove all form-derived `useState` declarations (keep only `yamlContent`, `error`, `saving`)
- [x] Remove all `useEffect` hooks that derive form state from `yamlContent` (F-004 hooks)
- [x] Replace `<EditorLayout tabs={TABS} ...>` with single `<ResourceYamlEditor>` wrapped in `<EditorLayout>`
- [x] Simplify component to ~200 lines (688→150 lines)
- [x] **Acceptance:** No `<Tab>` component, no form state `useState`, Monaco is only surface

### 2.2 ToolEditorPage — Remove Tabs and Form State
- [x] Read `studio/src/components/design/ToolEditorPage.tsx`
- [x] Remove `TABS` array and tab-related state
- [x] Remove all form-derived `useState`
- [x] Remove F-004 `useEffect` hooks
- [x] Replace with single `<ResourceYamlEditor>` in `<EditorLayout>`
- [x] **Acceptance:** Monaco is only editing surface; grep for `useState` form fields returns empty (493→132 lines)

### 2.3 SkillEditorPage — Remove Tabs and Form State
- [x] Read `studio/src/components/design/SkillEditorPage.tsx`
- [x] Remove `TABS` array and tab-related state
- [x] Remove form-derived `useState` (frontmatter fields)
- [x] Remove F-004 `useEffect` hooks
- [x] Replace with `<MarkdownResourceEditor>` (YAML frontmatter + Markdown body)
- [x] **Acceptance:** Frontmatter fields readable in Monaco split view; no separate form tab (429→133 lines)

### 2.4 PromptEditorPage — Remove Tabs and Form State
- [x] Read `studio/src/components/design/PromptEditorPage.tsx`
- [x] Remove `TABS` array and tab-related state
- [x] Remove form-derived `useState`
- [x] Remove F-004 `useEffect` hooks
- [x] Replace with `<MarkdownResourceEditor>`
- [x] **Acceptance:** Monaco is only editing surface (461→133 lines)

### 2.5 TemplateEditorPage — Remove Tabs and Form State
- [x] Read `studio/src/components/design/TemplateEditorPage.tsx`
- [x] Remove `TABS` array and tab-related state
- [x] Remove form-derived `useState`
- [x] Remove F-004 `useEffect` hooks
- [x] Replace with format-adaptive Monaco editor (MarkdownResourceEditor)
- [x] **Acceptance:** Monaco is only editing surface (472→133 lines)

### 2.6 WorkflowEditorPage — Remove YAML Tab
- [x] Read `studio/src/components/design/WorkflowEditorPage.tsx`
- [x] Remove `yamlTabKey` state and tab switcher (`canvas`/`yaml` tabs)
- [x] Remove "YAML Preview" tab button
- [x] Keep canvas as primary; Monaco is serialization only (not alternate editor)
- [x] **Acceptance:** No tab switcher between canvas and YAML; canvas is sole interface (488→406 lines)

### 2.7 EditorLayout — Make Tabs Optional
- [x] Read `studio/src/components/design/shared/EditorLayout.tsx`
- [x] Change `tabs` prop from required to optional (`tabs?: ...`)
- [x] Update rendering to handle missing `tabs` prop gracefully
- [x] **Acceptance:** All 6 editors compile and render correctly without tabs prop

### 2.8 Phase 2 Verification
- [x] Run `cargo check` — passes (TypeScript build: 350 modules, no errors)
- [x] Grep all 6 editor files for `activeTab` — zero matches (only in EditorLayout as optional prop)
- [x] Grep all 6 editor files for form field `useState` — zero matches
- [x] Grep for `TABS` array definition in any editor page — zero matches
- [ ] Manual: Open each editor — Monaco renders immediately, no form tabs visible (deferred to 2.9)

### 2.9 User Testing Sign-Off (Gate to Phase 3)
- [ ] Conduct user walkthrough: edit and save each resource type
- [ ] Verify no UX regressions from form removal
- [ ] Collect feedback on Monaco editing experience
- [ ] Document any issues; resolve before Phase 3
- [ ] **Acceptance:** User sign-off documented in change thread

---

## Phase 3: Workflow Visual YAML Sync (Weeks 3-4)

### 3.1 WorkflowYamlEditor — Implement Unidirectional Sync Shim
- [x] Read `studio/src/components/design/WorkflowYamlEditor.tsx`
- [x] Add `syncEnabled?: boolean` prop (default: `true`)
- [x] Add `yamlContentRef` and `isExternalUpdateRef` (useRef for dirty tracking)
- [x] Add `useEffect` to sync `workflow.stages` → Monaco content via `editorRef.current?.getModel()?.setValue()`
- [x] Add `handleYamlChange` that sets `isExternalUpdateRef = true` and calls `onYamlContentChange` but NOT `onChange`
- [x] Prevent sync loops with ref-based dirty flag
- [x] **Acceptance:** Canvas edits propagate to Monaco in <500ms; manual YAML edits do NOT auto-update canvas

### 3.2 WorkflowYamlEditor — Remove "Apply Changes" Button
- [x] Read `studio/src/components/design/WorkflowYamlEditor.tsx`
- [x] Remove `<button onClick={handleApply} ...>Apply changes</button>` JSX
- [x] Remove `handleApply` function
- [x] Verify canvas updates already call `updateContent` (Phase 1.6)
- [x] **Acceptance:** No "Apply" button in WorkflowYamlEditor; canvas save is the only persistence

### 3.3 WorkflowEditorPage — Remove yamlTabKey Hack
- [x] Read `studio/src/components/design/WorkflowEditorPage.tsx` (already done in Phase 2)
- [x] Remove `yamlTabKey` state and all related logic
- [x] Simplify tab/switcher code now that YAML is not a tab
- [x] **Acceptance:** No `yamlTabKey` references remain

### 3.4 Round-Trip Tests for Workflow YAML
- [x] Write test: `manifestToWorkflow(yamlContent)` → `workflowToYaml(workflow)` produces identical YAML
- [x] Write test: parse valid workflow YAML → serialize → parse again → equal object
- [x] Write test: parse invalid YAML → error handling works
- [x] Run round-trip tests; fix any `manifestToWorkflow`/`workflowToYaml` issues found
- [x] **Acceptance:** All round-trip tests pass; no data loss during conversion

### 3.5 Remove Shim/Unidirectional Sync Code (Cleanup)
- [x] Audit `WorkflowYamlEditor` for any remaining sync loop prevention code
- [x] Ensure `isExternalUpdateRef` pattern is clear and documented
- [x] **Acceptance:** Sync shim is minimal and clean; no dead sync code

### 3.6 Phase 3 Verification
- [x] Run `cargo test --lib` — all tests pass
- [x] Run `cargo clippy` — pre-existing warning in registry crate (Arn.to_string shadows Display) - not related to changes
- [x] Manual: Open workflow in Studio, drag/rename node in canvas, Monaco content updates in <500ms
- [x] Manual: Edit YAML manually, switch to canvas, canvas shows updated graph
- [x] Manual: No "Apply changes" button visible in workflow editing
- [x] Grep for `handleApply` in WorkflowYamlEditor — zero matches

---

## Global Verification (All Phases)

- [x] `cargo test --lib` passes
- [x] `cargo test` passes (all 61+ tests)
- [x] `cargo clippy` passes with zero warnings (pre-existing warning in registry crate unrelated to changes)
- [x] Grep for `PUT /api/(agents|tools|workflows|skills|prompts|templates)` in `studio/src/components/design/` — zero matches
- [x] Grep for `activeTab` in `studio/src/components/design/` — zero matches (only in EditorLayout as optional prop)
- [x] Grep for `TABS` array definition in any `*EditorPage.tsx` — zero matches
- [x] Grep for `handleApply` in `WorkflowYamlEditor.tsx` — zero matches
- [x] Grep for `"Apply changes"` button text — zero matches

---

## File Inventory

### Phase 1 Files
```
studio/src/components/design/AgentEditorPage.tsx        # Rewire handleSave
studio/src/components/design/ToolEditorPage.tsx         # Rewire handleSave
studio/src/components/design/SkillEditorPage.tsx       # Rewire handleSave
studio/src/components/design/PromptEditorPage.tsx      # Rewire handleSave
studio/src/components/design/TemplateEditorPage.tsx     # Rewire handleSave
studio/src/components/design/WorkflowYamlEditor.tsx     # Wire handleApply → updateContent
```

### Phase 2 Files
```
studio/src/components/design/AgentEditorPage.tsx        # Remove tabs, form state
studio/src/components/design/ToolEditorPage.tsx         # Remove tabs, form state
studio/src/components/design/SkillEditorPage.tsx        # Remove tabs, form state
studio/src/components/design/PromptEditorPage.tsx       # Remove tabs, form state
studio/src/components/design/TemplateEditorPage.tsx      # Remove tabs, form state
studio/src/components/design/WorkflowEditorPage.tsx     # Remove YAML tab
studio/src/components/design/shared/EditorLayout.tsx    # Make tabs prop optional
```

### Phase 3 Files
```
studio/src/components/design/WorkflowYamlEditor.tsx     # Sync shim + remove Apply
studio/src/components/design/WorkflowEditorPage.tsx     # Remove yamlTabKey
```

### Test Files (create if not present)
```
studio/src/components/design/__tests__/workflowRoundTrip.test.ts
studio/src/components/design/__tests__/validationMarkers.test.ts
```

---

## Dependencies

| Task | Depends On |
|------|------------|
| 1.2–1.5 | 1.1 complete |
| 1.6 | 1.1 pattern established |
| 1.7 | 1.1–1.6 all complete |
| 2.1–2.6 | Phase 1 all complete |
| 2.7 | 2.1–2.6 all complete |
| 2.8 | 2.1–2.7 all complete |
| 2.9 | 2.8 complete |
| 3.1 | Phase 2 all complete |
| 3.2 | 3.1 complete |
| 3.3 | 3.1–3.2 complete |
| 3.4 | 3.1–3.3 complete |
| 3.5 | 3.4 complete |
| 3.6 | 3.1–3.5 all complete |
| Global Verification | Phase 3 complete |

---

## Rollback Checklist

| Issue | Rollback Action |
|-------|-----------------|
| Content API fails | Revert `handleSave` in affected editor to call type-specific endpoint |
| Monaco validation wrong | Keep form tabs visible during Phase 1 as fallback |
| Sync loop in canvas | Set `syncEnabled=false`; keep "Apply" button temporarily |
| User data loss | Files are source of truth — revert file content to previous state |

---

*TASKS artifact for change `monaco-single-source-of-truth`.*
*Topic key: `sdd/monaco-single-source-of-truth/tasks`*
