# ADR-0005: Hybrid Artifact Storage

**Status:** Accepted
**Date:** 2025-05-17
**Deciders:** Agentic Workflow System Design Team

## Context

Artifacts (workflow outputs like specifications, designs, code implementations) need persistent storage. We evaluated:

- **Filesystem only:** Simple, no DB bloat, but not queryable
- **Database only:** Centralized, queryable, but DB bloat with large files
- **Hybrid by size:** Small artifacts in DB, large in filesystem
- **Hybrid by type:** Structured data in DB, blobs in filesystem

Similar systems evaluated:
- Temporal: Event history (small) + payload references (large)
- Dagster: I/O Managers with different backends based on data size/type
- Prefect: Results stored in DB or external storage based on size

## Decision

We use **Hybrid Storage by Size Threshold**:

| Artifact Size | Storage | Schema |
|---------------|---------|--------|
| < 1 MB | SQLite | `artifacts.content_json` (inline JSON) |
| >= 1 MB | Filesystem + DB reference | `artifacts.location` (path) |

### Schema

```sql
CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,                 -- artifact:arn://...
    execution_id TEXT REFERENCES executions(id),
    stage_id TEXT,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,              -- bytes
    storage_type TEXT NOT NULL,         -- sqlite|filesystem
    location TEXT NOT NULL,             -- path or JSON blob
    content_type TEXT,                  -- markdown|text|json|code
    checksum TEXT,                       -- SHA256 for integrity
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Filesystem path convention
-- ~/.workflows/artifacts/{execution_id}/{stage_id}/{artifact_name}
```

### Storage Decision Algorithm

```rust
fn determine_storage(artifact_size: u64, content: &[u8]) -> StorageLocation {
    const SIZE_THRESHOLD: u64 = 1_048_576; // 1 MB

    if artifact_size < SIZE_THRESHOLD {
        StorageLocation::Sqlite {
            content_json: serde_json::to_string(content).unwrap()
        }
    } else {
        // Write to filesystem
        let path = format!(
            "~/.workflows/artifacts/{execution_id}/{stage_id}/{name}"
        );
        std::fs::write(&path, content).unwrap();
        StorageLocation::Filesystem { path }
    }
}
```

### 1MB Threshold Rationale

| Factor | Consideration |
|--------|---------------|
| SQLite limits | > 1MB per BLOB can impact performance |
| Query cost | Large JSON in DB slows queries |
| Industry standard | Dagster, Prefect use similar thresholds |
| Typical artifacts | Most specs, proposals, designs are < 100KB |
| Code dumps | Implementation outputs can be > 1MB |

### Example Artifacts by Size

| Artifact | Typical Size | Storage |
|----------|-------------|---------|
| Exploration report | 5-50 KB | SQLite |
| Specification | 20-200 KB | SQLite |
| Design document | 10-100 KB | SQLite |
| Implementation diff | 50KB-2MB | Filesystem if >1MB |
| Test output | 100KB-5MB | Filesystem |
| Coverage report | 500KB-10MB | Filesystem |

## Consequences

### Positive
- **Best of both worlds:** Queryable small artifacts, no DB bloat for large files
- **Industry validated:** Pattern used by Dagster, Prefect
- **Simple rule:** Size-based is predictable and easy to reason about
- **Migration path:** Easy to move artifacts between storage types if needed

### Negative
- **Two storage locations:** Must track both filesystem and DB
- **Filesystem cleanup:** Must delete files when execution is deleted
- **Path management:** Filesystem paths must be consistent and versioned

### Cleanup Strategy

```rust
fn cleanup_artifacts(execution_id: &str) {
    // 1. Delete from SQLite
    db.delete_artifacts(execution_id);

    // 2. Delete filesystem directory
    let artifact_path = format!("~/.workflows/artifacts/{execution_id}");
    if std::path::Path::new(&artifact_path).exists() {
        std::fs::remove_dir_all(artifact_path).ok();
    }
}
```

## References

- [Dagster IOManagers](https://docs.dagster.io/guides/build/io-managers)
- [Prefect Results](https://docs.prefect.io/concepts/storage/)
- [Temporal Payload](https://docs.temporal.io/payloads)
