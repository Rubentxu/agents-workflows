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
use crate::state::AppState;
use std::sync::Arc;
use crate::types::ExecutionListParams;
use crate::resources::agent;
use crate::resources::skill;
use crate::resources::prompt;
use crate::resources::tool;
use crate::resources::template;
use crate::resources::workflow;

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
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let workspaces = state.workspace_store().list()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let workspaces_json: Vec<_> = workspaces.iter().map(|w| {
        serde_json::json!({
            "id": w.id,
            "name": w.name,
            "description": w.description,
            "created_at": w.created_at,
        })
    }).collect();

    Ok(Json(serde_json::json!({ "workspaces": workspaces_json })))
}

pub async fn create_workspace(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateWorkspaceRequest>,
) -> Result<(StatusCode, Json<WorkspaceResponse>), (StatusCode, Json<ErrorResponse>)> {
    use registry::domain::Workspace;

    let id = req.id.clone().unwrap_or_else(|| format!("workspace-{}", uuid::Uuid::new_v4().to_string().replace("-", "")[..8].to_string()));

    let workspace = Workspace::new(id.clone(), req.name.clone(), req.description.clone());

    if let Err(e) = state.workspace_store().create(&workspace) {
        let msg = e.to_string();
        if msg.contains("already exists") {
            return Err((
                StatusCode::CONFLICT,
                Json(ErrorResponse::new("ALREADY_EXISTS", &format!("Workspace '{}' already exists", id))),
            ));
        }
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse::new("INTERNAL_ERROR", &msg)),
        ));
    }

    Ok((
        StatusCode::CREATED,
        Json(WorkspaceResponse {
            id: id.clone(),
            name: req.name,
            description: req.description,
            created_at: workspace.created_at.clone(),
            stats: None,
        }),
    ))
}

pub async fn get_workspace(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<WorkspaceResponse>, (StatusCode, Json<ErrorResponse>)> {
    let workspace = state.workspace_store().get(&id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Workspace '{}' not found", id))),
            )
        })?;

    Ok(Json(WorkspaceResponse {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        created_at: workspace.created_at,
        stats: None,
    }))
}

pub async fn delete_workspace(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    state.workspace_store().delete(&id)
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("not found") {
                (StatusCode::NOT_FOUND, Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Workspace '{}' not found", id))))
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &msg)))
            }
        })?;

    Ok(StatusCode::NO_CONTENT)
}

// ============================================================================
// Workflow Handlers (delegated to resources::workflow)
// ============================================================================

pub async fn list_workflows(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    workflow::list(state).await
}

pub async fn create_workflow(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateWorkflowRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<ErrorResponse>)> {
    workflow::create(state, req).await
}

pub async fn get_workflow(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    workflow::get(state, &arn).await
}

pub async fn update_workflow(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
    Json(req): Json<UpdateWorkflowRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    workflow::update(state, &arn, req).await
}

pub async fn delete_workflow(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    workflow::delete(state, &arn).await
}

// ============================================================================
// Agent Handlers (delegated to resources::agent)
// ============================================================================

pub async fn list_agents(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    agent::list(state).await
}

pub async fn create_agent(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateAgentRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<ErrorResponse>)> {
    agent::create(state, req).await
}

pub async fn get_agent(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    agent::get(state, &arn).await
}

pub async fn update_agent(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
    Json(req): Json<UpdateAgentRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    agent::update(state, &arn, req).await
}

pub async fn delete_agent(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    agent::delete(state, &arn).await
}

// ============================================================================
// Skill Handlers
// ============================================================================

// ============================================================================
// Skill Handlers (delegated to resources::skill)
// ============================================================================

pub async fn list_skills(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    skill::list(state).await
}

pub async fn create_skill(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateSkillRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<ErrorResponse>)> {
    skill::create(state, req).await
}

pub async fn get_skill(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    skill::get(state, &arn).await
}

