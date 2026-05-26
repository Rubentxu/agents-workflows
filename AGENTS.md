# AGENTS.md

## Purpose

This file documents the operational workflow for agents working in this repository.

## Read This First

- `CONTEXT.md` is the source of truth for domain language, architecture, bounded contexts, and terminology.
- If there is any ambiguity between local code assumptions and domain meaning, follow `CONTEXT.md`.
- Use `AGENTS.md` for execution workflow and repo automation.

## Required Reference

Before making architecture or workflow changes, read:

- `./CONTEXT.md`

Especially for:

- ARN semantics
- Project vs Workspace terminology
- Registry / Workflow / Artifact / Insights / Metrics bounded contexts
- Studio embedding model
- DDD spec-vs-status model

## Automation Policy

Do not rely on ad-hoc shell commands when the workflow can live in `justfile`.

Preferred entrypoints:

- `just studio-build` — build Studio frontend assets
- `just backend-rebuild-embedded` — force backend rebuild so embedded Studio assets are refreshed
- `just dev-refresh` — rebuild Studio, re-embed backend, restart local server
- `just test_ui_local` — run Playwright UI suite against local server
- `just test_e2e_local` — parameterized local Playwright entrypoint; use positional args `spec`, `project`, and `grep` to narrow execution
- `just health` — verify Studio + REST health

## Important Build Detail

The server binary embeds Studio assets at compile time.

That means:

1. Rebuilding `studio/dist` alone is NOT enough.
2. After frontend changes, the backend binary must be rebuilt again.
3. Use `just backend-rebuild-embedded` or `just dev-refresh` instead of manually rebuilding only `studio/`.

## Local Validation Flow

For Studio/frontend changes, use this order:

1. `just dev-refresh`
2. `just health`
3. `just test_e2e_local e2e/studio-workflow-inspector.spec.ts chromium-studio` (if inspector/editor related)
4. `just test_ui_local` (when broader UI regression coverage is needed)

When debugging the inspector spec, prefer narrow parameterized runs first:

- `just test_e2e_local e2e/studio-workflow-inspector.spec.ts chromium-studio T3`
- `just test_e2e_local e2e/studio-workflow-inspector.spec.ts chromium-studio T4`
- `just test_e2e_local e2e/studio-workflow-inspector.spec.ts chromium-studio T5`
- `just test_e2e_local e2e/studio-workflow-inspector.spec.ts chromium-studio T7`

## Health Endpoints

- Studio UI: `http://localhost:8080/studio`
- REST health: `http://localhost:8081/api/health`

Do not document or use `http://localhost:8081/health`; that is not the correct endpoint.

## Notes For Future Agents

- If a frontend change appears to be “ignored”, verify the binary was rebuilt after `studio/dist` changed.
- If a `just` recipe fails, fix the recipe rather than working around it with one-off commands.
- When changing workflow editor behavior, keep terminology and invariants aligned with `CONTEXT.md`.
