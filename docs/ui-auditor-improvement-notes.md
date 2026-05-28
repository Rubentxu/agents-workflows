# UI Auditor Improvement Notes

## Goal

Improve the `ui-auditor` agent, its prompts, and its reusable skills so frontend work is driven by browser evidence, measurable UX checks, and regression-oriented verification.

## Research Signals Used

### Playwright best practices

Key takeaways from the official Playwright guidance:

- test user-visible behavior, not implementation details
- keep tests isolated
- prefer resilient, user-facing locators
- use web-first assertions instead of manual immediate checks
- use traces for hard failures and CI debugging
- codify meaningful regressions in versioned tests

### Playwright accessibility guidance

Key takeaways:

- automated scans catch only part of accessibility quality
- combine `@axe-core/playwright` with manual keyboard checks
- scan the current UI state after interaction, not before
- attach accessibility results when useful for debugging

### Responsive design guidance

Key takeaways from web.dev responsive guidance:

- horizontal scrolling is a real UX defect unless intentional
- content should determine breakpoints, not device brand assumptions
- layouts should use flexible systems and content-driven reflow
- major breakpoints should be minimal and justified by content stress

## Design Decisions

### 1. Make runtime evidence mandatory

The improved agent and skills explicitly forbid approving UI from code reading alone.

### 2. Separate recon from regression coverage

- `playwright-cli` is the preferred tool for fast recon and smoke verification
- repo Playwright tests are the preferred tool for durable regression guards

### 3. Introduce a concrete frontend evidence loop

The new `frontend-evidence-loop` skill formalizes:

1. reproduce
2. measure
3. patch minimally
4. verify in browser
5. codify the regression

### 4. Strengthen geometry-based judgment

The updated geometry skill now pushes measurable tolerances and explicit comparison targets.

### 5. Treat extension/browser helpers as secondary tools

Browser extensions, DevTools helpers, and agent-browser-like tooling are useful, but they must not replace Playwright-based evidence.

## Tooling Strategy

### Preferred order

1. `playwright-cli`
2. repo Playwright tests
3. `webapp-testing`
4. accessibility automation
5. optional extension/browser helpers

### Fallback strategy

If a named browser helper is unavailable, the agent must:

- state that explicitly
- continue with Playwright-based evidence
- avoid blocking on unavailable tooling

## Notable Environment Finding

`agent-browser` is referenced in the broader skill ecosystem, but availability should be treated as conditional. The improved guidance therefore uses capability-based fallback instead of assuming the tool is present and healthy.

## Files Added

- `.opencode/agents/ui-auditor.md`
- `.opencode/skills/ui-audit-protocol/SKILL.md`
- `.opencode/skills/layout-geometry-audit/SKILL.md`
- `.opencode/skills/frontend-evidence-loop/SKILL.md`
- supporting references under `.opencode/skills/**/references/`

## Operational Note

Because these are opencode agent/skill files, opencode must be restarted before the running session will pick them up.