pub async fn update_skill(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
    Json(req): Json<UpdateSkillRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    skill::update(state, &arn, req).await
}

pub async fn delete_skill(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    skill::delete(state, &arn).await
}

// ============================================================================
// Prompt Handlers (delegated to resources::prompt)
// ============================================================================

pub async fn list_prompts(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    prompt::list(state).await
}

pub async fn create_prompt(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreatePromptRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<ErrorResponse>)> {
    prompt::create(state, req).await
}

pub async fn get_prompt(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    prompt::get(state, &arn).await
}

pub async fn update_prompt(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
    Json(req): Json<UpdatePromptRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    prompt::update(state, &arn, req).await
}

pub async fn delete_prompt(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    prompt::delete(state, &arn).await
}

// ============================================================================
// Execution Handlers
// ============================================================================

pub async fn list_executions(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ExecutionListQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let params = ExecutionListParams {
        workspace_id: query.workspace_id,
        workflow_arn: query.workflow_arn,
        status: query.status,
        limit: query.limit.map(|l| l as usize).or(Some(50)),
    };
    let summaries = state.execution_store().list(&params)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    Ok(Json(serde_json::json!({ "executions": summaries })))
}

pub async fn get_execution(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    let execution = state.execution_store().get(&arn)
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
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    state.execution_store().pause(&arn)
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
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    state.execution_store().resume(&arn)
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
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    let now = chrono::Utc::now().to_rfc3339();
    state.execution_store().abort(&arn, &now)
        .map_err(|e| {
            if e.contains("not found") {
                (StatusCode::NOT_FOUND, Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Execution '{}' not found", arn))))
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string())))
            }
        })?;

    // Cleanup filesystem artifacts for this execution
    if let Err(e) = state.artifact_service().cleanup_for_execution(&arn) {
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
    State(state): State<Arc<AppState>>,
    Query(_query): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let artifacts = state.artifact_store().list(100)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;
    Ok(Json(serde_json::json!({ "artifacts": artifacts })))
}

pub async fn get_artifact(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;
    let artifact = state.artifact_store().get(&arn)
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
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;

    // Get storage info for file cleanup
    let storage_info = state.artifact_store().get_storage_info(&arn)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let (storage_type, location) = match storage_info {
        Some(info) => info,
        None => return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Artifact '{}' not found", arn))),
        )),
    };

    // Delete from DB
    let deleted = state.artifact_store().delete(&arn)
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
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<Response<Body>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;

    let download_info = state.artifact_store().get_download_info(&arn)
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
    State(state): State<Arc<AppState>>,
    Query(query): Query<InsightsQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    use insights::domain::InsightsQuery as DomainInsightsQuery;

    let params = DomainInsightsQuery {
        execution_arn: query.execution_arn.clone(),
        stage_id: query.stage_id.clone(),
        insight_type: query.insight_type.clone(),
        from: query.from.clone(),
        to: query.to.clone(),
    };

    let insights = state.insights_store().query(&params)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let insights_json: Vec<_> = insights.iter().map(|i| {
        serde_json::json!({
            "id": i.id,
            "execution_id": i.execution_id,
            "stage_id": i.stage_id,
            "insight_type": i.insight_type.as_str(),
            "data": i.data,
            "created_at": i.created_at.to_rfc3339(),
        })
    }).collect();

    Ok(Json(serde_json::json!({ "insights": insights_json })))
}

// ============================================================================
// Alerts Handler
// ============================================================================

