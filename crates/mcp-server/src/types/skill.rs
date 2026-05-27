//! Skill Types for MCP API

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

// ============================================================================
// Skill DTOs
// ============================================================================

/// Skill summary for list operations
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SkillSummary {
    pub arn: String,
    pub name: String,
    pub description: String,
    pub scope: String,
}

/// Skill DTO - full representation
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SkillDto {
    pub arn: String,
    pub name: String,
    pub description: String,
    pub scope: String,
    pub content: String,
    pub triggers: Vec<String>,
}

/// Backwards compatibility alias
#[deprecated(since = "2.0.0", note = "Use SkillDto instead")]
pub type Skill = SkillDto;

// ============================================================================
// Query Parameters
// ============================================================================

/// Parameters for skill query
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillQueryParams {
    pub query: String,
    pub scope: Option<String>,
}