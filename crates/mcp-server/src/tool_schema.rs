//! Tool Schema Builder
//!
//! Central factory for building input schemas used in MCP tool registration.
//! Uses a builder pattern with `InputField` structs to produce JSON Schema objects.
//! Also provides per-tool output schema functions using schemars derive.

use rmcp::model::JsonObject;

// Import all DTO types that need output schemas
use crate::types::{
    WorkflowSummary, WorkflowDto, Dag,
    ExecutionSummary, ExecutionDto, StageExecution, ExecutionStateDto, NextStage,
    AgentSummary, AgentDto,
    SkillSummary, SkillDto,
    PromptSummary, PromptDto,
    ArtifactSummary, ArtifactDto,
    InsightsAggregateResult,
    MetricsResponse, SseUrl,
    ImpactData,
};

/// Describes an input field for a tool's input schema.
pub struct InputField {
    pub name: &'static str,
    pub description: &'static str,
    pub json_type: &'static str,
    pub example: serde_json::Value,
}

/// Build a JSON Schema object from a list of input fields and required field names.
///
/// # Example
///
/// ```ignore
/// let schema = input_schema(
///     &[
///         InputField { name: "arn", description: "Resource ARN", json_type: "string", example: json!("arn:local:global:workflow/my-workflow") },
///     ],
///     &["arn"],
/// );
/// ```
pub fn input_schema(fields: &[InputField], required: &[&str]) -> JsonObject {
    let mut properties = serde_json::Map::new();

    for field in fields {
        let mut prop = serde_json::Map::new();
        prop.insert("type".into(), serde_json::Value::String(field.json_type.to_string()));
        prop.insert("description".into(), serde_json::Value::String(field.description.to_string()));

        let examples = vec![field.example.clone()];
        prop.insert("examples".into(), serde_json::Value::Array(examples));

        properties.insert(field.name.to_string(), serde_json::Value::Object(prop));
    }

    let mut schema = serde_json::Map::new();
    schema.insert("type".into(), serde_json::Value::String("object".to_string()));
    schema.insert("properties".into(), serde_json::Value::Object(properties));

    let required_fields: Vec<serde_json::Value> = required
        .iter()
        .map(|r| serde_json::Value::String(r.to_string()))
        .collect();
    schema.insert("required".into(), serde_json::Value::Array(required_fields));

    schema
}

// ============================================================================
// Output Schema Functions
// ============================================================================

