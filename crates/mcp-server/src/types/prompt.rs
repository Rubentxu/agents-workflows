//! Prompt Types for MCP API

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

// ============================================================================
// Prompt DTOs
// ============================================================================

/// Prompt summary for list operations
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PromptSummary {
    pub arn: String,
    pub name: String,
    pub description: String,
    pub scope: String,
}

/// Prompt DTO - full representation
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PromptDto {
    pub arn: String,
    pub name: String,
    pub description: String,
    pub scope: String,
    pub content: String,
}

/// Backwards compatibility alias
#[deprecated(since = "2.0.0", note = "Use PromptDto instead")]
pub type Prompt = PromptDto;