//! REST API Handler Functions
//!
//! Implements HTTP handlers for all REST endpoints.

use axum::{
    body::Body,
    extract::{Path, State, Query},
    http::{StatusCode, header::CONTENT_TYPE},
    response::Response,
    Json,
};

use super::rest_types::*;
use super::rest::RestState;
use crate::types::ExecutionListParams;

// Helper to validate ARN path param
fn validate_arn(arn: &str) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
    // ARN format: arn:local:{scope}:{type}/{name}
    // We expect the full ARN from the path
    if arn.starts_with("arn:local:") {
        Ok(arn.to_string())
    } else {
        Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse::new("VALIDATION_ERROR", "Invalid ARN format")),
        ))
    }
}

// ============================================================================
// Workspace Handlers
// ============================================================================

pub async fn list_workspaces(
    State(state): State<RestState>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let conn = state.db().connection()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let mut stmt = conn.prepare(
        "SELECT id, name, description, created_at FROM workspaces ORDER BY created_at DESC"
    ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let rows = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?,
            "name": row.get::<_, String>(1)?,
            "description": row.get::<_, Option<String>>(2)?,
            "created_at": row.get::<_, String>(3)?,
        }))
    }).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let workspaces: Vec<_> = rows.filter_map(|r| r.ok()).collect();
    Ok(Json(serde_json::json!({ "workspaces": workspaces })))
}

pub async fn create_workspace(
    State(state): State<RestState>,
    Json(req): Json<CreateWorkspaceRequest>,
) -> Result<(StatusCode, Json<WorkspaceResponse>), (StatusCode, Json<ErrorResponse>)> {
    let conn = state.db().connection()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let id = req.id.clone().unwrap_or_else(|| format!("workspace-{}", uuid::Uuid::new_v4().to_string().replace("-", "")[..8].to_string()));
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO workspaces (id, name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, req.name, req.description, now, now],
    ).map_err(|e| {
        if e.to_string().contains("UNIQUE constraint failed") {
            (StatusCode::CONFLICT, Json(ErrorResponse::new("ALREADY_EXISTS", &format!("Workspace '{}' already exists", id))))
        } else {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string())))
        }
    })?;

    Ok((
        StatusCode::CREATED,
        Json(WorkspaceResponse {
            id: id.clone(),
            name: req.name,
            description: req.description,
            created_at: now.clone(),
            stats: None,
        }),
    ))
}

pub async fn get_workspace(
    State(state): State<RestState>,
    Path(id): Path<String>,
) -> Result<Json<WorkspaceResponse>, (StatusCode, Json<ErrorResponse>)> {
    let conn = state.db().connection()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let mut stmt = conn.prepare(
        "SELECT id, name, description, created_at FROM workspaces WHERE id = ?1"
    ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let row = stmt.query_row([&id], |row| {
        Ok(WorkspaceResponse {
            id: row.get::<_, String>(0)?,
            name: row.get::<_, String>(1)?,
            description: row.get::<_, Option<String>>(2)?,
            created_at: row.get::<_, String>(3)?,
            stats: None,
        })
    }).map_err(|e| {
        if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
            (StatusCode::NOT_FOUND, Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Workspace '{}' not found", id))))
        } else {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string())))
        }
    })?;

    Ok(Json(row))
}

pub async fn delete_workspace(
    State(state): State<RestState>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let conn = state.db().connection()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let deleted = conn.execute("DELETE FROM workspaces WHERE id = ?1", [&id])
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    if deleted == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Workspace '{}' not found", id))),
        ));
    }

    Ok(StatusCode::NO_CONTENT)
}

// ============================================================================
// Workflow Handlers
// ============================================================================

pub async fn list_workflows(
    State(state): State<RestState>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let nodes = state.list_by_type("workflow");
    let workflows: Vec<_> = nodes.into_iter().map(|n| serde_json::json!({
        "id": n.id,
        "name": n.name,
        "namespace": n.namespace,
        "scope": n.scope,
        "checksum": n.checksum,
        "created_at": n.created_at.to_rfc3339(),
        "updated_at": n.updated_at.to_rfc3339(),
    })).collect();
    Ok(Json(serde_json::json!({ "workflows": workflows })))
}

