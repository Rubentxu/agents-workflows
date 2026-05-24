//! Agent Types for MCP API

use serde::{Deserialize, Serialize};

// ============================================================================
// Agent DTOs
// ============================================================================

/// Agent summary for list operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSummary {
    pub arn: String,
    pub name: String,
    pub description: String,
    pub scope: String,
}

/// Agent DTO - full representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentDto {
    pub arn: String,
    pub name: String,
    pub description: String,
    pub scope: String,
    pub model: String,
    pub skills: Vec<String>,
    pub tools: Vec<String>,
}

/// Backwards compatibility alias
#[deprecated(since = "2.0.0", note = "Use AgentDto instead")]
pub type Agent = AgentDto;

// ============================================================================
// Query Parameters
// ============================================================================

/// Parameters for agent query
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentQueryParams {
    pub query: String,
    pub scope: Option<String>,
}

/// Generic list parameters
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ListParams {
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

/// Generic ARN get parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetByArnParams {
    pub arn: String,
}