pub async fn list_alerts(
    State(state): State<Arc<AppState>>,
    Query(query): Query<AlertListQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    use metrics::domain::{AlertQuery as DomainAlertQuery, AlertState as DomainAlertState, AlertSeverity as DomainAlertSeverity};

    let domain_query = DomainAlertQuery {
        state: query.state.as_ref().and_then(|s| DomainAlertState::from_str(s)),
        severity: query.severity.as_ref().and_then(|s| DomainAlertSeverity::from_str(s)),
        workspace_id: None,
        limit: query.limit.map(|l| l as usize),
    };

    let alerts = state.alert_store().list(&domain_query)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    let alerts_json: Vec<_> = alerts.iter().map(|a| {
        serde_json::json!({
            "id": a.id,
            "message": a.message,
            "severity": a.severity.as_str(),
            "state": a.state.as_str(),
            "source": a.source,
            "workspace_id": a.workspace_id,
            "created_at": a.created_at.to_rfc3339(),
            "updated_at": a.updated_at.to_rfc3339(),
        })
    }).collect();

    Ok(Json(serde_json::json!({ "alerts": alerts_json })))
}

pub async fn create_alert(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateAlertRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<ErrorResponse>)> {
    use metrics::domain::Alert;

    let severity = metrics::domain::AlertSeverity::from_str(&req.severity)
        .unwrap_or(metrics::domain::AlertSeverity::Info);

    let alert = Alert::new(
        req.message.clone(),
        severity,
        req.source.clone(),
        req.workspace_id.clone(),
    );

    let id = state.alert_store().create(&alert)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({
        "id": id,
        "message": req.message,
        "severity": req.severity,
        "state": "open",
        "created_at": alert.created_at.to_rfc3339(),
    }))))
}

pub async fn update_alert(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateAlertRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    use metrics::domain::AlertState;

    // First get the existing alert
    let mut alert = state.alert_store().get(id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Alert {} not found", id))),
            )
        })?;

    // Update state if provided
    if let Some(state_str) = req.state {
        let new_state = AlertState::from_str(&state_str)
            .ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse::new("INVALID_STATE", &format!("Invalid alert state: {}", state_str))),
                )
            })?;
        alert.state = new_state;
        alert.updated_at = chrono::Utc::now();
    }

    state.alert_store().update(&alert)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string()))))?;

    Ok(Json(serde_json::json!({ "id": id })))
}

// ============================================================================
// Metrics Handler
// ============================================================================

