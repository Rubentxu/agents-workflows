//! Impact Analysis Types for MCP API

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

// ============================================================================
// Impact DTOs
// ============================================================================

/// Impact item - a resource affected by an action
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ImpactItem {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub arn: String,
}

/// Recent execution record
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RecentExecution {
    pub id: String,
    pub status: String,
    #[serde(rename = "workspaceId")]
    pub workspace_id: String,
    pub timestamp: String,
}

/// Full impact analysis data
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ImpactData {
    #[serde(rename = "resourceArn")]
    pub resource_arn: String,
    #[serde(rename = "resourceName")]
    pub resource_name: String,
    #[serde(rename = "resourceKind")]
    pub resource_kind: String,
    pub severity: String,
    pub dependents: Vec<ImpactItem>,
    #[serde(rename = "affectedWorkspaces")]
    pub affected_workspaces: Vec<String>,
    #[serde(rename = "recentExecutions")]
    pub recent_executions: Vec<RecentExecution>,
    #[serde(rename = "derivedOverrides")]
    pub derived_overrides: Vec<ImpactItem>,
    #[serde(rename = "policyEffects")]
    pub policy_effects: Vec<String>,
}

/// Parameters for impact analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyzeImpactParams {
    pub arn: String,
    pub kind: String,
}