pub async fn create_workflow(
    State(state): State<RestState>,
    Json(req): Json<CreateWorkflowRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<ErrorResponse>)> {
    let arn = format!("arn:local:{}:workflow/{}", req.scope, req.name);
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
    let config_yaml = serde_yaml::to_string(&config).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string())))
    )?;
    let mut node = registry::domain::Node::new(
        arn.clone(),
        registry::domain::NodeType::Workflow,
        req.name.clone(),
        req.scope.clone(),
        format!("{}/workflow", req.scope),
    );
    node.config_json = Some(config_yaml);
    state.save_node(node).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e)))
    )?;
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

pub async fn get_workflow(
    State(state): State<RestState>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    match state.get_node(&arn) {
        Some(node) => {
            Ok(Json(serde_json::json!({
                "id": node.id,
                "name": node.name,
                "namespace": node.namespace,
                "scope": node.scope,
                "checksum": node.checksum,
                "config": node.config_json,
                "created_at": node.created_at.to_rfc3339(),
                "updated_at": node.updated_at.to_rfc3339(),
            })))
        }
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Workflow '{}' not found", arn))),
        ))
    }
}

pub async fn update_workflow(
    State(state): State<RestState>,
    Path(arn): Path<String>,
    Json(req): Json<UpdateWorkflowRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    let existing = state.get_node(&arn).ok_or_else(||
        (StatusCode::NOT_FOUND, Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Workflow '{}' not found", arn))))
    )?;
    // Re-parse existing config and merge updates
    // NOTE: config_json stores YAML (per CONTEXT.md), so we must use serde_yaml to parse it.
    // serde_json::from_str would silently fail on YAML-only syntax (e.g. "yes" vs "true").
    let mut config: serde_yaml::Value = existing.config_json
        .as_ref()
        .and_then(|c| serde_yaml::from_str(c).ok())
        .unwrap_or_else(|| serde_yaml::Value::Mapping(Default::default()));
    if let Some(desc) = req.description {
        // Update description at top-level of the YAML (per sdd-full.yaml template structure)
        config["description"] = serde_yaml::Value::String(desc);
    }
    if let Some(stages) = req.stages {
        // Convert stages Vec to serde_yaml::Value via JSON round-trip
        let stages_json = serde_json::to_value(stages).unwrap_or_default();
        let stages_yaml: serde_yaml::Value = serde_yaml::from_str(
            &serde_json::to_string(&stages_json).unwrap_or_default()
        ).unwrap_or_default();
        config["stages"] = stages_yaml;
    }
    if let Some(exec_cfg) = req.execution {
        let exec_json = serde_json::to_value(exec_cfg).unwrap_or_default();
        let exec_yaml: serde_yaml::Value = serde_yaml::from_str(
            &serde_json::to_string(&exec_json).unwrap_or_default()
        ).unwrap_or_default();
        config["execution"] = exec_yaml;
    }
    let config_yaml = serde_yaml::to_string(&config).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string())))
    )?;
    let mut updated = registry::domain::Node::new(
        arn.clone(),
        registry::domain::NodeType::Workflow,
        existing.name.clone(),
        existing.scope.clone(),
        existing.namespace.clone(),
    );
    updated.config_json = Some(config_yaml);
    updated.checksum = existing.checksum.clone();
    updated.created_at = existing.created_at;
    state.save_node(updated).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e)))
    )?;
    Ok(Json(serde_json::json!({ "arn": arn })))
}

pub async fn delete_workflow(
    State(state): State<RestState>,
    Path(arn): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    let deleted = state.delete_node(&arn).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e)))
    )?;
    if !deleted {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Workflow '{}' not found", arn))),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

// ============================================================================
// Agent Handlers
// ============================================================================

pub async fn list_agents(
    State(state): State<RestState>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let nodes = state.list_by_type("agent");
    let agents: Vec<_> = nodes.into_iter().map(|n| serde_json::json!({
        "id": n.id,
        "name": n.name,
        "namespace": n.namespace,
        "scope": n.scope,
        "created_at": n.created_at.to_rfc3339(),
    })).collect();
    Ok(Json(serde_json::json!({ "agents": agents })))
}

pub async fn create_agent(
    State(state): State<RestState>,
    Json(req): Json<CreateAgentRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<ErrorResponse>)> {
    let arn = format!("arn:local:{}:agent/{}", req.scope, req.name);
    let config = serde_json::json!({
        "apiVersion": "agents.local/v1",
        "kind": "Agent",
        "metadata": {
            "name": req.name,
            "scope": req.scope,
            "labels": {},
            "annotations": {},
        },
        "spec": {
            "description": req.description,
            "model": req.model,
            "skills": req.skills,
            "tools": req.tools,
        },
    });
    let config_yaml = serde_yaml::to_string(&config).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string())))
    )?;
    let mut node = registry::domain::Node::new(
        arn.clone(),
        registry::domain::NodeType::Agent,
        req.name.clone(),
        req.scope.clone(),
        format!("{}/agent", req.scope),
    );
    node.config_json = Some(config_yaml);
    state.save_node(node).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e)))
    )?;
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