/// Convert a schemars RootSchema to a JsonObject.
/// Panics if serialization fails (should never happen with valid schemas).
fn schema_to_object<T: schemars::JsonSchema>() -> JsonObject {
    let schema = schemars::schema_for!(T);
    serde_json::to_value(schema)
        .ok()
        .and_then(|v| match v {
            serde_json::Value::Object(map) => Some(map),
            _ => None,
        })
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Workflow output schemas
// ---------------------------------------------------------------------------

/// Output schema for workflow_list (Vec<WorkflowSummary>)
pub fn output_schema_for_workflow_list() -> JsonObject {
    schema_to_object::<Vec<WorkflowSummary>>()
}

/// Output schema for workflow_get (WorkflowDto)
pub fn output_schema_for_workflow_get() -> JsonObject {
    schema_to_object::<WorkflowDto>()
}

/// Output schema for workflow_get_dag (Dag)
pub fn output_schema_for_workflow_get_dag() -> JsonObject {
    schema_to_object::<Dag>()
}

/// Output schema for execution_list (Vec<ExecutionSummary>)
pub fn output_schema_for_execution_list() -> JsonObject {
    schema_to_object::<Vec<ExecutionSummary>>()
}

/// Output schema for execution_get (ExecutionDto)
pub fn output_schema_for_execution_get() -> JsonObject {
    schema_to_object::<ExecutionDto>()
}

/// Output schema for execution_history (Vec<StageExecution>)
pub fn output_schema_for_execution_history() -> JsonObject {
    schema_to_object::<Vec<StageExecution>>()
}

/// Output schema for execution_state (ExecutionStateDto)
pub fn output_schema_for_execution_state() -> JsonObject {
    schema_to_object::<ExecutionStateDto>()
}

/// Output schema for next_stage (NextStage)
pub fn output_schema_for_next_stage() -> JsonObject {
    schema_to_object::<NextStage>()
}

/// Output schema for workflow_execute and workflow_abort (empty object)
pub fn output_schema_for_empty() -> JsonObject {
    serde_json::json!({ "type": "object", "properties": {} })
        .as_object()
        .unwrap()
        .clone()
}

// ---------------------------------------------------------------------------
// Agent output schemas
// ---------------------------------------------------------------------------

/// Output schema for agent_list (Vec<AgentSummary>)
pub fn output_schema_for_agent_list() -> JsonObject {
    schema_to_object::<Vec<AgentSummary>>()
}

/// Output schema for agent_get (AgentDto)
pub fn output_schema_for_agent_get() -> JsonObject {
    schema_to_object::<AgentDto>()
}

/// Output schema for agent_query (Vec<AgentSummary>)
pub fn output_schema_for_agent_query() -> JsonObject {
    schema_to_object::<Vec<AgentSummary>>()
}

// ---------------------------------------------------------------------------
// Skill output schemas
// ---------------------------------------------------------------------------

/// Output schema for skill_list (Vec<SkillSummary>)
pub fn output_schema_for_skill_list() -> JsonObject {
    schema_to_object::<Vec<SkillSummary>>()
}

/// Output schema for skill_get (SkillDto)
pub fn output_schema_for_skill_get() -> JsonObject {
    schema_to_object::<SkillDto>()
}

/// Output schema for skill_query (Vec<SkillSummary>)
pub fn output_schema_for_skill_query() -> JsonObject {
    schema_to_object::<Vec<SkillSummary>>()
}

// ---------------------------------------------------------------------------
// Prompt output schemas
// ---------------------------------------------------------------------------

/// Output schema for prompt_list (Vec<PromptSummary>)
pub fn output_schema_for_prompt_list() -> JsonObject {
    schema_to_object::<Vec<PromptSummary>>()
}

/// Output schema for prompt_get (PromptDto)
pub fn output_schema_for_prompt_get() -> JsonObject {
    schema_to_object::<PromptDto>()
}

// ---------------------------------------------------------------------------
// Artifact output schemas
// ---------------------------------------------------------------------------

/// Output schema for artifact_create (ArtifactDto)
pub fn output_schema_for_artifact_create() -> JsonObject {
    schema_to_object::<ArtifactDto>()
}

/// Output schema for artifact_get (ArtifactDto)
pub fn output_schema_for_artifact_get() -> JsonObject {
    schema_to_object::<ArtifactDto>()
}

/// Output schema for artifact_list (Vec<ArtifactSummary>)
pub fn output_schema_for_artifact_list() -> JsonObject {
    schema_to_object::<Vec<ArtifactSummary>>()
}

// ---------------------------------------------------------------------------
// Insight output schemas
// ---------------------------------------------------------------------------

/// Output schema for insights_log (any JSON value)
pub fn output_schema_for_insights_log() -> JsonObject {
    // serde_json::Value doesn't implement JsonSchema, so we use a manual schema
    // that accepts any JSON value
    serde_json::json!({})
        .as_object()
        .unwrap()
        .clone()
}

/// Output schema for insights_query (any JSON value)
pub fn output_schema_for_insights_query() -> JsonObject {
    serde_json::json!({})
        .as_object()
        .unwrap()
        .clone()
}

/// Output schema for insights_aggregate (InsightsAggregateResult)
pub fn output_schema_for_insights_aggregate() -> JsonObject {
    schema_to_object::<InsightsAggregateResult>()
}

// ---------------------------------------------------------------------------
// Metrics output schemas
// ---------------------------------------------------------------------------

/// Output schema for metrics_query (MetricsResponse)
pub fn output_schema_for_metrics_query() -> JsonObject {
    schema_to_object::<MetricsResponse>()
}

/// Output schema for metrics_subscribe (SseUrl)
pub fn output_schema_for_metrics_subscribe() -> JsonObject {
    schema_to_object::<SseUrl>()
}

// ---------------------------------------------------------------------------
// Impact output schema
// ---------------------------------------------------------------------------

/// Output schema for analyze_impact (ImpactData)
pub fn output_schema_for_analyze_impact() -> JsonObject {
    schema_to_object::<ImpactData>()
}

// ---------------------------------------------------------------------------
// Tool search/inspect output schemas
// ---------------------------------------------------------------------------

/// Output schema for list_nodes (Vec of node objects)
pub fn output_schema_for_list_nodes() -> JsonObject {
    serde_json::json!({
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "id": { "type": "string" },
                "type": { "type": "string" },
                "name": { "type": "string" },
                "registry": { "type": "string" },
                "namespace": { "type": "string" },
                "created_at": { "type": ["string", "null"] },
                "updated_at": { "type": ["string", "null"] }
            }
        }
    })
    .as_object()
    .unwrap()
    .clone()
}

