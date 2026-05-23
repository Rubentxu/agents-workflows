//! Agent resource CRUD implementation
//!
//! Implements ResourceCallbacks for the Agent resource type.

use std::sync::Arc;
use axum::{http::StatusCode, Json};
use registry::domain::Node;

use crate::rest::RestState;
use crate::rest_types::{CreateAgentRequest, UpdateAgentRequest};
use crate::types::AgentSummary;
use crate::resources::{
    CrudError, not_found, internal_error, list_response, node_to_response, validate_arn,
};

/// Build Agent ARN from scope and name
pub fn build_arn(scope: &str, name: &str) -> String {
    format!("arn:local:{}:agent/{}", scope, name)
}

/// Build Agent config YAML from request
pub fn build_agent_config(req: &CreateAgentRequest) -> Result<String, String> {
    let config = serde_json::json!({
        "apiVersion": "agents.local/v1",
        "kind": "Agent",
        "metadata": {
            "name": req.name,
            "scope": req.scope,
        },
        "spec": {
            "description": req.description,
            "model": req.model,
            "prompt": req.prompt,
            "skills": req.skills,
            "tools": req.tools,
            "permission": req.permission,
            "temperature": req.temperature,
            "top_p": req.top_p,
            "steps": req.steps,
            "mode": req.mode,
            "hidden": req.hidden,
            "color": req.color,
            "variant": req.variant,
            "options": req.options,
        },
    });
    serde_yaml::to_string(&config).map_err(|e| e.to_string())
}

/// Apply update request to existing config YAML
pub fn apply_agent_update(
    config: &mut serde_yaml::Value,
    req: &UpdateAgentRequest,
) {
    let spec = config.as_mapping_mut()
        .and_then(|m| m.get_mut(&serde_yaml::Value::String("spec".to_string())))
        .and_then(|s| s.as_mapping_mut());
    let Some(spec) = spec else { return; };

    // Description
    if let Some(v) = &req.description {
        spec.insert(serde_yaml::Value::String("description".to_string()), serde_yaml::Value::String(v.clone()));
    }
    // Model
    if let Some(v) = &req.model {
        spec.insert(serde_yaml::Value::String("model".to_string()), serde_yaml::Value::String(v.clone()));
    }
    // Prompt
    if let Some(v) = &req.prompt {
        spec.insert(serde_yaml::Value::String("prompt".to_string()), serde_yaml::Value::String(v.clone()));
    }
    // Skills
    if let Some(ref v) = req.skills {
        if let Ok(yaml_val) = serde_yaml::from_str::<serde_yaml::Value>(&serde_json::to_string(v).unwrap_or_default()) {
            spec.insert(serde_yaml::Value::String("skills".to_string()), yaml_val);
        }
    }
    // Tools
    if let Some(ref v) = req.tools {
        if let Ok(yaml_val) = serde_yaml::from_str::<serde_yaml::Value>(&serde_json::to_string(v).unwrap_or_default()) {
            spec.insert(serde_yaml::Value::String("tools".to_string()), yaml_val);
        }
    }
    // Permission
    if let Some(ref v) = req.permission {
        if let Ok(yaml_val) = serde_yaml::from_str::<serde_yaml::Value>(&serde_json::to_string(v).unwrap_or_default()) {
            spec.insert(serde_yaml::Value::String("permission".to_string()), yaml_val);
        }
    }
    // Temperature
    if let Some(v) = req.temperature {
        spec.insert(serde_yaml::Value::String("temperature".to_string()), serde_yaml::Value::Number(serde_yaml::Number::from(v)));
    }
    // Top P
    if let Some(v) = req.top_p {
        spec.insert(serde_yaml::Value::String("top_p".to_string()), serde_yaml::Value::Number(serde_yaml::Number::from(v)));
    }
    // Steps
    if let Some(v) = req.steps {
        spec.insert(serde_yaml::Value::String("steps".to_string()), serde_yaml::Value::Number(serde_yaml::Number::from(v)));
    }
    // Mode
    if let Some(v) = &req.mode {
        spec.insert(serde_yaml::Value::String("mode".to_string()), serde_yaml::Value::String(v.clone()));
    }
    // Hidden
    if let Some(v) = req.hidden {
        spec.insert(serde_yaml::Value::String("hidden".to_string()), serde_yaml::Value::Bool(v));
    }
    // Color
    if let Some(v) = &req.color {
        spec.insert(serde_yaml::Value::String("color".to_string()), serde_yaml::Value::String(v.clone()));
    }
    // Variant
    if let Some(v) = &req.variant {
        spec.insert(serde_yaml::Value::String("variant".to_string()), serde_yaml::Value::String(v.clone()));
    }
    // Options
    if let Some(ref v) = req.options {
        if let Ok(yaml_val) = serde_yaml::from_str::<serde_yaml::Value>(&serde_json::to_string(v).unwrap_or_default()) {
            spec.insert(serde_yaml::Value::String("options".to_string()), yaml_val);
        }
    }
}

