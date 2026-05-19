//! Storage Strategy - Hybrid storage logic

use crate::domain::StorageType;

/// Storage strategy based on artifact size
pub struct StorageStrategy {
    size_threshold: u64,
}

impl StorageStrategy {
    pub fn new() -> Self {
        Self {
            size_threshold: 1_048_576, // 1MB
        }
    }

    /// Determine storage type for a given size
    pub fn determine_storage(&self, size: u64) -> StorageType {
        if size < self.size_threshold {
            StorageType::Sqlite
        } else {
            StorageType::Filesystem
        }
    }

    /// Check if content should be stored inline
    pub fn should_inline(&self, size: u64) -> bool {
        size < self.size_threshold
    }

    /// Get the size threshold in bytes
    pub fn threshold(&self) -> u64 {
        self.size_threshold
    }
}

impl Default for StorageStrategy {
    fn default() -> Self {
        Self::new()
    }
}
