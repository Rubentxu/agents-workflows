//! MCP Request Handler
//!
//! Implements non-workflow MCP tools: agents, skills, prompts, artifacts,
//! insights, metrics, and impact analysis.
//!
//! # Observability Seam (D2 Architecture Decision)
//!
//! The canonical seam for execution facts is defined as follows:
//!
//! - **Insight** is the **source of truth** for execution facts. All structured
//!   events about what happened (workflow started/completed/failed, stage
//!   started/completed/failed/skipped, agent outputs, metrics) are logged as
//!   Insight records in SQLite via `insights_log`.
//!
//! - **Metrics** projects from Insights as the canonical source. The
//!   `metrics_query` endpoint derives execution state from Insights (via
//!   `AnalyticsService::execution_summary`) and the `ExecutionStore` only for
//!   real-time stage status (pending/running/completed). For historical
//!   analytics, always query `insights_aggregate`.
//!
//! - **SSE Streaming** (`MetricsBroadcaster` / `/metrics/sse`) broadcasts
//!   `MetricEvent` messages derived from Insights. IDE orchestrators subscribe
//!   to receive real-time updates as insights are logged.
//!
//! # Canonical Data Flow
//! ```text
//! Agent reports execution fact
//!         |
//!         v
//! insights_log (handler.rs) --> SQLite insights table
//!         |
//!         v
//! AnalyticsService.aggregate_* <-- insights_aggregate (reads from SQLite)
//!         |
//!         v
//! ExecutionInsightSummary (workflow_started/completed/failed,
//!                           completed_stages, total_duration_ms, etc.)
//!
//! Real-time SSE:
//! MetricEvent broadcast via MetricsBroadcaster whenever insights are logged
//! IDE subscribes to /metrics/sse --> receives events in real-time
//! ```
//!
//! # Design Rationale
//!
//! - Insight provides immutable, queryable history suitable for analytics
//! - Metrics provides real-time projection suitable for monitoring
//! - Both derive from the same source (Insight) ensuring consistency
//! - ExecutionStore is the operational store for execution control-plane
//!   (status, current_stage) but NOT the analytics source of truth

use crate::state::AppState;
use crate::types::*;
use crate::metrics_sse::MetricsBroadcaster;
use std::sync::Arc;
use registry::domain::Node;

/// MCP Handler - handles non-workflow tool calls
pub struct McpHandler {
    pub state: Arc<AppState>,
    pub _broadcaster: Arc<MetricsBroadcaster>,
}

impl McpHandler {
    pub fn new(state: Arc<AppState>, broadcaster: Arc<MetricsBroadcaster>) -> Self {
        Self { state, _broadcaster: broadcaster }
    }

    /// Extract description from metadata_json if available
    pub fn description_from_metadata(node: &Node) -> String {
        if let Some(metadata) = &node.metadata_json {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(metadata) {
                if let Some(desc) = json.get("description").and_then(|v| v.as_str()) {
                    return desc.to_string();
                }
            }
        }
        String::new()
    }

    pub fn derive_pending_stages(
        all_stages: Vec<String>,
        completed_stages: &[String],
        current_stage: Option<&String>,
    ) -> Vec<String> {
        all_stages
            .into_iter()
            .filter(|stage_id| {
                !completed_stages.contains(stage_id)
                    && current_stage.map(|current| current != stage_id).unwrap_or(true)
            })
            .collect()
    }

    // ============================================================================
    // Agent Tools
    // ============================================================================

    /// List all agents
    pub async fn agent_list(&self, _params: ListParams) -> Result<Vec<AgentSummary>, String> {
        let nodes = self.state.list_nodes(Some("agent")).await;
        let agents: Vec<AgentSummary> = nodes
            .into_iter()
            .map(|node| {
                let description = Self::description_from_metadata(&node);
                AgentSummary {
                    arn: node.id.clone(),
                    name: node.name,
                    description,
                    scope: node.scope,
                }
            })
            .collect();
        Ok(agents)
    }