/// Convert Node to AgentSummary
pub fn node_to_summary(node: &Node) -> AgentSummary {
    AgentSummary {
        arn: node.id.clone(),
        name: node.name.clone(),
        description: extract_description(node),
        scope: node.scope.clone(),
    }
}

/// Extract description from node's config
fn extract_description(node: &Node) -> String {
    if let Some(config) = &node.config_json {
        if let Ok(yaml) = serde_yaml::from_str::<serde_yaml::Value>(config) {
            if let Some(spec) = yaml.get("spec") {
                if let Some(desc) = spec.get("description") {
                    return desc.as_str().unwrap_or_default().to_string();
                }
            }
        }
    }
    String::new()
}

// ============================================================================
// CRUD Handlers
// ============================================================================

/// List all agents
pub async fn list(state: Arc<RestState>) -> Result<Json<serde_json::Value>, CrudError> {
    let nodes = state.list_by_type("agent").map_err(internal_error)?;
    let summaries: Vec<_> = nodes.iter().map(node_to_summary).collect();
    Ok(Json(list_response(summaries, "agents")))
}

/// Get an agent by ARN
pub async fn get(state: Arc<RestState>, arn: &str) -> Result<Json<serde_json::Value>, CrudError> {
    let arn = validate_arn(arn)?;
    match state.get_node(&arn).map_err(internal_error)? {
        Some(node) => Ok(Json(node_to_response(&node))),
        None => Err(not_found("Agent", &arn)),
    }
}

/// Create an agent
pub async fn create(
    state: Arc<RestState>,
    req: CreateAgentRequest,
) -> Result<(StatusCode, Json<serde_json::Value>), CrudError> {
    let arn = build_arn(&req.scope, &req.name);
    let config_yaml = build_agent_config(&req).map_err(internal_error)?;

    let mut node = Node::new(
        arn.clone(),
        registry::domain::NodeType::Agent,
        req.name.clone(),
        req.scope.clone(),
        format!("{}/agent", req.scope),
    );
    node.config_json = Some(config_yaml);

    state.save_node(node).map_err(internal_error)?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "arn": arn,
            "name": req.name,
            "scope": req.scope,
            "created_at": chrono::Utc::now().to_rfc3339()
        })),
    ))
}

/// Update an agent
pub async fn update(
    state: Arc<RestState>,
    arn: &str,
    req: UpdateAgentRequest,
) -> Result<Json<serde_json::Value>, CrudError> {
    let arn = validate_arn(arn)?;
    let existing = state.get_node(&arn).map_err(internal_error)?.ok_or_else(|| not_found("Agent", &arn))?;

    let mut config: serde_yaml::Value = existing
        .config_json
        .as_ref()
        .and_then(|c| serde_yaml::from_str(c).ok())
        .unwrap_or_else(|| serde_yaml::Value::Mapping(Default::default()));

    apply_agent_update(&mut config, &req);

    let config_yaml = serde_yaml::to_string(&config).map_err(internal_error)?;

    let mut updated = Node::new(
        arn.clone(),
        registry::domain::NodeType::Agent,
        existing.name.clone(),
        existing.scope.clone(),
        existing.namespace.clone(),
    );
    updated.config_json = Some(config_yaml);
    updated.checksum = existing.checksum.clone();
    updated.created_at = existing.created_at;

    state.save_node(updated).map_err(internal_error)?;

    Ok(Json(serde_json::json!({ "arn": arn })))
}

/// Delete an agent
pub async fn delete(state: Arc<RestState>, arn: &str) -> Result<StatusCode, CrudError> {
    let arn = validate_arn(arn)?;
    let deleted = state.delete_node(&arn).map_err(internal_error)?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(not_found("Agent", &arn))
    }
}