pub async fn get_agent(
    State(state): State<RestState>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    match state.get_node(&arn) {
        Some(node) => {
            Ok(Json(serde_json::json!({
                "id": node.id,
                "name": node.name,
                "namespace": node.namespace,
                "scope": node.scope,
                "config": node.config_json,
                "created_at": node.created_at.to_rfc3339(),
                "updated_at": node.updated_at.to_rfc3339(),
            })))
        }
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Agent '{}' not found", arn))),
        )),
    }
}

pub async fn update_agent(
    State(state): State<RestState>,
    Path(arn): Path<String>,
    Json(req): Json<UpdateAgentRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    let existing = state.get_node(&arn).ok_or_else(||
        (StatusCode::NOT_FOUND, Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Agent '{}' not found", arn))))
    )?;
    let mut config: serde_yaml::Value = existing.config_json
        .as_ref()
        .and_then(|c| serde_yaml::from_str(c).ok())
        .unwrap_or_else(|| serde_yaml::Value::Mapping(Default::default()));
    if let Some(desc) = req.description {
        config["spec"]["description"] = serde_yaml::Value::String(desc);
    }
    if let Some(model) = req.model {
        config["spec"]["model"] = serde_yaml::Value::String(model);
    }
    if let Some(skills) = req.skills {
        let skills_yaml: serde_yaml::Value = serde_yaml::from_str(
            &serde_json::to_string(&serde_json::json!(skills)).unwrap_or_default()
        ).unwrap_or_default();
        config["spec"]["skills"] = skills_yaml;
    }
    if let Some(tools) = req.tools {
        let tools_yaml: serde_yaml::Value = serde_yaml::from_str(
            &serde_json::to_string(&serde_json::json!(tools)).unwrap_or_default()
        ).unwrap_or_default();
        config["spec"]["tools"] = tools_yaml;
    }
    let config_yaml = serde_yaml::to_string(&config).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string())))
    )?;
    let mut updated = registry::domain::Node::new(
        arn.clone(),
        registry::domain::NodeType::Agent,
        existing.name.clone(),
        existing.scope.clone(),
        existing.namespace.clone(),
    );
    updated.config_json = Some(config_yaml);
    updated.checksum = existing.checksum.clone();
    updated.created_at = existing.created_at;
    state.save_node(updated).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e)))
    )?;
    Ok(Json(serde_json::json!({ "arn": arn })))
}

pub async fn delete_agent(
    State(state): State<RestState>,
    Path(arn): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let deleted = state.delete_node(&arn).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e)))
    )?;
    if !deleted {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Agent '{}' not found", arn))),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

// ============================================================================
// Skill Handlers
// ============================================================================

pub async fn list_skills(
    State(state): State<RestState>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let nodes = state.list_by_type("skill");
    let skills: Vec<_> = nodes.into_iter().map(|n| serde_json::json!({
        "id": n.id,
        "name": n.name,
        "namespace": n.namespace,
        "scope": n.scope,
        "created_at": n.created_at.to_rfc3339(),
    })).collect();
    Ok(Json(serde_json::json!({ "skills": skills })))
}

 pub async fn create_skill(
    State(state): State<RestState>,
    Json(req): Json<CreateSkillRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<ErrorResponse>)> {
    let scope = &req.scope;
    let arn = format!("arn:local:{}:skill/{}", scope, req.name);
    let config = serde_json::json!({
        "apiVersion": "skills.local/v1",
        "kind": "Skill",
        "metadata": { "name": req.name, "scope": scope },
        "spec": {
            "description": req.description,
            "triggers": req.triggers,
            "content": req.content,
        },
    });
    let config_yaml = serde_yaml::to_string(&config).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string())))
    )?;
    let mut node = registry::domain::Node::new(
        arn.clone(),
        registry::domain::NodeType::Skill,
        req.name.clone(),
        scope.clone(),
        format!("{}/skill", scope),
    );
    node.config_json = Some(config_yaml);
    state.save_node(node).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e)))
    )?;
    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "arn": arn,
            "name": req.name,
            "scope": scope,
            "created_at": chrono::Utc::now().to_rfc3339()
        })),
    ))
}