    /// Get an agent by ARN
    #[allow(deprecated)]
    pub async fn agent_get(&self, params: GetByArnParams) -> Result<Agent, String> {
        let node = self.state.get_node(&params.arn).await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Agent not found: {}", params.arn))?;

        let description = Self::description_from_metadata(&node);
        let agent: Agent = match &node.config_json {
            Some(config) => serde_json::from_str(config)
                .map_err(|e| format!("Failed to parse agent: {}", e))?,
            None => Agent {
                arn: node.id.clone(),
                name: node.name,
                description,
                scope: node.scope,
                model: "gpt-4".to_string(),
                skills: vec![],
                tools: vec![],
            },
        };

        Ok(agent)
    }

    /// Query agents by search term
    pub async fn agent_query(&self, params: AgentQueryParams) -> Result<Vec<AgentSummary>, String> {
        let nodes = self.state.list_nodes(Some("agent")).await;
        let query_lower = params.query.to_lowercase();

        let agents: Vec<AgentSummary> = nodes
            .into_iter()
            .filter(|node| {
                node.name.to_lowercase().contains(&query_lower) ||
                Self::description_from_metadata(&node).to_lowercase().contains(&query_lower)
            })
            .map(|node| {
                let description = Self::description_from_metadata(&node);
                AgentSummary {
                    arn: node.id.clone(),
                    name: node.name,
                    description,
                    scope: node.scope,
                }
            })
            .collect();
        Ok(agents)
    }

    // ============================================================================
    // Skill Tools
    // ============================================================================

    /// List all skills
    pub async fn skill_list(&self, _params: ListParams) -> Result<Vec<SkillSummary>, String> {
        let nodes = self.state.list_nodes(Some("skill")).await;
        let skills: Vec<SkillSummary> = nodes
            .into_iter()
            .map(|node| {
                let description = Self::description_from_metadata(&node);
                SkillSummary {
                    arn: node.id.clone(),
                    name: node.name,
                    description,
                    scope: node.scope,
                }
            })
            .collect();
        Ok(skills)
    }

    /// Get a skill by ARN
    #[allow(deprecated)]
    pub async fn skill_get(&self, params: GetByArnParams) -> Result<Skill, String> {
        let node = self.state.get_node(&params.arn).await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Skill not found: {}", params.arn))?;

        let description = Self::description_from_metadata(&node);
        let skill: Skill = match &node.config_json {
            Some(config) => serde_json::from_str(config)
                .map_err(|e| format!("Failed to parse skill: {}", e))?,
            None => Skill {
                arn: node.id.clone(),
                name: node.name,
                description,
                scope: node.scope,
                content: String::new(),
                triggers: vec![],
            },
        };

        Ok(skill)
    }

    /// Query skills by search term
    pub async fn skill_query(&self, params: SkillQueryParams) -> Result<Vec<SkillSummary>, String> {
        let nodes = self.state.list_nodes(Some("skill")).await;
        let query_lower = params.query.to_lowercase();

        let skills: Vec<SkillSummary> = nodes
            .into_iter()
            .filter(|node| {
                node.name.to_lowercase().contains(&query_lower) ||
                Self::description_from_metadata(&node).to_lowercase().contains(&query_lower)
            })
            .map(|node| {
                let description = Self::description_from_metadata(&node);
                SkillSummary {
                    arn: node.id.clone(),
                    name: node.name,
                    description,
                    scope: node.scope,
                }
            })
            .collect();
        Ok(skills)
    }

    // ============================================================================
    // Prompt Tools
    // ============================================================================

    /// List all prompts
    pub async fn prompt_list(&self, _params: ListParams) -> Result<Vec<PromptSummary>, String> {
        let nodes = self.state.list_nodes(Some("prompt")).await;
        let prompts: Vec<PromptSummary> = nodes
            .into_iter()
            .map(|node| {
                let description = Self::description_from_metadata(&node);
                PromptSummary {
                    arn: node.id.clone(),
                    name: node.name,
                    description,
                    scope: node.scope,
                }
            })
            .collect();
        Ok(prompts)
    }

    /// Get a prompt by ARN
    #[allow(deprecated)]
    pub async fn prompt_get(&self, params: GetByArnParams) -> Result<Prompt, String> {
        let node = self.state.get_node(&params.arn).await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Prompt not found: {}", params.arn))?;

        let description = Self::description_from_metadata(&node);
        let prompt: Prompt = match &node.config_json {
            Some(config) => serde_json::from_str(config)
                .map_err(|e| format!("Failed to parse prompt: {}", e))?,
            None => Prompt {
                arn: node.id.clone(),
                name: node.name,
                description,
                scope: node.scope,
                content: String::new(),
            },
        };

        Ok(prompt)
    }

