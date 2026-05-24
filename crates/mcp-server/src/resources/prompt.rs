//! Prompt resource CRUD implementation
//!
//! Implements CRUD operations for the Prompt resource type.

use std::sync::Arc;
use axum::{http::StatusCode, Json};
use registry::domain::Node;

use crate::state::AppState;
use crate::rest_types::{CreatePromptRequest, UpdatePromptRequest};
use crate::resources::{
    CrudError, not_found, internal_error, list_response, node_to_response, validate_arn,
};

/// Build Prompt ARN from scope and name
pub fn build_arn(scope: &str, name: &str) -> String {
    format!("arn:local:{}:prompt/{}", scope, name)
}

/// Build Prompt config YAML from request
pub fn build_prompt_config(req: &CreatePromptRequest) -> Result<String, String> {
    let config = serde_json::json!({
        "apiVersion": "prompts.local/v1",
        "kind": "Prompt",
        "metadata": {
            "name": req.name,
            "scope": req.scope,
        },
        "spec": {
            "description": req.description,
            "content_path": req.content_path,
            "content": req.content,
            "kind": req.kind,
            "template": req.template,
        },
    });
    serde_yaml::to_string(&config).map_err(|e| e.to_string())
}

/// Apply update request to existing config YAML
pub fn apply_prompt_update(
    config: &mut serde_yaml::Value,
    req: &UpdatePromptRequest,
) {
    let spec = config.as_mapping_mut()
        .and_then(|m| m.get_mut(&serde_yaml::Value::String("spec".to_string())))
        .and_then(|s| s.as_mapping_mut());
    let Some(spec) = spec else { return; };

    if let Some(v) = &req.description {
        spec.insert(serde_yaml::Value::String("description".to_string()), serde_yaml::Value::String(v.clone()));
    }
    if let Some(v) = &req.content_path {
        spec.insert(serde_yaml::Value::String("content_path".to_string()), serde_yaml::Value::String(v.clone()));
    }
    if let Some(v) = &req.content {
        spec.insert(serde_yaml::Value::String("content".to_string()), serde_yaml::Value::String(v.clone()));
    }
    if let Some(v) = &req.kind {
        spec.insert(serde_yaml::Value::String("kind".to_string()), serde_yaml::Value::String(v.clone()));
    }
    if let Some(v) = &req.template {
        spec.insert(serde_yaml::Value::String("template".to_string()), serde_yaml::Value::String(v.clone()));
    }
}

// ============================================================================
// CRUD Handlers
// ============================================================================

/// List all prompts
pub async fn list(state: Arc<AppState>) -> Result<Json<serde_json::Value>, CrudError> {
    let nodes = state.list_by_type_str("prompt").map_err(internal_error)?;
    let items: Vec<_> = nodes.iter().map(|n| {
        serde_json::json!({
            "id": n.id,
            "name": n.name,
            "namespace": n.namespace,
            "scope": n.scope,
            "created_at": n.created_at.to_rfc3339(),
        })
    }).collect();
    Ok(Json(list_response(items, "prompts")))
}

/// Get a prompt by ARN
pub async fn get(state: Arc<AppState>, arn: &str) -> Result<Json<serde_json::Value>, CrudError> {
    let arn = validate_arn(arn)?;
    match state.get_node_by_arn(&arn).map_err(internal_error)? {
        Some(node) => Ok(Json(node_to_response(&node))),
        None => Err(not_found("Prompt", &arn)),
    }
}

/// Create a prompt
pub async fn create(
    state: Arc<AppState>,
    req: CreatePromptRequest,
) -> Result<(StatusCode, Json<serde_json::Value>), CrudError> {
    let arn = build_arn(&req.scope, &req.name);
    let config_yaml = build_prompt_config(&req).map_err(internal_error)?;

    let mut node = Node::new(
        arn.clone(),
        registry::domain::NodeType::Prompt,
        req.name.clone(),
        req.scope.clone(),
        format!("{}/prompt", req.scope),
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

/// Update a prompt
pub async fn update(
    state: Arc<AppState>,
    arn: &str,
    req: UpdatePromptRequest,
) -> Result<Json<serde_json::Value>, CrudError> {
    let arn = validate_arn(arn)?;
    let existing = state.get_node_by_arn(&arn).map_err(internal_error)?.ok_or_else(|| not_found("Prompt", &arn))?;

    let mut config: serde_yaml::Value = existing
        .config_json
        .as_ref()
        .and_then(|c| serde_yaml::from_str(c).ok())
        .unwrap_or_else(|| serde_yaml::Value::Mapping(Default::default()));

    apply_prompt_update(&mut config, &req);

    let config_yaml = serde_yaml::to_string(&config).map_err(internal_error)?;

    let mut updated = Node::new(
        arn.clone(),
        registry::domain::NodeType::Prompt,
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

/// Delete a prompt
pub async fn delete(state: Arc<AppState>, arn: &str) -> Result<StatusCode, CrudError> {
    let arn = validate_arn(arn)?;
    let deleted = state.delete_node_by_arn(&arn).map_err(internal_error)?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(not_found("Prompt", &arn))
    }
}