pub async fn get_skill(
    State(state): State<RestState>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    match state.get_node(&arn) {
        Some(node) => {
            Ok(Json(serde_json::json!({
                "id": node.id,
                "name": node.name,
                "namespace": node.namespace,
                "scope": node.scope,
                "config": node.config_json,
                "created_at": node.created_at.to_rfc3339(),
                "updated_at": node.updated_at.to_rfc3339(),
            })))
        }
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Skill '{}' not found", arn))),
        ))
    }
}

pub async fn update_skill(
    State(state): State<RestState>,
    Path(arn): Path<String>,
    Json(req): Json<UpdateSkillRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    let existing = state.get_node(&arn).ok_or_else(||
        (StatusCode::NOT_FOUND, Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Skill '{}' not found", arn))))
    )?;
    let mut config: serde_yaml::Value = existing.config_json
        .as_ref()
        .and_then(|c| serde_yaml::from_str(c).ok())
        .unwrap_or_else(|| serde_yaml::Value::Mapping(Default::default()));
    if let Some(desc) = req.description {
        config["spec"]["description"] = serde_yaml::Value::String(desc);
    }
    if let Some(content) = req.content {
        config["spec"]["content"] = serde_yaml::Value::String(content);
    }
    if let Some(triggers) = req.triggers {
        let triggers_yaml: serde_yaml::Value = serde_yaml::from_str(
            &serde_json::to_string(&serde_json::json!(triggers)).unwrap_or_default()
        ).unwrap_or_default();
        config["spec"]["triggers"] = triggers_yaml;
    }
    let config_yaml = serde_yaml::to_string(&config).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string())))
    )?;
    let mut updated = registry::domain::Node::new(
        arn.clone(),
        registry::domain::NodeType::Skill,
        existing.name.clone(),
        existing.scope.clone(),
        existing.namespace.clone(),
    );
    updated.config_json = Some(config_yaml);
    updated.checksum = existing.checksum.clone();
    updated.created_at = existing.created_at;
    state.save_node(updated).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e)))
    )?;
    Ok(Json(serde_json::json!({ "arn": arn })))
}

pub async fn delete_skill(
    State(state): State<RestState>,
    Path(arn): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    let deleted = state.delete_node(&arn).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e)))
    )?;
    if !deleted {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Skill '{}' not found", arn))),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

// ============================================================================
// Prompt Handlers
// ============================================================================

pub async fn list_prompts(
    State(state): State<RestState>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let nodes = state.list_by_type("prompt");
    let prompts: Vec<_> = nodes.into_iter().map(|n| serde_json::json!({
        "id": n.id,
        "name": n.name,
        "namespace": n.namespace,
        "scope": n.scope,
        "created_at": n.created_at.to_rfc3339(),
    })).collect();
    Ok(Json(serde_json::json!({ "prompts": prompts })))
}

 pub async fn create_prompt(
    State(state): State<RestState>,
    Json(req): Json<CreatePromptRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<ErrorResponse>)> {
    let scope = &req.scope;
    let arn = format!("arn:local:{}:prompt/{}", scope, req.name);
    let config = serde_json::json!({
        "apiVersion": "prompts.local/v1",
        "kind": "Prompt",
        "metadata": { "name": req.name, "scope": scope },
        "spec": {
            "description": req.description,
            "content": req.content,
        },
    });
    let config_yaml = serde_yaml::to_string(&config).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string())))
    )?;
    let mut node = registry::domain::Node::new(
        arn.clone(),
        registry::domain::NodeType::Prompt,
        req.name.clone(),
        scope.clone(),
        format!("{}/prompt", scope),
    );
    node.config_json = Some(config_yaml);
    state.save_node(node).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e)))
    )?;
    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "arn": arn,
            "name": req.name,
            "created_at": chrono::Utc::now().to_rfc3339()
        })),
    ))
}

