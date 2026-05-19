//! Artifact Service - business logic for artifact management

use crate::domain::{Artifact, StorageType, ArtifactError, ArtifactResult};
use crate::application::StorageStrategy;
use std::path::PathBuf;
use std::sync::Arc;

/// Artifact Service
pub struct ArtifactService {
    base_path: PathBuf,
    #[allow(dead_code)]
    storage_strategy: Arc<StorageStrategy>,
}

impl ArtifactService {
    pub fn new(base_path: PathBuf) -> Self {
        Self {
            base_path,
            storage_strategy: Arc::new(StorageStrategy::new()),
        }
    }

    /// Store an artifact using the appropriate strategy
    pub fn store(
        &self,
        artifact: Artifact,
        content: &[u8],
    ) -> ArtifactResult<Artifact> {
        let size = content.len() as u64;

        // Determine storage type
        let storage_type = StorageType::for_size(size);

        let mut final_artifact = artifact;
        final_artifact.size = size;

        match storage_type {
            StorageType::Sqlite => {
                // Store content inline as JSON
                let content_json = serde_json::to_string(content)
                    .map_err(|e| ArtifactError::StorageError(e.to_string()))?;
                final_artifact.location = content_json;
                final_artifact.storage_type = StorageType::Sqlite;
            }
            StorageType::Filesystem => {
                // Store in filesystem
                let path = self.build_path(&final_artifact)?;
                std::fs::create_dir_all(path.parent().unwrap())?;
                std::fs::write(&path, content)
                    .map_err(|e| ArtifactError::StorageError(e.to_string()))?;
                final_artifact.location = path.to_string_lossy().to_string();
                final_artifact.storage_type = StorageType::Filesystem;
            }
        }

        Ok(final_artifact)
    }

    /// Retrieve artifact content
    pub fn retrieve(&self, artifact: &Artifact) -> ArtifactResult<Vec<u8>> {
        match artifact.storage_type {
            StorageType::Sqlite => {
                serde_json::from_str(&artifact.location)
                    .map_err(|e| ArtifactError::StorageError(e.to_string()))
            }
            StorageType::Filesystem => {
                std::fs::read(&artifact.location)
                    .map_err(|e| ArtifactError::StorageError(e.to_string()))
            }
        }
    }

    /// Delete an artifact
    pub fn delete(&self, artifact: &Artifact) -> ArtifactResult<()> {
        match artifact.storage_type {
            StorageType::Sqlite => {
                // Nothing to delete from filesystem
                Ok(())
            }
            StorageType::Filesystem => {
                if PathBuf::from(&artifact.location).exists() {
                    std::fs::remove_file(&artifact.location)
                        .map_err(|e| ArtifactError::StorageError(e.to_string()))?;
                }
                Ok(())
            }
        }
    }

    /// Verify artifact checksum
    pub fn verify(&self, artifact: &Artifact) -> ArtifactResult<()> {
        let content = self.retrieve(artifact)?;
        let checksum = blake3::hash(&content).to_hex().to_string();

        if checksum != artifact.checksum {
            return Err(ArtifactError::ChecksumMismatch {
                expected: artifact.checksum.clone(),
                actual: checksum,
            });
        }

        Ok(())
    }

    fn build_path(&self, artifact: &Artifact) -> ArtifactResult<PathBuf> {
        let mut path = self.base_path.clone();

        if let Some(exec_id) = &artifact.execution_id {
            path.push(exec_id);
        }

        if let Some(stage_id) = &artifact.stage_id {
            path.push(stage_id);
        }

        path.push(&artifact.name);

        Ok(path)
    }

