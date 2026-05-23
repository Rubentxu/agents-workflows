# Architecture Decision Records

## Index

| ID | Title | Status | Date |
|----|-------|--------|------|
| ADR-0001 | [SKILL.md Format — Mattpocock Standard](0001-skill-format-mattpocock.md) | Accepted | 2025-05-17 |
| ADR-0002 | [ARN Reference System](0002-arn-reference-system.md) | Accepted | 2025-05-17 |
| ADR-0003 | [Graph Tables Instead of Hierarchical Schema](0003-graph-tables-schema.md) | Accepted | 2025-05-17 |
| ADR-0004 | [Eager ARN Resolution](0004-eager-arn-resolution.md) | Accepted | 2025-05-17 |
| ADR-0005 | [Hybrid Artifact Storage](0005-hybrid-artifact-storage.md) | Accepted | 2025-05-17 |
| ADR-0006 | [Multi-Workspace ARN System](0006-multi-workspace-arn.md) | Accepted | 2025-05-17 |
| ADR-0007 | [Server-Side Execution State Machine](0007-server-side-state-machine.md) | Accepted | 2025-05-17 |
| ADR-0008 | [Rich MCP Orchestration API](0008-rich-mcp-api.md) | Accepted | 2025-05-17 |
| ADR-0009 | [Full-system E2E Strategy](0009-full-system-e2e-strategy.md) | Accepted | 2026-05-19 |
| ADR-0010 | [Unified Agent Data Model](0010-unified-agent-data-model.md) | Accepted | 2026-05-21 |
| ADR-0011 | [Skill Data Model](0011-skill-data-model.md) | Accepted | 2026-05-21 |
| ADR-0012 | [Prompt Data Model](0012-prompt-data-model.md) | Accepted | 2026-05-21 |
| ADR-0013 | [Template Data Model](0013-template-data-model.md) | Accepted | 2026-05-21 |
| ADR-0014 | [Tool Data Model](0014-tool-data-model.md) | Accepted | 2026-05-21 |
| ADR-0015 | [Cross-resource Reference System](0015-cross-resource-reference-system.md) | Accepted | 2026-05-21 |
| ADR-0016 | [Monaco Editors + Rust Validation Pipeline](0016-monaco-editors-rust-validation-pipeline.md) | Accepted | 2026-05-21 |
| ADR-0017 | [Generic CRUD Handler Extraction](0017-generic-crud-handler.md) | Partially Implemented | 2026-05-22 |

## Format

Each ADR follows the structure:
- **Context:** The situation that required a decision
- **Decision:** What we decided to do
- **Consequences:** Both positive and negative outcomes

## Adding New ADRs

1. Create new file: `docs/adr/XXXX-title-slug.md`
2. Use this naming convention for ID in filename
3. Add entry to this index
4. Use status: Proposed | Accepted | Deprecated | Superseded

## Superseded Decisions

If an ADR is superseded by a new one:
1. Update its status to "Superseded"
2. Add link to the superseding ADR
3. Create new ADR with the new decision
