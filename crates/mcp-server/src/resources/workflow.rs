//! Workflow resource CRUD implementation
//!
//! Implements CRUD operations for the Workflow resource type.

use std::sync::Arc;
use axum::{http::StatusCode, Json};
use registry::domain::Node;

use crate::state::AppState;
use crate::rest_types::{CreateWorkflowRequest, UpdateWorkflowRequest};
use crate::resources::{
    CrudError, not_found, internal_error, list_response, node_to_response, validate_arn,
};

/// Build Workflow ARN from scope and name
pub fn build_arn(scope: &str, name: &str) -> String {
    format!("arn:local:{}:workflow/{}", scope, name)
}

/// Build Workflow config YAML from request
pub fn build_workflow_config(req: &CreateWorkflowRequest) -> Result<String, String> {
    let config = serde_json::json!({
        "apiVersion": "workflows.local/v1",
        "kind": "Workflow",
        "version": "1.0",
        "description": req.description.clone().unwrap_or_default(),
        "metadata": {
            "name": req.name,
            "scope": req.scope,
            "labels": {},
            "annotations": {
                "description": req.description.clone().unwrap_or_default(),
            },
        },
        "spec": {
            "stages": req.stages,
            "execution": req.execution,
        },
    });
    serde_yaml::to_string(&config).map_err(|e| e.to_string())
}

/// Apply update request to existing config YAML
pub fn apply_workflow_update(
    config: &mut serde_yaml::Value,
    req: &UpdateWorkflowRequest,
) {
    // Ensure spec section exists
    if config.get("spec").is_none() {
        config["spec"] = serde_yaml::Value::Mapping(Default::default());
    }

    if let Some(desc) = &req.description {
        config["description"] = serde_yaml::Value::String(desc.clone());
        // Also update in spec if it exists there
        if let Some(spec) = config.get_mut("spec").and_then(|s| s.as_mapping_mut()) {
            spec.insert("description".into(), serde_yaml::Value::String(desc.clone()));
        }
    }
    if let Some(stages) = &req.stages {
        if let Ok(yaml_val) = serde_yaml::from_str::<serde_yaml::Value>(&serde_json::to_string(stages).unwrap_or_default()) {
            if let Some(spec) = config.get_mut("spec").and_then(|s| s.as_mapping_mut()) {
                spec.insert("stages".into(), yaml_val);
            }
        }
    }
    if let Some(exec_cfg) = &req.execution {
        if let Ok(yaml_val) = serde_yaml::from_str::<serde_yaml::Value>(&serde_json::to_string(exec_cfg).unwrap_or_default()) {
            if let Some(spec) = config.get_mut("spec").and_then(|s| s.as_mapping_mut()) {
                spec.insert("execution".into(), yaml_val);
            }
        }
    }
}

// ============================================================================
// CRUD Handlers
// ============================================================================

/// List all workflows
pub async fn list(state: Arc<AppState>) -> Result<Json<serde_json::Value>, CrudError> {
    let nodes = state.list_by_type_str("workflow").map_err(internal_error)?;
    let items: Vec<_> = nodes.iter().map(|n| {
        serde_json::json!({
            "id": n.id,
            "name": n.name,
            "namespace": n.namespace,
            "scope": n.scope,
            "checksum": n.checksum,
            "created_at": n.created_at.to_rfc3339(),
            "updated_at": n.updated_at.to_rfc3339(),
        })
    }).collect();
    Ok(Json(list_response(items, "workflows")))
}

/// Get a workflow by ARN
pub async fn get(state: Arc<AppState>, arn: &str) -> Result<Json<serde_json::Value>, CrudError> {
    let arn = validate_arn(arn)?;
    match state.get_node_by_arn(&arn).map_err(internal_error)? {
        Some(node) => Ok(Json(node_to_response(&node))),
        None => Err(not_found("Workflow", &arn)),
    }
}

/// Create a workflow
pub async fn create(
    state: Arc<AppState>,
    req: CreateWorkflowRequest,
) -> Result<(StatusCode, Json<serde_json::Value>), CrudError> {
    let arn = build_arn(&req.scope, &req.name);
    let config_yaml = build_workflow_config(&req).map_err(internal_error)?;

    let mut node = Node::new(
        arn.clone(),
        registry::domain::NodeType::Workflow,
        req.name.clone(),
        req.scope.clone(),
        format!("{}/workflow", req.scope),
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

/// Update a workflow
pub async fn update(
    state: Arc<AppState>,
    arn: &str,
    req: UpdateWorkflowRequest,
) -> Result<Json<serde_json::Value>, CrudError> {
    let arn = validate_arn(arn)?;
    let existing = state.get_node_by_arn(&arn).map_err(internal_error)?.ok_or_else(|| not_found("Workflow", &arn))?;

    let mut config: serde_yaml::Value = existing
        .config_json
        .as_ref()
        .and_then(|c| serde_yaml::from_str(c).ok())
        .unwrap_or_else(|| serde_yaml::Value::Mapping(Default::default()));

    apply_workflow_update(&mut config, &req);

    let config_yaml = serde_yaml::to_string(&config).map_err(internal_error)?;

    let mut updated = Node::new(
        arn.clone(),
        registry::domain::NodeType::Workflow,
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

/// Delete a workflow
pub async fn delete(state: Arc<AppState>, arn: &str) -> Result<StatusCode, CrudError> {
    let arn = validate_arn(arn)?;
    let deleted = state.delete_node_by_arn(&arn).map_err(internal_error)?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(not_found("Workflow", &arn))
    }
}