pub async fn get_metrics(
    State(state): State<Arc<AppState>>,
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

    let execution = state.execution_store().get(&exec_arn)
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

// ============================================================================
// Template Handlers (delegated to resources::template)
// ============================================================================

pub async fn list_templates(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    template::list(state).await
}

pub async fn create_template(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateTemplateRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<ErrorResponse>)> {
    template::create(state, req).await
}

pub async fn get_template(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    template::get(state, &arn).await
}

pub async fn update_template(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
    Json(req): Json<UpdateTemplateRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    template::update(state, &arn, req).await
}

pub async fn delete_template(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    template::delete(state, &arn).await
}

// ============================================================================
// Tool Handlers (delegated to resources::tool)
// ============================================================================

pub async fn list_tools(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    tool::list(state).await
}

pub async fn create_tool(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateToolRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<ErrorResponse>)> {
    tool::create(state, req).await
}

pub async fn get_tool(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    tool::get(state, &arn).await
}

pub async fn update_tool(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
    Json(req): Json<UpdateToolRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    tool::update(state, &arn, req).await
}

pub async fn delete_tool(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    tool::delete(state, &arn).await
}

#[cfg(test)]
mod tests {
    use registry::domain::{Node, NodeType};
    use registry::application::node_service::NodeService;
    use registry::infrastructure::db::Database;
    use registry::infrastructure::node_repository::SqliteNodeRepository;
    use std::sync::Arc;

    /// Helper: create a node_service backed by an in-memory SQLite database
    fn make_node_service() -> Arc<NodeService> {
        let db = Arc::new(Database::open_in_memory().expect("open in-memory db"));
        let repo = Arc::new(SqliteNodeRepository::new(db));
        Arc::new(NodeService::new(repo))
    }

    // ── Template CRUD tests ────────────────────────────────────────────

    #[test]
    fn template_crud_full_cycle() {
        let svc = make_node_service();

        // CREATE
        let arn = "arn:local:global:template/my-template";
        let config = serde_json::json!({
            "apiVersion": "templates.local/v1",
            "kind": "Template",
            "metadata": { "name": "my-template", "scope": "global" },
            "spec": {
                "description": "Test template",
                "content_path": "templates/my-template.md",
                "format": "markdown",
                "target_kind": "prompt",
            },
        });
        let node = Node::new_global(arn.to_string(), NodeType::Template, "my-template".to_string())
            .with_config(config.clone());
        svc.create(node).expect("create template");

        // READ
        let fetched = svc.get(arn).expect("get").expect("should exist");
        assert_eq!(fetched.name, "my-template");
        assert_eq!(fetched.node_type, NodeType::Template);
        assert!(fetched.config_json.is_some());

        // Parse config back to verify roundtrip
        let parsed: serde_yaml::Value = serde_yaml::from_str(&fetched.config_json.unwrap()).unwrap();
        assert_eq!(parsed["spec"]["format"], "markdown");
        assert_eq!(parsed["spec"]["target_kind"], "prompt");

        // UPDATE
        let mut updated_config = config.clone();
        updated_config["spec"]["format"] = serde_json::json!("json");
        let mut updated_node = Node::new_global(arn.to_string(), NodeType::Template, "my-template".to_string())
            .with_config(updated_config.clone());
        updated_node.created_at = fetched.created_at;
        svc.update(updated_node).expect("update template");

        // Verify update
        let after_update = svc.get(arn).expect("get").expect("should exist");
        let parsed2: serde_yaml::Value = serde_yaml::from_str(&after_update.config_json.unwrap()).unwrap();
        assert_eq!(parsed2["spec"]["format"], "json");

        // DELETE
        svc.delete(arn).expect("delete");
        assert!(svc.get(arn).expect("get").is_none());
    }

    #[test]
    fn template_list_returns_only_templates() {
        let svc = make_node_service();

        // Create a template
        let template_arn = "arn:local:global:template/list-test";
        let node = Node::new_global(template_arn.to_string(), NodeType::Template, "list-test".to_string());
        svc.create(node).expect("create template");

        // Create a tool (different type)
        let tool_arn = "arn:local:global:tool/some-tool";
        let tool_node = Node::new_global(tool_arn.to_string(), NodeType::Tool, "some-tool".to_string());
        svc.create(tool_node).expect("create tool");

        // List templates only
        let templates = svc.list_by_type(NodeType::Template).expect("list templates");
        assert!(templates.iter().any(|n| n.id == template_arn));
        assert!(!templates.iter().any(|n| n.id == tool_arn));
    }

    // ── Tool CRUD tests ────────────────────────────────────────────────

    #[test]
    fn tool_crud_full_cycle() {
        let svc = make_node_service();

        // CREATE
        let arn = "arn:local:global:tool/my-tool";
        let config = serde_json::json!({
            "apiVersion": "tools.local/v1",
            "kind": "Tool",
            "metadata": { "name": "my-tool", "scope": "global" },
            "spec": {
                "description": "A custom tool",
                "source": "custom://my-tool",
                "source_type": "custom",
                "category": "quality",
                "tags": ["linter", "custom"],
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "File to lint" }
                    },
                    "required": ["path"]
                },
                "implementation_path": "tools/my-linter.sh",
                "runtime": "bash",
            },
        });
        let node = Node::new_global(arn.to_string(), NodeType::Tool, "my-tool".to_string())
            .with_config(config.clone());
        svc.create(node).expect("create tool");

        // READ
        let fetched = svc.get(arn).expect("get").expect("should exist");
        assert_eq!(fetched.name, "my-tool");
        assert_eq!(fetched.node_type, NodeType::Tool);

        // Parse config back to verify
        let parsed: serde_yaml::Value = serde_yaml::from_str(&fetched.config_json.unwrap()).unwrap();
        assert_eq!(parsed["spec"]["source_type"], "custom");
        assert_eq!(parsed["spec"]["category"], "quality");

        // UPDATE — change category and add tags
        let mut updated_config = config.clone();
        updated_config["spec"]["category"] = serde_json::json!("testing");
        let mut updated_node = Node::new_global(arn.to_string(), NodeType::Tool, "my-tool".to_string())
            .with_config(updated_config);
        updated_node.created_at = fetched.created_at;
        svc.update(updated_node).expect("update tool");

        // Verify
        let after = svc.get(arn).expect("get").expect("should exist");
        let parsed2: serde_yaml::Value = serde_yaml::from_str(&after.config_json.unwrap()).unwrap();
        assert_eq!(parsed2["spec"]["category"], "testing");

        // DELETE
        svc.delete(arn).expect("delete");
        assert!(svc.get(arn).expect("get").is_none());
    }

    #[test]
    fn tool_list_returns_only_tools() {
        let svc = make_node_service();

        // Create tools
        let tool1 = Node::new_global("arn:local:global:tool/tool-a".to_string(), NodeType::Tool, "tool-a".to_string());
        let tool2 = Node::new_global("arn:local:global:tool/tool-b".to_string(), NodeType::Tool, "tool-b".to_string());
        svc.create(tool1).expect("create tool-a");
        svc.create(tool2).expect("create tool-b");

        // Create an agent (different type)
        let agent = Node::new_global("arn:local:global:agent/agent-1".to_string(), NodeType::Agent, "agent-1".to_string());
        svc.create(agent).expect("create agent");

        let tools = svc.list_by_type(NodeType::Tool).expect("list tools");
        assert_eq!(tools.len(), 2);
        assert!(tools.iter().all(|n| n.node_type == NodeType::Tool));
    }

    #[test]
    fn tool_create_duplicate_arn_fails() {
        let svc = make_node_service();

        let arn = "arn:local:global:tool/duplicate";
        let node = Node::new_global(arn.to_string(), NodeType::Tool, "duplicate".to_string());
        svc.create(node).expect("first create");

        // Second create with same ARN should fail
        let node2 = Node::new_global(arn.to_string(), NodeType::Tool, "duplicate".to_string());
        assert!(svc.create(node2).is_err());
    }

    #[test]
    fn template_create_duplicate_arn_fails() {
        let svc = make_node_service();

        let arn = "arn:local:global:template/duplicate";
        let node = Node::new_global(arn.to_string(), NodeType::Template, "duplicate".to_string());
        svc.create(node).expect("first create");

        let node2 = Node::new_global(arn.to_string(), NodeType::Template, "duplicate".to_string());
        assert!(svc.create(node2).is_err());
    }

    #[test]
    fn tool_get_nonexistent_returns_none() {
        let svc = make_node_service();
        let result = svc.get("arn:local:global:tool/does-not-exist").expect("get");
        assert!(result.is_none());
    }

    #[test]
    fn template_delete_nonexistent_succeeds() {
        let svc = make_node_service();
        // Delete of non-existent node should not error (idempotent)
        svc.delete("arn:local:global:template/ghost").expect("delete should not error");
    }
}

