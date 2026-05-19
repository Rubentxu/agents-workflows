//! Artifact Entity

use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

/// Storage type for artifacts
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StorageType {
    Sqlite,
    Filesystem,
}

impl StorageType {
    pub fn for_size(size: u64) -> Self {
        const SIZE_THRESHOLD: u64 = 1_048_576; // 1MB
        if size < SIZE_THRESHOLD {
            StorageType::Sqlite
        } else {
            StorageType::Filesystem
        }
    }
}

/// Content type of an artifact
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ContentType {
    Markdown,
    Text,
    Json,
    Code,
    Binary,
}

impl ContentType {
    pub fn from_extension(ext: &str) -> Self {
        match ext.to_lowercase().as_str() {
            "md" | "markdown" => ContentType::Markdown,
            "txt" | "text" => ContentType::Text,
            "json" => ContentType::Json,
            "rs" | "ts" | "js" | "py" | "go" | "yaml" | "yml" => ContentType::Code,
            _ => ContentType::Binary,
        }
    }
}

/// Artifact entity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artifact {
    pub id: String,                 // ARN
    pub execution_id: Option<String>,
    pub stage_id: Option<String>,
    pub name: String,
    pub size: u64,
    pub storage_type: StorageType,
    pub location: String,            // Path if filesystem, JSON string if sqlite
    pub content_type: ContentType,
    pub checksum: String,
    pub created_at: DateTime<Utc>,
}

impl Artifact {
    pub fn new(
        id: String,
        name: String,
        size: u64,
        content: &[u8],
    ) -> Self {
        let storage_type = StorageType::for_size(size);
        let checksum = blake3::hash(content).to_hex().to_string();

        let (location, content_type) = match storage_type {
            StorageType::Sqlite => {
                // Store content inline as JSON
                let content_json = serde_json::to_string(content).unwrap_or_default();
                let ext = std::path::Path::new(&name)
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("txt");
                (content_json, ContentType::from_extension(ext))
            }
            StorageType::Filesystem => {
                // Location will be set by the service
                (String::new(), ContentType::from_extension(
                    std::path::Path::new(&name)
                        .extension()
                        .and_then(|s| s.to_str())
                        .unwrap_or("bin")
                ))
            }
        };

        Self {
            id,
            execution_id: None,
            stage_id: None,
            name,
            size,
            storage_type,
            location,
            content_type,
            checksum,
            created_at: Utc::now(),
        }
    }

    /// Set execution context
    pub fn with_execution(mut self, execution_id: String, stage_id: String) -> Self {
        self.execution_id = Some(execution_id);
        self.stage_id = Some(stage_id);
        self
    }

    /// Set filesystem location
    pub fn with_filesystem_path(mut self, path: String) -> Self {
        self.storage_type = StorageType::Filesystem;
        self.location = path;
        self
    }

    /// Get the artifact content
    pub fn get_content(&self) -> Vec<u8> {
        match self.storage_type {
            StorageType::Sqlite => {
                serde_json::from_str(&self.location).unwrap_or_default()
            }
            StorageType::Filesystem => {
                std::fs::read(&self.location).unwrap_or_default()
            }
        }
    }

    /// Check if artifact is too large for SQLite
    pub fn is_large(&self) -> bool {
        self.size >= 1_048_576 // 1MB
    }
}