    // ============================================================================
    // Impact Analysis
    // ============================================================================

    /// Analyze the impact of an action on a resource.
    /// Returns dependents, recent executions, derived overrides, and affected workspaces.
    pub async fn analyze_impact(&self, params: AnalyzeImpactParams) -> Result<ImpactData, String> {
        let arn = &params.arn;
        let kind = &params.kind;

        // 1. Verify the target node exists
        let node = self.state.node_service().get(arn)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Resource not found: {}", arn))?;

        let resource_name = node.name.clone();
        let is_global = node.scope == "global";

        // 2. Query dependent resources (incoming edges — nodes that depend on this one)
        let conn = self.state.db().connection()
            .map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT from_id, relationship_type FROM edges WHERE to_id = ?1"
        ).map_err(|e| e.to_string())?;
        let edge_rows: Vec<(String, String)> = stmt.query_map([arn], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

        let mut dependents = Vec::new();
        let mut affected_workspaces_set = std::collections::HashSet::new();
        for (from_id, _rel_type) in edge_rows {
            // Look up the dependent node to get its name and kind
            if let Some(dep_node) = self.state.node_service().get(&from_id).ok().flatten() {
                let dep_kind = dep_node.node_type.as_str().to_string();
                dependents.push(ImpactItem {
                    id: from_id.clone(),
                    label: dep_node.name.clone(),
                    kind: dep_kind,
                    arn: from_id,
                });
                // Collect affected scopes
                if dep_node.scope != "global" {
                    affected_workspaces_set.insert(dep_node.scope.clone());
                }
            }
        }

        // 3. Recent executions of this workflow (if it's a workflow)
        let recent_executions = if kind == "workflow" {
            let mut exec_stmt = conn.prepare(
                "SELECT id, status, workspace_id, started_at FROM executions
                 WHERE workflow_id = ?1 ORDER BY created_at DESC LIMIT 10"
            ).map_err(|e| e.to_string())?;
            let rows: Vec<RecentExecution> = exec_stmt.query_map([arn], |row| {
                Ok(RecentExecution {
                    id: row.get::<_, String>(0)?,
                    status: row.get::<_, String>(1)?,
                    workspace_id: row.get::<_, String>(2)?,
                    timestamp: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                })
            }).map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
            for exec in &rows {
                affected_workspaces_set.insert(format!("workspace/{}", exec.workspace_id));
            }
            rows
        } else {
            Vec::new()
        };

        // 4. Derived overrides (workspace-scoped versions of this resource)
        let mut overrides_stmt = conn.prepare(
            "SELECT id, name, scope FROM nodes WHERE scope != 'global' AND scope != ?1"
        ).map_err(|e| e.to_string())?;
        let override_rows: Vec<(String, String, String)> = overrides_stmt.query_map([node.scope.clone()], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

        let derived_overrides: Vec<ImpactItem> = override_rows
            .into_iter()
            .filter(|(id, _, _)| {
                // Only include nodes that reference the global resource name
                id.contains(&resource_name) || id == arn
            })
            .map(|(id, name, _scope)| ImpactItem {
                id: id.clone(),
                label: name,
                kind: kind.clone(),
                arn: id,
            })
            .collect();

        // 5. Severity: global = high, others = medium
        let severity = if is_global { "high".to_string() } else { "medium".to_string() };

        // 6. Policy effects (simple static list for MVP)
        let mut policy_effects = Vec::new();
        if !dependents.is_empty() {
            policy_effects.push(format!("{} dependent resources will lose their dependency", dependents.len()));
        }
        if is_global {
            policy_effects.push("Global resource change affects all workspaces".to_string());
        }
        if !recent_executions.is_empty() {
            policy_effects.push("Recent workflow executions may be affected".to_string());
        }

        let affected_workspaces: Vec<String> = affected_workspaces_set.into_iter().collect();

        Ok(ImpactData {
            resource_arn: arn.clone(),
            resource_name,
            resource_kind: kind.clone(),
            severity,
            dependents,
            affected_workspaces,
            recent_executions,
            derived_overrides,
            policy_effects,
        })
    }
}

