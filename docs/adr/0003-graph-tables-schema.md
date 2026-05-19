# ADR-0003: Graph Tables Instead of Hierarchical Schema

**Status:** Accepted
**Date:** 2025-05-17
**Deciders:** Agentic Workflow System Design Team

## Context

We needed a database schema that can represent:
- Workflow definitions with complex dependencies (DAG)
- Agent configurations that reuse skills and prompts
- Skills that reference other skills
- Prompts that are shared across agents
- Execution history with complex artifact lineage
- Arbitrary composition (agents using multiple skills, skills referencing other skills)

Previous approaches considered:
- **Hierarchical tables:** workflows ← stages ← agent_skills ← skills (strict hierarchy)
- **Adjacency list:** Generic `registry_items` with parent_id (flexible but weak querying)
- **Graph tables:** `nodes` + `edges` (expressive and queryable)
- **Document-based:** SQLite with JSON columns (simple but limited graph traversal)

## Decision

We use **Graph Tables** with explicit nodes and edges:

```sql
-- Nodes: All resources
CREATE TABLE nodes (
    id TEXT PRIMARY KEY,           -- ARN
    type TEXT NOT NULL,           -- workflow|agent|skill|prompt|tool|stage
    name TEXT NOT NULL,
    registry TEXT NOT NULL,       -- local|mcp|github.com/xxx
    namespace TEXT NOT NULL,
    path TEXT,                    -- Path to source file
    checksum TEXT,               -- SHA256 of source
    config_json TEXT,             -- Resolved configuration
    metadata_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Edges: Relationships between nodes
CREATE TABLE edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id TEXT NOT NULL REFERENCES nodes(id),
    to_id TEXT NOT NULL REFERENCES nodes(id),
    relationship_type TEXT NOT NULL,  -- uses|depends_on|produces|consumes|references
    metadata_json TEXT,
    UNIQUE(from_id, to_id, relationship_type)
);
```

### Relationship Types

| Type | Direction | Description |
|------|-----------|-------------|
| `uses` | A → B | A references B (e.g., agent uses skill) |
| `depends_on` | A → B | A requires B to complete first |
| `produces` | A → B | A creates B (e.g., stage produces artifact) |
| `consumes` | A → B | A reads B (e.g., stage consumes artifact) |
| `references` | A → B | A points to B (soft reference) |

### Example Graph

```
workflow:arn://local/sdd-full
├── uses ──→ agent:arn://local/sdd-explore-agent
│   ├── uses ──→ skill:arn://local/sdd-explore
│   │   └── references ──→ prompt:arn://local/sdd-explore
│   └── uses ──→ tool:arn://mcp/cognicode_build_graph
├── depends_on ──→ (init stage)
├── produces ──→ artifact:arn://local/sdd/demo/explore
└── ...
```

## Consequences

### Positive
- **Maximum flexibility:** Add new resource types without schema changes
- **Complex relationships:** Many-to-many, circular (with care), self-referencing
- **Graph queries:** Cypher-like traversals possible with recursive CTEs
- **Lineage tracking:** Easy to trace artifact provenance through the graph
- **Extensible:** Add new relationship types as metadata_json

### Negative
- **More complex queries:** Simple "get all skills for agent" requires JOIN
- **Integrity harder:** No foreign key cascade for edges (must manage manually)
- **Less ORM-friendly:** Prisma/Drizzle prefer hierarchical schemas

### Query Patterns

```sql
-- Get all skills for an agent
SELECT DISTINCT n.* FROM nodes n
JOIN edges e ON e.to_id = n.id
WHERE e.from_id = 'agent:arn://local/sdd-explore-agent'
  AND e.relationship_type = 'uses'
  AND n.type = 'skill';

-- Get full workflow expansion (all dependencies)
WITH RECURSIVE workflow_deps AS (
  SELECT n.* FROM nodes n WHERE n.id = 'workflow:arn://local/sdd-full'
  UNION ALL
  SELECT n.* FROM nodes n
  JOIN edges e ON e.to_id = n.id
  JOIN workflow_deps wd ON wd.id = e.from_id
)
SELECT * FROM workflow_deps;
```

## References

- [Temporal Event History](https://docs.temporal.io/workflows)
- [Dagster IOManagers](https://docs.dagster.io/guides/build/io-managers)
- [Petgraph (Rust graph library)](https://docs.rs/petgraph/latest/petgraph/)