pub async fn get_prompt(
    State(state): State<RestState>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    match state.get_node(&arn) {
        Some(node) => {
            Ok(Json(serde_json::json!({
                "id": node.id,
                "name": node.name,
                "namespace": node.namespace,
                "scope": node.scope,
                "config": node.config_json,
                "created_at": node.created_at.to_rfc3339(),
                "updated_at": node.updated_at.to_rfc3339(),
            })))
        }
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Prompt '{}' not found", arn))),
        ))
    }
}

pub async fn update_prompt(
    State(state): State<RestState>,
    Path(arn): Path<String>,
    Json(req): Json<UpdatePromptRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    let existing = state.get_node(&arn).ok_or_else(|| 
        (StatusCode::NOT_FOUND, Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Prompt '{}' not found", arn))))
    )?;
    let mut config: serde_yaml::Value = existing.config_json
        .as_ref()
        .and_then(|c| serde_yaml::from_str(c).ok())
        .unwrap_or_else(|| serde_yaml::Value::Mapping(Default::default()));
    if let Some(desc) = req.description {
        config["spec"]["description"] = serde_yaml::Value::String(desc);
    }
    if let Some(content) = req.content {
        config["spec"]["content"] = serde_yaml::Value::String(content);
    }
    let config_yaml = serde_yaml::to_string(&config).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string())))
    )?;
    let mut updated = registry::domain::Node::new(
        arn.clone(),
        registry::domain::NodeType::Prompt,
        existing.name.clone(),
        existing.scope.clone(),
        existing.namespace.clone(),
    );
    updated.config_json = Some(config_yaml);
    updated.checksum = existing.checksum.clone();
    updated.created_at = existing.created_at;
    state.save_node(updated).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e)))
    )?;
    Ok(Json(serde_json::json!({ "arn": arn })))
}

pub async fn delete_prompt(
    State(state): State<RestState>,
    Path(arn): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    let deleted = state.delete_node(&arn).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e)))
    )?;
    if !deleted {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Prompt '{}' not found", arn))),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

// ============================================================================
// Execution Handlers
// ============================================================================

pub async fn list_executions(
    State(state): State<RestState>,
    Query(query): Query<ExecutionListQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let params = ExecutionListParams {
        workspace_id: query.workspace_id,
        workflow_arn: query.workflow_arn,
        status: query.status,
        limit: query.limit.map(|l| l as usize).or(Some(50)),
    };
    let summaries = state.app_state.execution_store.list(&params)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    Ok(Json(serde_json::json!({ "executions": summaries })))
}

pub async fn get_execution(
    State(state): State<RestState>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    let execution = state.app_state.execution_store.get(&arn)
        .map_err(|e| {
            if e.contains("not found") {
                (StatusCode::NOT_FOUND, Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Execution '{}' not found", arn))))
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string())))
            }
        })?;

    Ok(Json(serde_json::json!({
        "arn": execution.arn,
        "workflow_arn": execution.workflow_arn,
        "workspace_id": execution.workspace_id,
        "status": execution.status,
        "current_stage": execution.current_stage,
        "completed_stages": execution.completed_stages,
        "pending_stages": Vec::<String>::new(),
        "stage_outputs": execution.stage_outputs,
        "triggered_by": execution.triggered_by,
        "started_at": execution.started_at,
        "completed_at": execution.completed_at,
    })))
}

pub async fn pause_execution(
    State(state): State<RestState>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    state.app_state.execution_store.pause(&arn)
        .map_err(|e| {
            if e.contains("not found") {
                (StatusCode::NOT_FOUND, Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Execution '{}' not found", arn))))
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string())))
            }
        })?;

    Ok(Json(serde_json::json!({
        "arn": arn,
        "status": "paused"
    })))
}

pub async fn resume_execution(
    State(state): State<RestState>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    state.app_state.execution_store.resume(&arn)
        .map_err(|e| {
            if e.contains("not found") {
                (StatusCode::NOT_FOUND, Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Execution '{}' not found", arn))))
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string())))
            }
        })?;

    Ok(Json(serde_json::json!({
        "arn": arn,
        "status": "running"
    })))
}