// ============================================================================
// Schema Handlers (ADR-0016)
// ============================================================================

/// GET /schemas/:type - Returns JSON Schema for a resource type
pub async fn get_schema(
    Path(type_name): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let resource_type = match type_name.to_lowercase().as_str() {
        "workflow" => schema::SchemaType::Workflow,
        "agent" => schema::SchemaType::Agent,
        "skill" => schema::SchemaType::Skill,
        "prompt" => schema::SchemaType::Prompt,
        "tool" => schema::SchemaType::Tool,
        "template" => schema::SchemaType::Template,
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse::new(
                    "INVALID_SCHEMA_TYPE",
                    &format!("Unknown schema type: {}. Valid: workflow, agent, skill, prompt, tool, template", type_name),
                )),
            ))
        }
    };

    match schema::get_schema_for_type(resource_type) {
        Some(schema_json) => Ok(Json(schema_json)),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("SCHEMA_NOT_FOUND", &format!("Schema not found for type: {}", type_name))),
        ))
    }
}

/// GET /content/:arn - Returns raw file content for a resource
pub async fn get_content(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;

    // Look up the node to get the file path
    let node = state.get_node_by_arn(&arn)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e))))?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Resource '{}' not found", arn))),
            )
        })?;

    // Try to read the content from the file.
    // If the file doesn't exist yet (resource created via JSON REST API but no content file written),
    // fall back to config_json so the editor always has something to display.
    let content_path = state.get_content_path(&arn);
    let content = if let Some(path) = content_path {
        if path.exists() {
            std::fs::read_to_string(&path).unwrap_or_default()
        } else {
            node.config_json.as_ref().map(|c| c.as_str()).unwrap_or("").to_string()
        }
    } else {
        node.config_json.as_ref().map(|c| c.as_str()).unwrap_or("").to_string()
    };

    // For templates, derive content type from format field in frontmatter
    let content_type = if arn.contains("/template/") {
        get_template_content_type(&content)
    } else {
        get_content_type(&arn).to_string()
    };

    Ok((StatusCode::OK, Json(serde_json::json!({
        "arn": arn,
        "content": content,
        "content_type": content_type,
    }))))
}

