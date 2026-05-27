//! Artifact Types for MCP API

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

// ============================================================================
// Artifact DTOs
// ============================================================================

/// Artifact summary for list operations
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ArtifactSummary {
    pub arn: String,
    pub execution_arn: String,
    pub stage_id: Option<String>,
    pub name: String,
    pub size: i64,
}

/// Artifact DTO - full representation
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ArtifactDto {
    pub arn: String,
    pub execution_arn: String,
    pub stage_id: Option<String>,
    pub name: String,
    pub content: String,
    pub content_type: String,
    pub size: i64,
}

/// Backwards compatibility alias
#[deprecated(since = "2.0.0", note = "Use ArtifactDto instead")]
pub type Artifact = ArtifactDto;

// ============================================================================
// Request Parameters
// ============================================================================

/// Parameters for artifact creation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactCreateParams {
    pub execution_arn: String,
    pub stage_id: Option<String>,
    pub name: String,
    pub content: String,
    pub content_type: String,
}

/// Parameters for artifact listing
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ArtifactListParams {
    pub execution_arn: Option<String>,
    pub stage_id: Option<String>,
    pub limit: Option<usize>,
}