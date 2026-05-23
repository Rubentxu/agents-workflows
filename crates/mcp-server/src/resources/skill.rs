//! Skill resource CRUD implementation
//!
//! Implements CRUD operations for the Skill resource type.

use std::sync::Arc;
use axum::{http::StatusCode, Json};
use registry::domain::Node;

use crate::rest::RestState;
use crate::rest_types::{CreateSkillRequest, UpdateSkillRequest};
use crate::resources::{
    CrudError, not_found, internal_error, list_response, node_to_response, validate_arn,
};

/// Build Skill ARN from scope and name
pub fn build_arn(scope: &str, name: &str) -> String {
    format!("arn:local:{}:skill/{}", scope, name)
}

/// Build Skill config YAML from request
pub fn build_skill_config(req: &CreateSkillRequest) -> Result<String, String> {
    let config = serde_json::json!({
        "apiVersion": "skills.local/v1",
        "kind": "Skill",
        "metadata": {
            "name": req.name,
            "scope": req.scope,
        },
        "spec": {
            "description": req.description,
            "content_path": req.content_path,
            "content": req.content,
            "triggers": req.triggers,
            "version": req.version,
            "author": req.author,
            "license": req.license,
            "references": req.references,
            "required_tools": req.required_tools,
        },
    });
    serde_yaml::to_string(&config).map_err(|e| e.to_string())
}

/// Apply update request to existing config YAML
pub fn apply_skill_update(
    config: &mut serde_yaml::Value,
    req: &UpdateSkillRequest,
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
    if let Some(ref v) = req.triggers {
        if let Ok(yaml_val) = serde_yaml::from_str::<serde_yaml::Value>(&serde_json::to_string(v).unwrap_or_default()) {
            spec.insert(serde_yaml::Value::String("triggers".to_string()), yaml_val);
        }
    }
    if let Some(v) = &req.version {
        spec.insert(serde_yaml::Value::String("version".to_string()), serde_yaml::Value::String(v.clone()));
    }
    if let Some(v) = &req.author {
        spec.insert(serde_yaml::Value::String("author".to_string()), serde_yaml::Value::String(v.clone()));
    }
    if let Some(v) = &req.license {
        spec.insert(serde_yaml::Value::String("license".to_string()), serde_yaml::Value::String(v.clone()));
    }
    if let Some(ref v) = req.references {
        if let Ok(yaml_val) = serde_yaml::from_str::<serde_yaml::Value>(&serde_json::to_string(v).unwrap_or_default()) {
            spec.insert(serde_yaml::Value::String("references".to_string()), yaml_val);
        }
    }
    if let Some(ref v) = req.required_tools {
        if let Ok(yaml_val) = serde_yaml::from_str::<serde_yaml::Value>(&serde_json::to_string(v).unwrap_or_default()) {
            spec.insert(serde_yaml::Value::String("required_tools".to_string()), yaml_val);
        }
    }
}

// ============================================================================
// CRUD Handlers
// ============================================================================

/// List all skills
pub async fn list(state: Arc<RestState>) -> Result<Json<serde_json::Value>, CrudError> {
    let nodes = state.list_by_type("skill").map_err(internal_error)?;
    let items: Vec<_> = nodes.iter().map(|n| {
        serde_json::json!({
            "id": n.id,
            "name": n.name,
            "namespace": n.namespace,
            "scope": n.scope,
            "created_at": n.created_at.to_rfc3339(),
        })
    }).collect();
    Ok(Json(list_response(items, "skills")))
}

/// Get a skill by ARN
pub async fn get(state: Arc<RestState>, arn: &str) -> Result<Json<serde_json::Value>, CrudError> {
    let arn = validate_arn(arn)?;
    match state.get_node(&arn).map_err(internal_error)? {
        Some(node) => Ok(Json(node_to_response(&node))),
        None => Err(not_found("Skill", &arn)),
    }
}

/// Create a skill
pub async fn create(
    state: Arc<RestState>,
    req: CreateSkillRequest,
) -> Result<(StatusCode, Json<serde_json::Value>), CrudError> {
    let arn = build_arn(&req.scope, &req.name);
    let config_yaml = build_skill_config(&req).map_err(internal_error)?;

    let mut node = Node::new(
        arn.clone(),
        registry::domain::NodeType::Skill,
        req.name.clone(),
        req.scope.clone(),
        format!("{}/skill", req.scope),
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

/// Update a skill
pub async fn update(
    state: Arc<RestState>,
    arn: &str,
    req: UpdateSkillRequest,
) -> Result<Json<serde_json::Value>, CrudError> {
    let arn = validate_arn(arn)?;
    let existing = state.get_node(&arn).map_err(internal_error)?.ok_or_else(|| not_found("Skill", &arn))?;

    let mut config: serde_yaml::Value = existing
        .config_json
        .as_ref()
        .and_then(|c| serde_yaml::from_str(c).ok())
        .unwrap_or_else(|| serde_yaml::Value::Mapping(Default::default()));

    apply_skill_update(&mut config, &req);

    let config_yaml = serde_yaml::to_string(&config).map_err(internal_error)?;

    let mut updated = Node::new(
        arn.clone(),
        registry::domain::NodeType::Skill,
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

/// Delete a skill
pub async fn delete(state: Arc<RestState>, arn: &str) -> Result<StatusCode, CrudError> {
    let arn = validate_arn(arn)?;
    let deleted = state.delete_node(&arn).map_err(internal_error)?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(not_found("Skill", &arn))
    }
}