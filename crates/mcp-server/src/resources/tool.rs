//! Tool resource CRUD implementation
//!
//! Implements CRUD operations for the Tool resource type.

use std::sync::Arc;
use axum::{http::StatusCode, Json};
use registry::domain::Node;

use crate::rest::RestState;
use crate::rest_types::{CreateToolRequest, UpdateToolRequest};
use crate::resources::{
    CrudError, not_found, internal_error, list_response, node_to_response, validate_arn,
};

/// Build Tool ARN from scope and name
pub fn build_arn(scope: &str, name: &str) -> String {
    format!("arn:local:{}:tool/{}", scope, name)
}

/// Build Tool config YAML from request
pub fn build_tool_config(req: &CreateToolRequest) -> Result<String, String> {
    let config = serde_json::json!({
        "apiVersion": "tools.local/v1",
        "kind": "Tool",
        "metadata": {
            "name": req.name,
            "scope": req.scope,
        },
        "spec": {
            "description": req.description,
            "source": req.source,
            "source_type": req.source_type,
            "input_schema": req.input_schema,
            "output_schema": req.output_schema,
            "category": req.category,
            "tags": req.tags,
            "implementation_path": req.implementation_path,
            "runtime": req.runtime,
        },
    });
    serde_yaml::to_string(&config).map_err(|e| e.to_string())
}

/// Apply update request to existing config YAML
pub fn apply_tool_update(
    config: &mut serde_yaml::Value,
    req: &UpdateToolRequest,
) {
    let spec = config.as_mapping_mut()
        .and_then(|m| m.get_mut(&serde_yaml::Value::String("spec".to_string())))
        .and_then(|s| s.as_mapping_mut());
    let Some(spec) = spec else { return; };

    if let Some(v) = &req.description {
        spec.insert(serde_yaml::Value::String("description".to_string()), serde_yaml::Value::String(v.clone()));
    }
    if let Some(ref v) = req.input_schema {
        if let Ok(yaml_val) = serde_yaml::from_str::<serde_yaml::Value>(&serde_json::to_string(v).unwrap_or_default()) {
            spec.insert(serde_yaml::Value::String("input_schema".to_string()), yaml_val);
        }
    }
    if let Some(ref v) = req.output_schema {
        if let Ok(yaml_val) = serde_yaml::from_str::<serde_yaml::Value>(&serde_json::to_string(v).unwrap_or_default()) {
            spec.insert(serde_yaml::Value::String("output_schema".to_string()), yaml_val);
        }
    }
    if let Some(v) = &req.category {
        spec.insert(serde_yaml::Value::String("category".to_string()), serde_yaml::Value::String(v.clone()));
    }
    if let Some(ref v) = req.tags {
        if let Ok(yaml_val) = serde_yaml::from_str::<serde_yaml::Value>(&serde_json::to_string(v).unwrap_or_default()) {
            spec.insert(serde_yaml::Value::String("tags".to_string()), yaml_val);
        }
    }
    if let Some(v) = &req.implementation_path {
        spec.insert(serde_yaml::Value::String("implementation_path".to_string()), serde_yaml::Value::String(v.clone()));
    }
    if let Some(v) = &req.runtime {
        spec.insert(serde_yaml::Value::String("runtime".to_string()), serde_yaml::Value::String(v.clone()));
    }
}

// ============================================================================
// CRUD Handlers
// ============================================================================

/// List all tools
pub async fn list(state: Arc<RestState>) -> Result<Json<serde_json::Value>, CrudError> {
    let nodes = state.list_by_type("tool").map_err(internal_error)?;
    let items: Vec<_> = nodes.iter().map(|n| {
        serde_json::json!({
            "id": n.id,
            "name": n.name,
            "namespace": n.namespace,
            "scope": n.scope,
            "created_at": n.created_at.to_rfc3339(),
        })
    }).collect();
    Ok(Json(list_response(items, "tools")))
}

/// Get a tool by ARN
pub async fn get(state: Arc<RestState>, arn: &str) -> Result<Json<serde_json::Value>, CrudError> {
    let arn = validate_arn(arn)?;
    match state.get_node(&arn).map_err(internal_error)? {
        Some(node) => Ok(Json(node_to_response(&node))),
        None => Err(not_found("Tool", &arn)),
    }
}

/// Create a tool
pub async fn create(
    state: Arc<RestState>,
    req: CreateToolRequest,
) -> Result<(StatusCode, Json<serde_json::Value>), CrudError> {
    let arn = build_arn(&req.scope, &req.name);
    let config_yaml = build_tool_config(&req).map_err(internal_error)?;

    let mut node = Node::new(
        arn.clone(),
        registry::domain::NodeType::Tool,
        req.name.clone(),
        req.scope.clone(),
        format!("{}/tool", req.scope),
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

/// Update a tool
pub async fn update(
    state: Arc<RestState>,
    arn: &str,
    req: UpdateToolRequest,
) -> Result<Json<serde_json::Value>, CrudError> {
    let arn = validate_arn(arn)?;
    let existing = state.get_node(&arn).map_err(internal_error)?.ok_or_else(|| not_found("Tool", &arn))?;

    let mut config: serde_yaml::Value = existing
        .config_json
        .as_ref()
        .and_then(|c| serde_yaml::from_str(c).ok())
        .unwrap_or_else(|| serde_yaml::Value::Mapping(Default::default()));

    apply_tool_update(&mut config, &req);

    let config_yaml = serde_yaml::to_string(&config).map_err(internal_error)?;

    let mut updated = Node::new(
        arn.clone(),
        registry::domain::NodeType::Tool,
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

/// Delete a tool
pub async fn delete(state: Arc<RestState>, arn: &str) -> Result<StatusCode, CrudError> {
    let arn = validate_arn(arn)?;
    let deleted = state.delete_node(&arn).map_err(internal_error)?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(not_found("Tool", &arn))
    }
}