pub async fn abort_execution(
    State(state): State<RestState>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    let now = chrono::Utc::now().to_rfc3339();
    state.app_state.execution_store.abort(&arn, &now)
        .map_err(|e| {
            if e.contains("not found") {
                (StatusCode::NOT_FOUND, Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Execution '{}' not found", arn))))
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string())))
            }
        })?;

    // Cleanup filesystem artifacts for this execution
    if let Err(e) = state.app_state.artifact_service.cleanup_for_execution(&arn) {
        // Log the error but don't fail the request - execution was already aborted
        eprintln!("Warning: failed to cleanup artifacts for execution '{}': {}", arn, e);
    }

    Ok(Json(serde_json::json!({
        "arn": arn,
        "status": "aborted"
    })))
}

// ============================================================================
// Artifact Handlers
// ============================================================================

pub async fn list_artifacts(
    State(state): State<RestState>,
    Query(_query): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let artifacts = state.app_state.artifact_store.list(100)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;
    Ok(Json(serde_json::json!({ "artifacts": artifacts })))
}

pub async fn get_artifact(
    State(state): State<RestState>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    let artifact = state.app_state.artifact_store.get(&arn)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;
    match artifact {
        Some(data) => Ok(Json(data)),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Artifact '{}' not found", arn))),
        )),
    }
}

pub async fn delete_artifact(
    State(state): State<RestState>,
    Path(arn): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;

    // Get storage info for file cleanup
    let storage_info = state.app_state.artifact_store.get_storage_info(&arn)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let (storage_type, location) = match storage_info {
        Some(info) => info,
        None => return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Artifact '{}' not found", arn))),
        )),
    };

    // Delete from DB
    let deleted = state.app_state.artifact_store.delete(&arn)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    if !deleted {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Artifact '{}' not found", arn))),
        ));
    }

    // If it's a file-based artifact, delete the file too
    if storage_type == "filesystem" {
        let path = std::path::Path::new(&location);
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn download_artifact(
    State(state): State<RestState>,
    Path(arn): Path<String>,
) -> Result<Response<Body>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;

    let download_info = state.app_state.artifact_store.get_download_info(&arn)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let (storage_type, location, content_type, name) = match download_info {
        Some(info) => info,
        None => return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Artifact '{}' not found", arn))),
        )),
    };

    let body_bytes = if storage_type == "filesystem" {
        std::fs::read(&location).unwrap_or_default()
    } else {
        location.into_bytes()
    };

    let mut response = Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, content_type.as_str());

    if let Some(n) = name {
        response = response.header("Content-Disposition", format!("attachment; filename=\"{}\"", n));
    }

    Ok(response.body(Body::from(body_bytes)).unwrap())
}

// ============================================================================
// Insights Handler
// ============================================================================

pub async fn query_insights(
    State(state): State<RestState>,
    Query(query): Query<InsightsQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let conn = state.db().connection()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let mut sql = String::from(
        "SELECT id, execution_id, stage_id, insight_type, data_json, created_at FROM insights WHERE 1=1"
    );
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref exec_arn) = query.execution_arn {
        sql.push_str(" AND execution_id = ?");
        params.push(Box::new(exec_arn.clone()));
    }
    if let Some(ref stage_id) = query.stage_id {
        sql.push_str(" AND stage_id = ?");
        params.push(Box::new(stage_id.clone()));
    }
    if let Some(ref insight_type) = query.insight_type {
        sql.push_str(" AND insight_type = ?");
        params.push(Box::new(insight_type.clone()));
    }

    sql.push_str(" ORDER BY created_at DESC LIMIT 100");

    let mut stmt = conn.prepare(&sql)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "execution_id": row.get::<_, String>(1)?,
            "stage_id": row.get::<_, Option<String>>(2)?,
            "insight_type": row.get::<_, String>(3)?,
            "data": row.get::<_, String>(4)?,
            "created_at": row.get::<_, String>(5)?,
        }))
    }).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let insights: Vec<_> = rows.filter_map(|r| r.ok()).collect();
    Ok(Json(serde_json::json!({ "insights": insights })))
}

// ============================================================================
// Alerts Handler
// ============================================================================