    /// Cleanup all filesystem artifacts for an execution.
    /// Deletes the entire `{base_path}/{execution_id}` directory if it exists.
    /// This is called when an execution is aborted/deleted to prevent filesystem leaks.
    pub fn cleanup_for_execution(&self, execution_id: &str) -> ArtifactResult<()> {
        let exec_path = self.base_path.join(execution_id);

        if exec_path.exists() {
            std::fs::remove_dir_all(&exec_path)
                .map_err(|e| ArtifactError::StorageError(format!(
                    "Failed to cleanup execution directory '{}': {}", exec_path.display(), e
                )))?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    const ONE_MB: u64 = 1_048_576;

    fn create_test_content(size: usize) -> Vec<u8> {
        (0..size).map(|i| (i % 256) as u8).collect()
    }

    // ==================== StorageType::for_size tests ====================

    #[test]
    fn test_storage_type_for_size_below_threshold() {
        // Artifacts < 1MB should use SQLite
        let size = 500_000; // ~500KB
        let storage_type = StorageType::for_size(size);
        assert_eq!(storage_type, StorageType::Sqlite);
    }

    #[test]
    fn test_storage_type_for_size_at_zero() {
        // Empty artifact should use SQLite
        let storage_type = StorageType::for_size(0);
        assert_eq!(storage_type, StorageType::Sqlite);
    }

    #[test]
    fn test_storage_type_for_size_one_byte_below_threshold() {
        // One byte below 1MB should use SQLite
        let storage_type = StorageType::for_size(ONE_MB - 1);
        assert_eq!(storage_type, StorageType::Sqlite);
    }

    #[test]
    fn test_storage_type_for_size_at_threshold() {
        // Exactly 1MB should use Filesystem
        let storage_type = StorageType::for_size(ONE_MB);
        assert_eq!(storage_type, StorageType::Filesystem);
    }

    #[test]
    fn test_storage_type_for_size_above_threshold() {
        // Above 1MB should use Filesystem
        let storage_type = StorageType::for_size(ONE_MB + 1);
        assert_eq!(storage_type, StorageType::Filesystem);
    }

    #[test]
    fn test_storage_type_for_size_large_artifact() {
        // Large artifact (10MB) should use Filesystem
        let size = 10 * ONE_MB;
        let storage_type = StorageType::for_size(size);
        assert_eq!(storage_type, StorageType::Filesystem);
    }

    // ==================== ArtifactService::store tests ====================

    #[test]
    fn test_store_small_artifact_uses_sqlite() {
        let temp_dir = TempDir::new().unwrap();
        let service = ArtifactService::new(temp_dir.path().to_path_buf());

        let content = create_test_content(500_000); // ~500KB
        let artifact = Artifact::new(
            "arn:local:workspace/test:artifact/small".to_string(),
            "small_test.txt".to_string(),
            content.len() as u64,
            &content,
        );

        let stored = service.store(artifact, &content).unwrap();

        assert_eq!(stored.storage_type, StorageType::Sqlite);
        // SQLite location should be JSON (starts with '[' or '{' for bytes)
        assert!(stored.location.starts_with('[') || stored.location.starts_with('{'));
    }

    #[test]
    fn test_store_small_artifact_exactly_at_threshold_minus_one() {
        let temp_dir = TempDir::new().unwrap();
        let service = ArtifactService::new(temp_dir.path().to_path_buf());

        // Just under 1MB
        let content = create_test_content((ONE_MB - 1) as usize);
        let artifact = Artifact::new(
            "arn:local:workspace/test:artifact/just-under".to_string(),
            "just_under_mb.txt".to_string(),
            content.len() as u64,
            &content,
        );

        let stored = service.store(artifact, &content).unwrap();

        assert_eq!(stored.storage_type, StorageType::Sqlite);
    }

    #[test]
    fn test_store_large_artifact_uses_filesystem() {
        let temp_dir = TempDir::new().unwrap();
        let service = ArtifactService::new(temp_dir.path().to_path_buf());

        // Just over 1MB to ensure Filesystem storage
        let content = create_test_content((ONE_MB + 1) as usize);
        let artifact = Artifact::new(
            "arn:local:workspace/test:artifact/large".to_string(),
            "large_test.bin".to_string(),
            content.len() as u64,
            &content,
        );

        let stored = service.store(artifact, &content).unwrap();

        assert_eq!(stored.storage_type, StorageType::Filesystem);
        // Filesystem location should be a valid path string, not JSON
        assert!(!stored.location.starts_with('[') && !stored.location.starts_with('{'));
        // Location should be an actual file path
        let path = std::path::Path::new(&stored.location);
        assert!(path.exists(), "Filesystem path should exist");
    }

    #[test]
    fn test_store_exactly_1mb_artifact_uses_filesystem() {
        let temp_dir = TempDir::new().unwrap();
        let service = ArtifactService::new(temp_dir.path().to_path_buf());

        // Exactly 1MB
        let content = create_test_content(ONE_MB as usize);
        let artifact = Artifact::new(
            "arn:local:workspace/test:artifact/exact-mb".to_string(),
            "exact_mb.bin".to_string(),
            content.len() as u64,
            &content,
        );

        let stored = service.store(artifact, &content).unwrap();

        assert_eq!(stored.storage_type, StorageType::Filesystem);
    }

    // ==================== ArtifactService::retrieve tests ====================

    #[test]
    fn test_retrieve_small_artifact_from_sqlite() {
        let temp_dir = TempDir::new().unwrap();
        let service = ArtifactService::new(temp_dir.path().to_path_buf());

        let original_content = create_test_content(100_000); // ~100KB
        let artifact = Artifact::new(
            "arn:local:workspace/test:artifact/retrieve-small".to_string(),
            "retrieve_small.txt".to_string(),
            original_content.len() as u64,
            &original_content,
        );

        let stored = service.store(artifact, &original_content).unwrap();
        let retrieved = service.retrieve(&stored).unwrap();

        assert_eq!(retrieved, original_content);
    }

    #[test]
    fn test_retrieve_large_artifact_from_filesystem() {
        let temp_dir = TempDir::new().unwrap();
        let service = ArtifactService::new(temp_dir.path().to_path_buf());

        // Large enough to use filesystem
        let original_content = create_test_content((ONE_MB + 1000) as usize);
        let artifact = Artifact::new(
            "arn:local:workspace/test:artifact/retrieve-large".to_string(),
            "retrieve_large.bin".to_string(),
            original_content.len() as u64,
            &original_content,
        );

        let stored = service.store(artifact, &original_content).unwrap();
        let retrieved = service.retrieve(&stored).unwrap();

        assert_eq!(retrieved, original_content);
    }

    #[test]
    fn test_retrieve_at_threshold_boundary() {
        let temp_dir = TempDir::new().unwrap();
        let service = ArtifactService::new(temp_dir.path().to_path_buf());

        // Exactly 1MB
        let content = create_test_content(ONE_MB as usize);
        let artifact = Artifact::new(
            "arn:local:workspace/test:artifact/retrieve-threshold".to_string(),
            "threshold.bin".to_string(),
            content.len() as u64,
            &content,
        );

        let stored = service.store(artifact, &content).unwrap();
        let retrieved = service.retrieve(&stored).unwrap();

        assert_eq!(retrieved, content);
    }

    // ==================== ArtifactService::verify tests ====================

    #[test]
    fn test_verify_small_artifact_sqlite() {
        let temp_dir = TempDir::new().unwrap();
        let service = ArtifactService::new(temp_dir.path().to_path_buf());

        let content = create_test_content(50_000); // ~50KB
        let artifact = Artifact::new(
            "arn:local:workspace/test:artifact/verify-small".to_string(),
            "verify_small.txt".to_string(),
            content.len() as u64,
            &content,
        );

        let stored = service.store(artifact, &content).unwrap();
        // verify() should not error if checksum matches
        assert!(service.verify(&stored).is_ok());
    }

    #[test]
    fn test_verify_large_artifact_filesystem() {
        let temp_dir = TempDir::new().unwrap();
        let service = ArtifactService::new(temp_dir.path().to_path_buf());

        // Large enough for filesystem
        let content = create_test_content((ONE_MB + 5000) as usize);
        let artifact = Artifact::new(
            "arn:local:workspace/test:artifact/verify-large".to_string(),
            "verify_large.bin".to_string(),
            content.len() as u64,
            &content,
        );

        let stored = service.store(artifact, &content).unwrap();
        // verify() should not error if checksum matches
        assert!(service.verify(&stored).is_ok());
    }

    #[test]
    fn test_verify_detects_corruption() {
        let temp_dir = TempDir::new().unwrap();
        let service = ArtifactService::new(temp_dir.path().to_path_buf());

        let content = create_test_content(100_000);
        let artifact = Artifact::new(
            "arn:local:workspace/test:artifact/corrupt".to_string(),
            "corrupt.txt".to_string(),
            content.len() as u64,
            &content,
        );

        let stored = service.store(artifact, &content).unwrap();

        // Tamper with the artifact's checksum
        let mut tampered = stored.clone();
        tampered.checksum = " tampered_checksum_value".to_string();

        // verify() should fail
        assert!(service.verify(&tampered).is_err());
    }

    // ==================== End-to-end storage type enforcement tests ====================

    #[test]
    fn test_hybrid_storage_enforcement_small_always_sqlite() {
        // Ensure small artifacts consistently use SQLite regardless of content
        let temp_dir = TempDir::new().unwrap();
        let service = ArtifactService::new(temp_dir.path().to_path_buf());

        for size in [1u64, 100, 1000, 50_000, 500_000, ONE_MB - 1] {
            let content = create_test_content(size as usize);
            let artifact = Artifact::new(
                format!("arn:local:workspace/test:artifact/size-{}", size),
                format!("size_{}.txt", size),
                size,
                &content,
            );

            let stored = service.store(artifact, &content).unwrap();
            assert_eq!(
                stored.storage_type,
                StorageType::Sqlite,
                "Artifact of size {} should use SQLite",
                size
            );

            // Verify retrieve still works
            let retrieved = service.retrieve(&stored).unwrap();
            assert_eq!(retrieved, content);
        }
    }

    #[test]
    fn test_hybrid_storage_enforcement_large_always_filesystem() {
        // Ensure large artifacts consistently use Filesystem
        let temp_dir = TempDir::new().unwrap();
        let service = ArtifactService::new(temp_dir.path().to_path_buf());

        for size in [ONE_MB, ONE_MB + 1, ONE_MB + 1000, 2 * ONE_MB] {
            let content = create_test_content(size as usize);
            let artifact = Artifact::new(
                format!("arn:local:workspace/test:artifact/large-{}", size),
                format!("large_{}.bin", size),
                size as u64,
                &content,
            );

            let stored = service.store(artifact, &content).unwrap();
            assert_eq!(
                stored.storage_type,
                StorageType::Filesystem,
                "Artifact of size {} should use Filesystem",
                size
            );

            // Verify the file actually exists on disk
            let path = std::path::Path::new(&stored.location);
            assert!(path.exists(), "Filesystem path should exist for size {}", size);

            // Verify retrieve still works
            let retrieved = service.retrieve(&stored).unwrap();
            assert_eq!(retrieved, content);
        }
    }

    // ==================== Delete tests ====================

    #[test]
    fn test_delete_small_artifact_sqlite() {
        let temp_dir = TempDir::new().unwrap();
        let service = ArtifactService::new(temp_dir.path().to_path_buf());

        let content = create_test_content(10_000);
        let artifact = Artifact::new(
            "arn:local:workspace/test:artifact/delete-small".to_string(),
            "delete_small.txt".to_string(),
            content.len() as u64,
            &content,
        );

        let stored = service.store(artifact, &content).unwrap();
        // delete() should succeed for SQLite (no file to delete)
        assert!(service.delete(&stored).is_ok());
    }

    #[test]
    fn test_delete_large_artifact_filesystem() {
        let temp_dir = TempDir::new().unwrap();
        let service = ArtifactService::new(temp_dir.path().to_path_buf());

        let content = create_test_content((ONE_MB + 100) as usize);
        let artifact = Artifact::new(
            "arn:local:workspace/test:artifact/delete-large".to_string(),
            "delete_large.bin".to_string(),
            content.len() as u64,
            &content,
        );

        let stored = service.store(artifact, &content).unwrap();
        let path = std::path::Path::new(&stored.location);

        // File should exist before delete
        assert!(path.exists());

        // delete() should succeed and remove the file
        assert!(service.delete(&stored).is_ok());
        assert!(!path.exists(), "File should be deleted");
    }

    // ==================== cleanup_for_execution tests ====================

    #[test]
    fn test_cleanup_for_execution_removes_directory() {
        let temp_dir = TempDir::new().unwrap();
        let service = ArtifactService::new(temp_dir.path().to_path_buf());

        let execution_id = "test-exec-123";
        let stage_id = "stage-1";

        // Store a large artifact to create a filesystem entry
        let content = create_test_content((ONE_MB + 100) as usize);
        let mut artifact = Artifact::new(
            format!("arn:local:workspace/test:artifact/cleanup-{}", execution_id),
            "cleanup_test.bin".to_string(),
            content.len() as u64,
            &content,
        );
        artifact = artifact.with_execution(execution_id.to_string(), stage_id.to_string());

        let stored = service.store(artifact, &content).unwrap();

        // Verify the file exists
        let path = std::path::Path::new(&stored.location);
        assert!(path.exists(), "File should exist before cleanup");

        // Run cleanup
        assert!(service.cleanup_for_execution(execution_id).is_ok());

        // Verify the entire execution directory is gone
        let exec_path = temp_dir.path().join(execution_id);
        assert!(!exec_path.exists(), "Execution directory should be removed");
    }

    #[test]
    fn test_cleanup_for_execution_nonexistent_is_noop() {
        let temp_dir = TempDir::new().unwrap();
        let service = ArtifactService::new(temp_dir.path().to_path_buf());

        // Cleanup a non-existent execution should succeed (idempotent)
        assert!(service.cleanup_for_execution("nonexistent-exec").is_ok());
    }

    #[test]
    fn test_cleanup_for_execution_removes_multiple_stages() {
        let temp_dir = TempDir::new().unwrap();
        let service = ArtifactService::new(temp_dir.path().to_path_buf());

        let execution_id = "test-exec-multi";

        // Store artifacts for multiple stages
        for stage_idx in 1..=3 {
            let content = create_test_content((ONE_MB + stage_idx * 100) as usize);
            let mut artifact = Artifact::new(
                format!("arn:local:workspace/test:artifact/cleanup-stage-{}", stage_idx),
                format!("stage_{}.bin", stage_idx),
                content.len() as u64,
                &content,
            );
            artifact = artifact.with_execution(
                execution_id.to_string(),
                format!("stage-{}", stage_idx),
            );

            service.store(artifact, &content).unwrap();
        }

        // Verify all stage directories exist
        let exec_path = temp_dir.path().join(execution_id);
        assert!(exec_path.exists());

        // Run cleanup
        assert!(service.cleanup_for_execution(execution_id).is_ok());

        // Verify entire execution directory is gone
        assert!(!exec_path.exists(), "All stage directories should be removed");
    }
}