/// PUT /content/:arn - Updates raw file content for a resource
pub async fn put_content(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
    Json(req): Json<UpdateContentRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;

    // Verify the resource exists
    let node = state.get_node_by_arn(&arn)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new("INTERNAL_ERROR", &e))))?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("Resource '{}' not found", arn))),
            )
        })?;

    // Run full validation before writing
    let resource_type = parse_resource_type_from_arn(&arn)?;
    let registry_view = RegistryViewAdapter { state: state.clone() };
    let validation_result = validation::validate_resource(&arn, resource_type, &req.content, &registry_view);

    if !validation_result.is_valid() {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(ErrorResponse::new(
                "VALIDATION_FAILED",
                &format!(
                    "Content validation failed: {}",
                    validation_result.diagnostics().first()
                        .map(|d| d.message.as_str())
                        .unwrap_or("Unknown validation error")
                ),
            )),
        ));
    }

    // Try to write the content to the file
    let content_path = state.get_content_path(&arn);
    if let Some(path) = content_path {
        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse::new("IO_ERROR", &e.to_string())),
                )
            })?;
        }
        std::fs::write(&path, &req.content).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse::new("IO_ERROR", &e.to_string())),
            )
        })?;
    }

    // Keep registry cache in sync with the on-disk content so MCP reads and reloads
    // reflect the latest saved version immediately.
    let mut updated = node.clone();
    updated.config_json = Some(req.content.clone());
    state.save_node(updated).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string())),
        )
    })?;

    Ok((StatusCode::OK, Json(serde_json::json!({
        "arn": arn,
        "message": "Content updated successfully",
    }))))
}

/// POST /validate/:arn - Validates resource content and returns diagnostics
pub async fn validate_resource(
    State(state): State<Arc<AppState>>,
    Path(arn): Path<String>,
    Json(req): Json<ValidateResourceRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let arn = validate_arn(&arn)?;

    // Determine resource type from ARN
    let resource_type = parse_resource_type_from_arn(&arn)?;

    // Create a registry view adapter
    let registry_view = RegistryViewAdapter { state: state.clone() };

    // Validate the content
    let result = validation::validate_resource(&arn, resource_type, &req.content, &registry_view);

    Ok(Json(serde_json::json!({
        "arn": arn,
        "valid": result.is_valid(),
        "diagnostics": result.diagnostics(),
        "summary": result.summary(),
    })))
}