pub async fn list_alerts(
    State(state): State<RestState>,
    Query(query): Query<AlertListQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let conn = state.db().connection()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let limit = query.limit.unwrap_or(100);
    let mut sql = String::from(
        "SELECT id, message, severity, state, source, workspace_id, created_at, updated_at FROM alerts WHERE 1=1"
    );
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref state) = query.state {
        sql.push_str(" AND state = ?");
        params.push(Box::new(state.clone()));
    }
    if let Some(ref severity) = query.severity {
        sql.push_str(" AND severity = ?");
        params.push(Box::new(severity.clone()));
    }

    sql.push_str(&format!(" ORDER BY created_at DESC LIMIT {}", limit));

    let mut stmt = conn.prepare(&sql)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "message": row.get::<_, String>(1)?,
            "severity": row.get::<_, String>(2)?,
            "state": row.get::<_, String>(3)?,
            "source": row.get::<_, Option<String>>(4)?,
            "workspace_id": row.get::<_, Option<String>>(5)?,
            "created_at": row.get::<_, String>(6)?,
            "updated_at": row.get::<_, Option<String>>(7)?,
        }))
    }).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let alerts: Vec<_> = rows.filter_map(|r| r.ok()).collect();
    Ok(Json(serde_json::json!({ "alerts": alerts })))
}

pub async fn create_alert(
    State(state): State<RestState>,
    Json(req): Json<CreateAlertRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<ErrorResponse>)> {
    let conn = state.db().connection()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO alerts (message, severity, state, source, workspace_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![req.message, req.severity, "open", req.source, req.workspace_id, now, now],
    ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let id = conn.last_insert_rowid();
    Ok((StatusCode::CREATED, Json(serde_json::json!({
        "id": id,
        "message": req.message,
        "severity": req.severity,
        "state": "open",
        "created_at": now,
    }))))
}

pub async fn update_alert(
    State(state): State<RestState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateAlertRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let conn = state.db().connection()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    if let Some(state) = req.state {
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE alerts SET state = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![state, now, id],
        ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;
    }

    Ok(Json(serde_json::json!({ "id": id })))
}

// ============================================================================
// Metrics Handler
// ============================================================================

pub async fn get_metrics(
    State(state): State<RestState>,
    Query(query): Query<MetricsQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let exec_arn = match query.execution_arn {
        Some(arn) => arn,
        None => return Ok(Json(serde_json::json!({
            "metrics": [],
            "total_tokens": 0,
            "total_duration_ms": 0
        }))),
    };

    let execution = state.app_state.execution_store.get(&exec_arn)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let mut metrics = Vec::new();
    for stage_id in &execution.completed_stages {
        metrics.push(serde_json::json!({
            "stage_id": stage_id,
            "status": "completed",
        }));
    }
    if let Some(current) = &execution.current_stage {
        metrics.push(serde_json::json!({
            "stage_id": current,
            "status": "running",
        }));
    }

    let total_duration_ms = if let (Some(start), Some(end)) = (&execution.started_at, &execution.completed_at) {
        let start_dt = chrono::DateTime::parse_from_rfc3339(start);
        let end_dt = chrono::DateTime::parse_from_rfc3339(end);
        if let (Ok(s), Ok(e)) = (start_dt, end_dt) {
            (e - s).num_milliseconds()
        } else {
            0
        }
    } else {
        0
    };

    Ok(Json(serde_json::json!({
        "execution_arn": exec_arn,
        "metrics": metrics,
        "total_tokens": 0,
        "total_duration_ms": total_duration_ms
    })))
}

// ============================================================================
// Config Handlers
// ============================================================================

pub async fn get_config() -> Result<Json<ConfigResponse>, (StatusCode, Json<ErrorResponse>)> {
    Ok(Json(ConfigResponse {
        default_workflow: "arn:local:global:workflow/sdd-full".to_string(),
        max_concurrent_executions: 10,
        artifact_size_threshold_bytes: 1048576,
    }))
}

pub async fn update_config(
    Json(req): Json<UpdateConfigRequest>,
) -> Result<Json<ConfigResponse>, (StatusCode, Json<ErrorResponse>)> {
    Ok(Json(ConfigResponse {
        default_workflow: req.default_workflow.unwrap_or_else(|| "arn:local:global:workflow/sdd-full".to_string()),
        max_concurrent_executions: req.max_concurrent_executions.unwrap_or(10),
        artifact_size_threshold_bytes: 1048576,
    }))
}
