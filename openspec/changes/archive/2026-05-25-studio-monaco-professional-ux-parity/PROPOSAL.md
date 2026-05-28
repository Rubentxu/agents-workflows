# Proposal: Studio Monaco Professional UX Parity

## Intent

Workflow editing still breaks the Monaco-first direction: `WorkflowInspector.tsx` still behaves like an HTML form, retry fields do not propagate edits, and views diverge.

## Scope

### In Scope
- Make the workflow inspector a reliable fast-edit surface over the same stage model as canvas and YAML.
- Add shared live-domain intelligence and save-time change awareness.
- Add Playwright smoke plus Vitest component/integration tests for inspector-to-model sync.

### Out of Scope
- Replacing the React Flow canvas as the primary workflow editor.
- Blocking review modals.

## Capabilities

### New Capabilities
- `workflow-editor-professional-ux-parity`: synced inspector edits, shared intelligence, and guardrails.

### Modified Capabilities
- None.

## Approach

Keep the visual-first workflow editor and professional YAML side-by-side. Replace inspector-local update paths with one shared stage patch pipeline so canvas, inspector, and YAML stay aligned. Use inline advisory diff/preview summaries before save.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `studio/src/components/design/inspector/WorkflowInspector.tsx` | Modified | Synced controls and retry editing |
| `studio/src/components/design/WorkflowEditorPage.tsx` | Modified | Shared stage patching and save guardrails |
| `studio/src/components/design/WorkflowYamlEditor.tsx` | Modified | Shared diagnostics and diff summary |
| `tests/e2e/studio-monaco-resource-editors.spec.ts` | Modified | Workflow smoke coverage |
| `studio/src/components/**/__tests__/*` | New/Modified | Inspector tests |

## Entropy Budget

| Metric | Estimate (bits) | Threshold | Status |
|--------|-----------------|-----------|--------|
| H(Δ_existing) | 2.58 | < 1.0 | ❌ |
| H(Δ_new) | 1.58 | > 0 | ✅ |
| New connascence pairs | 2 | < 3 | ✅ |
| OCP compliant? | no | yes | ❌ |

Method: CogniCode + heuristic. Confidence: medium. Critical pairs `I(A;B) > 3.0 bits`: none expected. One seam replaces parallel update paths. Verdict: yellow.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Inspector/YAML drift persists | Med | One patch pipeline, integration tests, save preview |
| Guardrails slow fast edits | Low | Advisory inline summary, no blocking modal |
| Existing architecture debt worsens | Low | Preserve baseline score 90.0; introduce no new cycles |

## Rollback Plan

Revert inspector/guardrail changes, keep Monaco YAML as fallback, and retain Playwright coverage for raw YAML save.

## Dependencies

- ADR-0016
- ADR-0009

## Success Criteria

- [ ] Inspector edits, including retry fields, update `workflow.stages`, canvas nodes, and YAML consistently.
- [ ] Workflow save shows diff/preview context without blocking edits.
- [ ] Playwright smoke and Vitest/component/integration coverage catch inspector-sync regressions.

## Auto-Grill

Auto-resuelto: keep visual-first editing, keep YAML as the source-of-truth view, and scope the inspector to fast edits.

Escalado: guardrail depth. Recommendation: inline advisory summary/diff before save (OS 0.828, excelente) over full blocking modal (0.606) or YAML-only guardrail (0.638).