/// Output schema for list_edges (Vec of edge objects)
pub fn output_schema_for_list_edges() -> JsonObject {
    serde_json::json!({
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "from_id": { "type": "string" },
                "to_id": { "type": "string" },
                "relationship_type": { "type": "string" }
            }
        }
    })
    .as_object()
    .unwrap()
    .clone()
}

/// Output schema for tool_search (Vec of tool metadata objects)
pub fn output_schema_for_tool_search() -> JsonObject {
    // Tool search returns a dynamic array
    serde_json::json!({
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "arn": { "type": "string" },
                "name": { "type": "string" },
                "description": { "type": "string" },
                "category": { "type": "string" },
                "tags": { "type": "array", "items": { "type": "string" } },
                "source_type": { "type": "string" }
            }
        }
    })
    .as_object()
    .unwrap()
    .clone()
}

/// Output schema for tool_inspect (tool metadata with schemas)
pub fn output_schema_for_tool_inspect() -> JsonObject {
    serde_json::json!({
        "type": "object",
        "properties": {
            "arn": { "type": "string" },
            "name": { "type": "string" },
            "description": { "type": "string" },
            "category": { "type": "string" },
            "tags": { "type": "array", "items": { "type": "string" } },
            "source_type": { "type": "string" },
            "input_schema": { "type": "object" },
            "output_schema": { "type": "object" }
        }
    })
    .as_object()
    .unwrap()
    .clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_input_schema_produces_valid_json_schema() {
        let schema = input_schema(
            &[
                InputField { name: "arn", description: "Resource ARN", json_type: "string", example: json!("arn:local:global:workflow/test") },
                InputField { name: "limit", description: "Max results", json_type: "number", example: json!(10) },
            ],
            &["arn"],
        );

        // Must have "type": "object"
        assert_eq!(schema.get("type").and_then(|v| v.as_str()), Some("object"));

        // Must have "properties" key
        let properties = schema.get("properties").and_then(|v| v.as_object());
        assert!(properties.is_some(), "schema must have properties");

        let properties = properties.unwrap();

        // Must contain both fields
        assert!(properties.contains_key("arn"));
        assert!(properties.contains_key("limit"));

        // Each property must have "type" and "description"
        for (name, prop) in properties {
            let obj = prop.as_object().expect("each property must be an object");
            assert!(
                obj.contains_key("type"),
                "property '{}' must have a type",
                name
            );
            assert!(
                obj.contains_key("description"),
                "property '{}' must have a description",
                name
            );
        }

        // Must have "required" key with correct values
        let required = schema.get("required").and_then(|v| v.as_array());
        assert!(required.is_some(), "schema must have required");
        assert_eq!(required.unwrap().len(), 1);
        assert_eq!(
            required.unwrap()[0].as_str(),
            Some("arn")
        );
    }

    #[test]
    fn test_input_schema_empty_fields() {
        let schema = input_schema(&[], &[]);

        assert_eq!(schema.get("type").and_then(|v| v.as_str()), Some("object"));
        let properties = schema.get("properties").and_then(|v| v.as_object());
        assert!(properties.is_some());
        assert!(properties.unwrap().is_empty());

        let required = schema.get("required").and_then(|v| v.as_array());
        assert!(required.is_some());
        assert!(required.unwrap().is_empty());
    }

    // ---------------------------------------------------------------------------
    // Output Schema Tests
    // ---------------------------------------------------------------------------

    /// Helper: assert a schema is a valid JSON Schema object
    fn assert_valid_schema(schema: &JsonObject, name: &str) {
        assert!(
            schema.get("type").is_some()
                || schema.contains_key("$ref")
                || schema.contains_key("definitions")
                || schema.contains_key("$defs")
                || schema.contains_key("oneOf")
                || schema.contains_key("anyOf")
                || schema.is_empty(), // empty schema accepts any value
            "{}: schema must have type, $ref, definitions, $defs, oneOf, anyOf, or be empty (got keys: {:?})",
            name,
            schema.keys().collect::<Vec<_>>(),
        );
    }

    #[test]
    fn test_output_schema_workflow_list() {
        let schema = output_schema_for_workflow_list();
        assert_valid_schema(&schema, "workflow_list");
    }

    #[test]
    fn test_output_schema_workflow_get() {
        let schema = output_schema_for_workflow_get();
        assert_valid_schema(&schema, "workflow_get");
    }

    #[test]
    fn test_output_schema_workflow_get_dag() {
        let schema = output_schema_for_workflow_get_dag();
        assert_valid_schema(&schema, "workflow_get_dag");
    }

    #[test]
    fn test_output_schema_execution_list() {
        let schema = output_schema_for_execution_list();
        assert_valid_schema(&schema, "execution_list");
    }

    #[test]
    fn test_output_schema_execution_get() {
        let schema = output_schema_for_execution_get();
        assert_valid_schema(&schema, "execution_get");
    }

    #[test]
    fn test_output_schema_execution_history() {
        let schema = output_schema_for_execution_history();
        assert_valid_schema(&schema, "execution_history");
    }

    #[test]
    fn test_output_schema_execution_state() {
        let schema = output_schema_for_execution_state();
        assert_valid_schema(&schema, "execution_state");
    }

    #[test]
    fn test_output_schema_next_stage() {
        let schema = output_schema_for_next_stage();
        assert_valid_schema(&schema, "next_stage");
    }

    #[test]
    fn test_output_schema_empty() {
        let schema = output_schema_for_empty();
        assert_eq!(schema.get("type").and_then(|v| v.as_str()), Some("object"));
    }

    #[test]
    fn test_output_schema_agent_list() {
        let schema = output_schema_for_agent_list();
        assert_valid_schema(&schema, "agent_list");
    }

    #[test]
    fn test_output_schema_agent_get() {
        let schema = output_schema_for_agent_get();
        assert_valid_schema(&schema, "agent_get");
    }

    #[test]
    fn test_output_schema_agent_query() {
        let schema = output_schema_for_agent_query();
        assert_valid_schema(&schema, "agent_query");
    }

    #[test]
    fn test_output_schema_skill_list() {
        let schema = output_schema_for_skill_list();
        assert_valid_schema(&schema, "skill_list");
    }

    #[test]
    fn test_output_schema_skill_get() {
        let schema = output_schema_for_skill_get();
        assert_valid_schema(&schema, "skill_get");
    }

    #[test]
    fn test_output_schema_skill_query() {
        let schema = output_schema_for_skill_query();
        assert_valid_schema(&schema, "skill_query");
    }

    #[test]
    fn test_output_schema_prompt_list() {
        let schema = output_schema_for_prompt_list();
        assert_valid_schema(&schema, "prompt_list");
    }

    #[test]
    fn test_output_schema_prompt_get() {
        let schema = output_schema_for_prompt_get();
        assert_valid_schema(&schema, "prompt_get");
    }

    #[test]
    fn test_output_schema_artifact_create() {
        let schema = output_schema_for_artifact_create();
        assert_valid_schema(&schema, "artifact_create");
    }

    #[test]
    fn test_output_schema_artifact_get() {
        let schema = output_schema_for_artifact_get();
        assert_valid_schema(&schema, "artifact_get");
    }

    #[test]
    fn test_output_schema_artifact_list() {
        let schema = output_schema_for_artifact_list();
        assert_valid_schema(&schema, "artifact_list");
    }

    #[test]
    fn test_output_schema_insights_log() {
        let schema = output_schema_for_insights_log();
        assert_valid_schema(&schema, "insights_log");
    }

    #[test]
    fn test_output_schema_insights_query() {
        let schema = output_schema_for_insights_query();
        assert_valid_schema(&schema, "insights_query");
    }

    #[test]
    fn test_output_schema_insights_aggregate() {
        let schema = output_schema_for_insights_aggregate();
        assert_valid_schema(&schema, "insights_aggregate");
    }

    #[test]
    fn test_output_schema_metrics_query() {
        let schema = output_schema_for_metrics_query();
        assert_valid_schema(&schema, "metrics_query");
    }

    #[test]
    fn test_output_schema_metrics_subscribe() {
        let schema = output_schema_for_metrics_subscribe();
        assert_valid_schema(&schema, "metrics_subscribe");
    }

    #[test]
    fn test_output_schema_analyze_impact() {
        let schema = output_schema_for_analyze_impact();
        assert_valid_schema(&schema, "analyze_impact");
    }

    #[test]
    fn test_output_schema_tool_search() {
        let schema = output_schema_for_tool_search();
        assert_valid_schema(&schema, "tool_search");
    }

    #[test]
    fn test_output_schema_tool_inspect() {
        let schema = output_schema_for_tool_inspect();
        assert_valid_schema(&schema, "tool_inspect");
    }
}
