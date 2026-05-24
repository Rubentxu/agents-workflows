//! Domain-to-MCP type mappers
//!
//! Provides explicit conversion between domain types and MCP types at the seam
//! boundaries. This keeps conversion logic localized and testable.

use crate::types::*;
use crate::execution_store::PersistedExecution;
use workflow::domain::execution_state::ExecutionState as DomainExecutionState;
use workflow::domain::TriggerInfo as DomainTriggerInfo;
use workflow::domain::execution_state::StageOutput as DomainStageOutput;
use std::collections::HashMap;

// ============================================================================
// TriggerInfo Mappers
// ============================================================================

/// Convert domain TriggerInfo to MCP TriggerInfoDto
impl From<&DomainTriggerInfo> for TriggerInfoDto {
    fn from(domain: &DomainTriggerInfo) -> Self {
        TriggerInfoDto {
            trigger_type: domain.trigger_type.clone(),
            source: domain.source.clone(),
            input: domain.input.clone(),
        }
    }
}

/// Convert MCP TriggerInfoDto to domain TriggerInfo
impl From<&TriggerInfoDto> for DomainTriggerInfo {
    fn from(mcp: &TriggerInfoDto) -> Self {
        DomainTriggerInfo {
            trigger_type: mcp.trigger_type.clone(),
            source: mcp.source.clone(),
            input: mcp.input.clone(),
        }
    }
}

/// Helper function to convert TriggerInfoDto to domain TriggerInfo
/// This avoids the ambiguity issue with `T::from()` in Rust
pub fn trigger_info_dto_to_domain(dto: &TriggerInfoDto) -> DomainTriggerInfo {
    DomainTriggerInfo::from(dto)
}

// ============================================================================
// StageOutput Mappers
// ============================================================================

/// Convert domain StageOutput to MCP StageOutputDto
impl From<&DomainStageOutput> for StageOutputDto {
    fn from(_domain: &DomainStageOutput) -> Self {
        StageOutputDto {
            artifacts: Vec::new(), // Domain doesn't have ArtifactRef, only ARNs
        }
    }
}

// ============================================================================
// ExecutionState Mappers
// ============================================================================

/// Convert domain ExecutionState to MCP ExecutionStateDto
/// Note: MCP ExecutionStateDto is a subset of domain - fields like triggered_by,
/// started_at, completed_at exist in domain but not in MCP type.
impl From<&DomainExecutionState> for ExecutionStateDto {
    fn from(domain: &DomainExecutionState) -> Self {
        let stage_outputs: HashMap<String, StageOutputDto> = domain
            .stage_outputs
            .iter()
            .map(|(k, v)| (k.clone(), StageOutputDto::from(v)))
            .collect();

        ExecutionStateDto {
            execution_arn: domain.execution_arn.clone(),
            workflow_arn: domain.workflow_arn.clone(),
            status: domain.status.as_str().to_string(),
            current_stage: domain.current_stage.clone().unwrap_or_default(),
            completed_stages: domain.completed_stages.clone(),
            pending_stages: domain.pending_stages.clone(),
            stage_outputs,
            execution_context: domain.execution_context.clone(),
        }
    }
}

/// Build MCP ExecutionStateDto from PersistedExecution (database read model)
impl From<&PersistedExecution> for ExecutionStateDto {
    fn from(persisted: &PersistedExecution) -> Self {
        ExecutionStateDto {
            execution_arn: persisted.arn.clone(),
            workflow_arn: persisted.workflow_arn.clone(),
            status: persisted.status.clone(),
            current_stage: persisted.current_stage.clone().unwrap_or_default(),
            completed_stages: persisted.completed_stages.clone(),
            pending_stages: Vec::new(), // Derived separately via derive_pending_stages
            stage_outputs: persisted.stage_outputs.clone(),
            execution_context: persisted.execution_context.clone(),
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_domain_trigger_info_to_mcp() {
        let domain = DomainTriggerInfo {
            trigger_type: "manual".to_string(),
            source: Some("cli".to_string()),
            input: serde_json::json!({"goal": "test"}),
        };

        let mcp: TriggerInfoDto = TriggerInfoDto::from(&domain);

        assert_eq!(mcp.trigger_type, "manual");
        assert_eq!(mcp.source, Some("cli".to_string()));
        assert_eq!(mcp.input, serde_json::json!({"goal": "test"}));
    }

    #[test]
    fn test_mcp_trigger_info_to_domain() {
        let mcp = TriggerInfoDto {
            trigger_type: "api".to_string(),
            source: Some("webhook".to_string()),
            input: serde_json::json!({"key": "value"}),
        };

        let domain: DomainTriggerInfo = DomainTriggerInfo::from(&mcp);

        assert_eq!(domain.trigger_type, "api");
        assert_eq!(domain.source, Some("webhook".to_string())); // MCP now exposes source
        assert_eq!(domain.input, serde_json::json!({"key": "value"}));
    }

    #[test]
    fn test_domain_execution_state_to_mcp() {
        use workflow::domain::execution_state::ExecutionStatus;
        use chrono::Utc;

        let domain = DomainExecutionState {
            execution_arn: "arn:test".to_string(),
            workflow_arn: "arn:workflow".to_string(),
            workspace_id: "ws1".to_string(),
            status: ExecutionStatus::Running,
            current_stage: Some("stage-1".to_string()),
            completed_stages: vec!["start".to_string()],
            pending_stages: vec!["stage-2".to_string(), "stage-3".to_string()],
            stage_outputs: std::collections::HashMap::new(),
            stage_statuses: std::collections::HashMap::new(),
            execution_context: serde_json::json!({"ctx": true}),
            triggered_by: DomainTriggerInfo {
                trigger_type: "manual".to_string(),
                source: None,
                input: serde_json::Value::Null,
            },
            started_at: Some(Utc::now()),
            completed_at: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let mcp: ExecutionStateDto = ExecutionStateDto::from(&domain);

        assert_eq!(mcp.execution_arn, "arn:test");
        assert_eq!(mcp.workflow_arn, "arn:workflow");
        assert_eq!(mcp.status, "running");
        assert_eq!(mcp.current_stage, "stage-1");
        assert_eq!(mcp.completed_stages, vec!["start"]);
        assert_eq!(mcp.pending_stages, vec!["stage-2", "stage-3"]);
        assert_eq!(mcp.execution_context, serde_json::json!({"ctx": true}));
    }
}