// ============================================================================
// Helper Types and Functions
// ============================================================================

/// Adapter to implement validation::RegistryView for AppState
struct RegistryViewAdapter {
    state: std::sync::Arc<crate::state::AppState>,
}

impl validation::RegistryView for RegistryViewAdapter {
    fn node_exists(&self, arn: &str) -> bool {
        self.state.node_service().get(arn).ok().flatten().is_some()
    }

    fn get_node_name(&self, arn: &str) -> Option<String> {
        self.state.node_service().get(arn).ok().flatten().map(|n| n.name)
    }

    fn get_node_type(&self, arn: &str) -> Option<validation::ResourceType> {
        let node = self.state.node_service().get(arn).ok().flatten()?;
        match node.node_type.as_str() {
            "workflow" => Some(validation::ResourceType::Workflow),
            "agent" => Some(validation::ResourceType::Agent),
            "skill" => Some(validation::ResourceType::Skill),
            "prompt" => Some(validation::ResourceType::Prompt),
            "tool" => Some(validation::ResourceType::Tool),
            "template" => Some(validation::ResourceType::Template),
            _ => None,
        }
    }
}

fn parse_resource_type_from_arn(arn: &str) -> Result<validation::ResourceType, (StatusCode, Json<ErrorResponse>)> {
    // ARN format:
    //   arn:local:{scope}:{type}/{name}
    // Examples:
    //   arn:local:global:workflow/sdd-full
    //   arn:local:project/app:workflow/my-flow
    //   arn:local:workspace/abc123:agent/orchestrator
    //
    // The resource type is always in the last colon-delimited segment before '/'.
    let resource_segment = arn.rsplit(':').next().unwrap_or_default();
    let resource_type = resource_segment.split('/').next().unwrap_or_default();

    if resource_type.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse::new("INVALID_ARN", &format!("Invalid ARN format: {}", arn))),
        ));
    }

    match resource_type {
        "workflow" => Ok(validation::ResourceType::Workflow),
        "agent" => Ok(validation::ResourceType::Agent),
        "skill" => Ok(validation::ResourceType::Skill),
        "prompt" => Ok(validation::ResourceType::Prompt),
        "tool" => Ok(validation::ResourceType::Tool),
        "template" => Ok(validation::ResourceType::Template),
        _ => Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse::new("INVALID_RESOURCE_TYPE", &format!("Unknown resource type in ARN: {}", arn))),
        ))
    }
}

fn get_content_type(arn: &str) -> &'static str {
    if arn.contains("/skill/") {
        "text/markdown"
    } else if arn.contains("/prompt/") {
        "text/markdown"
    } else if arn.contains("/template/") {
        // Templates can have different formats based on their format field
        // Default to text/markdown but could be derived from content
        "text/markdown"
    } else {
        "text/yaml"
    }
}

/// Derive content type from template content's format field
fn get_template_content_type(content: &str) -> String {
    // Try to extract format from YAML frontmatter
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return "text/markdown".to_string();
    }
    let after_first_dash = &trimmed[3..];
    if let Some(end_idx) = after_first_dash.find("\n---") {
        let frontmatter = &after_first_dash[..end_idx];
        for line in frontmatter.lines() {
            if let Some(format) = line.strip_prefix("format:") {
                let format = format.trim();
                return match format {
                    "json" => "application/json".to_string(),
                    "yaml" | "yml" => "text/yaml".to_string(),
                    "xml" => "application/xml".to_string(),
                    "html" => "text/html".to_string(),
                    "markdown" | "md" => "text/markdown".to_string(),
                    _ => format!("text/{}", format),
                };
            }
        }
    }
    "text/markdown".to_string()
}

#[derive(serde::Deserialize)]
pub struct UpdateContentRequest {
    content: String,
}

#[derive(serde::Deserialize)]
pub struct ValidateResourceRequest {
    content: String,
}
