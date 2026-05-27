//! Workflow MCP Server
//!
//! MCP server implementation using Streamable HTTP transport.
//! Provides tools for workflow management, registry operations, and artifact handling.

use clap::Parser;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use std::net::SocketAddr;

use rmcp::{
    ServerHandler,
    model::{
        ServerCapabilities, ServerInfo, InitializeResult, Implementation,
        CallToolRequestParams, CallToolResult, ListToolsResult, Tool, JsonObject,
        PaginatedRequestParams, RawContent, RawResource, Resource, ListResourcesResult,
        Annotated, Content,
    },
    service::RequestContext,
    transport::streamable_http_server::{
        StreamableHttpService, StreamableHttpServerConfig,
        session::local::LocalSessionManager,
    },
};

use tokio::signal;
use tokio::net::TcpListener;
use tracing::info;
use tracing_subscriber::FmtSubscriber;
use axum::Router;
use tower_http::cors::{CorsLayer, Any};

mod state;
mod context;
mod metrics_sse;
mod handler;
mod workflow_handler;
mod artifact_handler;
mod insights_handler;
mod metrics_handler;
mod execution_store;
mod artifact_store;
mod execution_repository_adapter;
mod types;
mod rest;
mod rest_types;
mod rest_handlers;
mod studio;
mod bootstrap;
mod auth;
mod resources;
mod tool_schema;
mod workspace_store;
mod insights_store;
mod alert_store;

use state::AppState;
use metrics_sse::MetricsBroadcaster;
use handler::McpHandler;
use workflow_handler::WorkflowMcpHandler;
use artifact_handler::ArtifactMcpHandler;
use insights_handler::InsightsMcpHandler;
use metrics_handler::MetricsMcpHandler;
use types::*;
use rest::create_rest_router;
use bootstrap::BootstrapService;
use registry::domain::{Node, NodeType};
use tool_schema::{input_schema, InputField,
    output_schema_for_workflow_list, output_schema_for_workflow_get, output_schema_for_workflow_get_dag,
    output_schema_for_execution_list, output_schema_for_execution_get, output_schema_for_execution_history,
    output_schema_for_execution_state, output_schema_for_next_stage, output_schema_for_empty,
    output_schema_for_agent_list, output_schema_for_agent_get, output_schema_for_agent_query,
    output_schema_for_skill_list, output_schema_for_skill_get, output_schema_for_skill_query,
    output_schema_for_prompt_list, output_schema_for_prompt_get,
    output_schema_for_artifact_create, output_schema_for_artifact_get, output_schema_for_artifact_list,
    output_schema_for_insights_log, output_schema_for_insights_query, output_schema_for_insights_aggregate,
    output_schema_for_metrics_query, output_schema_for_metrics_subscribe,
    output_schema_for_analyze_impact,
    output_schema_for_list_nodes, output_schema_for_list_edges,
    output_schema_for_tool_search, output_schema_for_tool_inspect,
};

#[derive(Parser)]
#[command(name = "agents-workflows-server")]
#[command(about = "Agentic Workflow System MCP Server")]
enum Cli {
    /// Initialize the workspace with default resources
    Init {
        /// Git URL to load templates from
        #[arg(long)]
        template: Option<String>,
        /// Workspace root directory
        #[arg(long, default_value = "~/.workflows")]
        workspace: String,
    },
    /// Start the server
    Start {
        /// Workspace root directory
        #[arg(long, default_value = "~/.workflows")]
        workspace: String,
        /// Port for MCP server
        #[arg(long, default_value = "8080")]
        port: u16,
        /// Enable dev mode (proxy to vite)
        #[arg(long)]
        dev: bool,
    },
}

// ============================================================================
// Tool Constants
// ============================================================================

// Workflow Tools
const TOOL_WORKFLOW_LIST: &str = "workflow_list";
const TOOL_WORKFLOW_GET: &str = "workflow_get";
const TOOL_WORKFLOW_GET_DAG: &str = "workflow_get_dag";
const TOOL_WORKFLOW_EXECUTE: &str = "workflow_execute";
const TOOL_WORKFLOW_GET_STATE: &str = "workflow_get_state";
const TOOL_WORKFLOW_UPDATE_STATE: &str = "workflow_update_state";
const TOOL_WORKFLOW_GET_NEXT_STAGE: &str = "workflow_get_next_stage";
const TOOL_WORKFLOW_ABORT: &str = "workflow_abort";

// Agent Tools
const TOOL_AGENT_LIST: &str = "agent_list";
const TOOL_AGENT_GET: &str = "agent_get";
const TOOL_AGENT_QUERY: &str = "agent_query";

// Skill Tools
const TOOL_SKILL_LIST: &str = "skill_list";
const TOOL_SKILL_GET: &str = "skill_get";
const TOOL_SKILL_QUERY: &str = "skill_query";

// Prompt Tools
const TOOL_PROMPT_LIST: &str = "prompt_list";
const TOOL_PROMPT_GET: &str = "prompt_get";

// Execution Tools
const TOOL_EXECUTION_LIST: &str = "execution_list";
const TOOL_EXECUTION_GET: &str = "execution_get";
const TOOL_EXECUTION_HISTORY: &str = "execution_history";

// Artifact Tools
const TOOL_ARTIFACT_CREATE: &str = "artifact_create";
const TOOL_ARTIFACT_GET: &str = "artifact_get";
const TOOL_ARTIFACT_LIST: &str = "artifact_list";

// Insights Tools
const TOOL_INSIGHTS_LOG: &str = "insights_log";
const TOOL_INSIGHTS_QUERY: &str = "insights_query";
const TOOL_INSIGHTS_AGGREGATE: &str = "insights_aggregate";

// Metrics Tools
const TOOL_METRICS_QUERY: &str = "metrics_query";
const TOOL_METRICS_SUBSCRIBE: &str = "metrics_subscribe";

// Impact Analysis Tools
const TOOL_ANALYZE_IMPACT: &str = "analyze_impact";

// Registry Tools
const TOOL_LIST_NODES: &str = "list_nodes";
const TOOL_LIST_EDGES: &str = "list_edges";

// Meta-tools
const TOOL_TOOL_SEARCH: &str = "tool_search";
const TOOL_TOOL_INSPECT: &str = "tool_inspect";

// ============================================================================
// Schema Helpers
// ============================================================================

/// Create a text content
fn make_text_content(text: String) -> Content {
    Annotated::new(RawContent::text(text), None)
}

/// Create a resource from URI and description
fn make_resource(uri: &str, description: &str) -> Resource {
    Annotated::new(
        RawResource::new(uri, uri).with_description(description),
        None,
    )
}

// ============================================================================
// Server Implementation
// ============================================================================

#[derive(Clone)]
pub struct WorkflowServer {
    _state: Arc<AppState>,
    _broadcaster: Arc<MetricsBroadcaster>,
    mcp_handler: Arc<McpHandler>,
    workflow_handler: Arc<WorkflowMcpHandler>,
    artifact_handler: Arc<ArtifactMcpHandler>,
    insights_handler: Arc<InsightsMcpHandler>,
    metrics_handler: Arc<MetricsMcpHandler>,
}

impl WorkflowServer {
    pub fn new(state: Arc<AppState>, broadcaster: Arc<MetricsBroadcaster>) -> Self {
        let mcp_handler = Arc::new(McpHandler::new(state.clone(), broadcaster.clone()));
        let workflow_handler = Arc::new(WorkflowMcpHandler::new(
            state.clone(),
            broadcaster.clone(),
            mcp_handler.clone(),
        ));
        let artifact_handler = Arc::new(ArtifactMcpHandler::new(
            state.clone(),
            broadcaster.clone(),
        ));
        let insights_handler = Arc::new(InsightsMcpHandler::new(
            state.clone(),
            broadcaster.clone(),
        ));
        let metrics_handler = Arc::new(MetricsMcpHandler::new(
            state.clone(),
            broadcaster.clone(),
        ));
        Self {
            _state: state,
            _broadcaster: broadcaster,
            mcp_handler,
            workflow_handler,
            artifact_handler,
            insights_handler,
            metrics_handler,
        }
    }

    /// List all available tools
    fn list_tools_internal() -> ListToolsResult {
        let tools = vec![
            // ===================================================================
            // Workflow Tools
            // ===================================================================
            Tool::new(TOOL_WORKFLOW_LIST, "List all registered workflows",
                input_schema(&[], &[]))
                .with_raw_output_schema(Arc::new(output_schema_for_workflow_list())),

            Tool::new(TOOL_WORKFLOW_GET, "Get a workflow by ARN",
                input_schema(&[
                    InputField { name: "arn", description: "Workflow ARN", json_type: "string", example: serde_json::json!("arn:local:global:workflow/my-workflow") },
                ], &["arn"]))
                .with_raw_output_schema(Arc::new(output_schema_for_workflow_get())),

            Tool::new(TOOL_WORKFLOW_GET_DAG, "Get workflow DAG (parallel groups, dependencies)",
                input_schema(&[
                    InputField { name: "arn", description: "Workflow ARN", json_type: "string", example: serde_json::json!("arn:local:global:workflow/my-workflow") },
                ], &["arn"]))
                .with_raw_output_schema(Arc::new(output_schema_for_workflow_get_dag())),

            Tool::new(TOOL_WORKFLOW_EXECUTE, "Execute a workflow",
                input_schema(&[
                    InputField { name: "workflow_arn", description: "Workflow ARN to execute", json_type: "string", example: serde_json::json!("arn:local:global:workflow/my-workflow") },
                    InputField { name: "workspace_id", description: "Workspace ID", json_type: "string", example: serde_json::json!("workspace-1") },
                ], &["workflow_arn", "workspace_id"]))
                .with_raw_output_schema(Arc::new(output_schema_for_empty())),

            Tool::new(TOOL_WORKFLOW_GET_STATE, "Get current execution state",
                input_schema(&[
                    InputField { name: "execution_arn", description: "Execution ARN", json_type: "string", example: serde_json::json!("arn:local:global:execution/my-exec") },
                ], &["execution_arn"]))
                .with_raw_output_schema(Arc::new(output_schema_for_execution_state())),

            Tool::new(TOOL_WORKFLOW_UPDATE_STATE, "Update execution state",
                input_schema(&[
                    InputField { name: "execution_arn", description: "Execution ARN", json_type: "string", example: serde_json::json!("arn:local:global:execution/my-exec") },
                ], &["execution_arn"]))
                .with_raw_output_schema(Arc::new(output_schema_for_empty())),

            Tool::new(TOOL_WORKFLOW_GET_NEXT_STAGE, "Get next suggested stage",
                input_schema(&[
                    InputField { name: "execution_arn", description: "Execution ARN", json_type: "string", example: serde_json::json!("arn:local:global:execution/my-exec") },
                ], &["execution_arn"]))
                .with_raw_output_schema(Arc::new(output_schema_for_next_stage())),

            Tool::new(TOOL_WORKFLOW_ABORT, "Abort a workflow execution",
                input_schema(&[
                    InputField { name: "execution_arn", description: "Execution ARN", json_type: "string", example: serde_json::json!("arn:local:global:execution/my-exec") },
                ], &["execution_arn"]))
                .with_raw_output_schema(Arc::new(output_schema_for_empty())),

            // ===================================================================
            // Agent Tools
            // ===================================================================
            Tool::new(TOOL_AGENT_LIST, "List all agents",
                input_schema(&[], &[]))
                .with_raw_output_schema(Arc::new(output_schema_for_agent_list())),

            Tool::new(TOOL_AGENT_GET, "Get an agent by ARN",
                input_schema(&[
                    InputField { name: "arn", description: "Agent ARN", json_type: "string", example: serde_json::json!("arn:local:global:agent/orchestrator") },
                ], &["arn"]))
                .with_raw_output_schema(Arc::new(output_schema_for_agent_get())),

            Tool::new(TOOL_AGENT_QUERY, "Query agents by search term",
                input_schema(&[
                    InputField { name: "query", description: "Search query term", json_type: "string", example: serde_json::json!("orch") },
                ], &["query"]))
                .with_raw_output_schema(Arc::new(output_schema_for_agent_query())),

            // ===================================================================
            // Skill Tools
            // ===================================================================
            Tool::new(TOOL_SKILL_LIST, "List all skills",
                input_schema(&[], &[]))
                .with_raw_output_schema(Arc::new(output_schema_for_skill_list())),

            Tool::new(TOOL_SKILL_GET, "Get a skill by ARN",
                input_schema(&[
                    InputField { name: "arn", description: "Skill ARN", json_type: "string", example: serde_json::json!("arn:local:global:skill/sdd-apply") },
                ], &["arn"]))
                .with_raw_output_schema(Arc::new(output_schema_for_skill_get())),

            Tool::new(TOOL_SKILL_QUERY, "Query skills by search term",
                input_schema(&[
                    InputField { name: "query", description: "Search query term", json_type: "string", example: serde_json::json!("sdd") },
                ], &["query"]))
                .with_raw_output_schema(Arc::new(output_schema_for_skill_query())),

            // ===================================================================
            // Prompt Tools
            // ===================================================================
            Tool::new(TOOL_PROMPT_LIST, "List all prompts",
                input_schema(&[], &[]))
                .with_raw_output_schema(Arc::new(output_schema_for_prompt_list())),

            Tool::new(TOOL_PROMPT_GET, "Get a prompt by ARN",
                input_schema(&[
                    InputField { name: "arn", description: "Prompt ARN", json_type: "string", example: serde_json::json!("arn:local:global:prompt/sdd-orchestrator") },
                ], &["arn"]))
                .with_raw_output_schema(Arc::new(output_schema_for_prompt_get())),

            // ===================================================================
            // Execution Tools
            // ===================================================================
            Tool::new(TOOL_EXECUTION_LIST, "List executions",
                input_schema(&[], &[]))
                .with_raw_output_schema(Arc::new(output_schema_for_execution_list())),

            Tool::new(TOOL_EXECUTION_GET, "Get an execution by ARN",
                input_schema(&[
                    InputField { name: "arn", description: "Execution ARN", json_type: "string", example: serde_json::json!("arn:local:global:execution/my-exec") },
                ], &["arn"]))
                .with_raw_output_schema(Arc::new(output_schema_for_execution_get())),

            Tool::new(TOOL_EXECUTION_HISTORY, "Get execution history",
                input_schema(&[
                    InputField { name: "execution_arn", description: "Execution ARN", json_type: "string", example: serde_json::json!("arn:local:global:execution/my-exec") },
                ], &["execution_arn"]))
                .with_raw_output_schema(Arc::new(output_schema_for_execution_history())),

            // ===================================================================
            // Artifact Tools
            // ===================================================================
            Tool::new(TOOL_ARTIFACT_CREATE, "Create an artifact",
                input_schema(&[
                    InputField { name: "execution_arn", description: "Execution ARN", json_type: "string", example: serde_json::json!("arn:local:global:execution/my-exec") },
                    InputField { name: "name", description: "Artifact name", json_type: "string", example: serde_json::json!("report.md") },
                    InputField { name: "content", description: "Artifact content", json_type: "string", example: serde_json::json!("# Report\n\nContent here") },
                    InputField { name: "content_type", description: "MIME content type", json_type: "string", example: serde_json::json!("text/markdown") },
                ], &["execution_arn", "name", "content", "content_type"]))
                .with_raw_output_schema(Arc::new(output_schema_for_artifact_create())),

            Tool::new(TOOL_ARTIFACT_GET, "Get an artifact by ARN",
                input_schema(&[
                    InputField { name: "arn", description: "Artifact ARN", json_type: "string", example: serde_json::json!("arn:local:global:artifact/my-artifact") },
                ], &["arn"]))
                .with_raw_output_schema(Arc::new(output_schema_for_artifact_get())),

            Tool::new(TOOL_ARTIFACT_LIST, "List artifacts",
                input_schema(&[], &[]))
                .with_raw_output_schema(Arc::new(output_schema_for_artifact_list())),

            // ===================================================================
            // Insights Tools
            // ===================================================================
            Tool::new(TOOL_INSIGHTS_LOG, "Log an insight event",
                input_schema(&[
                    InputField { name: "execution_arn", description: "Execution ARN", json_type: "string", example: serde_json::json!("arn:local:global:execution/my-exec") },
                    InputField { name: "insight_type", description: "Type of insight", json_type: "string", example: serde_json::json!("token_usage") },
                    InputField { name: "data", description: "Insight data as JSON object", json_type: "object", example: serde_json::json!({"tokens": 1500}) },
                ], &["execution_arn", "insight_type", "data"]))
                .with_raw_output_schema(Arc::new(output_schema_for_insights_log())),

            Tool::new(TOOL_INSIGHTS_QUERY, "Query insights",
                input_schema(&[], &[]))
                .with_raw_output_schema(Arc::new(output_schema_for_insights_query())),

            Tool::new(TOOL_INSIGHTS_AGGREGATE, "Aggregate insights for analytics",
                input_schema(&[
                    InputField { name: "execution_arn", description: "Execution ARN", json_type: "string", example: serde_json::json!("arn:local:global:execution/my-exec") },
                    InputField { name: "stage_id", description: "Stage ID (optional)", json_type: "string", example: serde_json::json!("explore") },
                ], &["execution_arn", "stage_id"]))
                .with_raw_output_schema(Arc::new(output_schema_for_insights_aggregate())),

            // ===================================================================
            // Metrics Tools
            // ===================================================================
            Tool::new(TOOL_METRICS_QUERY, "Query execution metrics",
                input_schema(&[
                    InputField { name: "execution_arn", description: "Execution ARN", json_type: "string", example: serde_json::json!("arn:local:global:execution/my-exec") },
                ], &["execution_arn"]))
                .with_raw_output_schema(Arc::new(output_schema_for_metrics_query())),

            Tool::new(TOOL_METRICS_SUBSCRIBE, "Get SSE URL for metrics subscription",
                input_schema(&[], &[]))
                .with_raw_output_schema(Arc::new(output_schema_for_metrics_subscribe())),

            // ===================================================================
            // Impact Analysis Tools
            // ===================================================================
            Tool::new(TOOL_ANALYZE_IMPACT, "Analyze the impact of an action on a resource",
                input_schema(&[
                    InputField { name: "arn", description: "Resource ARN to analyze", json_type: "string", example: serde_json::json!("arn:local:global:workflow/my-workflow") },
                    InputField { name: "kind", description: "Resource kind (workflow, agent, skill)", json_type: "string", example: serde_json::json!("workflow") },
                ], &["arn", "kind"]))
                .with_raw_output_schema(Arc::new(output_schema_for_analyze_impact())),

            // ===================================================================
            // Registry Tools
            // ===================================================================
            Tool::new(TOOL_LIST_NODES, "List registry nodes",
                input_schema(&[
                    InputField { name: "node_type", description: "Filter by node type (workflow, agent, skill, prompt, tool, template, stage, artifact, execution)", json_type: "string", example: serde_json::json!("workflow") },
                ], &[]))
                .with_raw_output_schema(Arc::new(output_schema_for_list_nodes())),

            Tool::new(TOOL_LIST_EDGES, "List edges (dependencies) between registry nodes",
                input_schema(&[
                    InputField { name: "node_type", description: "Filter by source node type (workflow, agent, skill, prompt, tool, template)", json_type: "string", example: serde_json::json!("workflow") },
                    InputField { name: "relationship_type", description: "Filter by relationship type (depends_on, uses, provides, references, configures)", json_type: "string", example: serde_json::json!("depends_on") },
                    InputField { name: "limit", description: "Maximum number of edges to return", json_type: "number", example: serde_json::json!(100) },
                ], &[]))
                .with_raw_output_schema(Arc::new(output_schema_for_list_edges())),

            // ===================================================================
            // Meta-tools
            // ===================================================================
            Tool::new(TOOL_TOOL_SEARCH, "Search available tools by category, tag, or source_type",
                input_schema(&[
                    InputField { name: "category", description: "Filter by tool category", json_type: "string", example: serde_json::json!("workflow") },
                    InputField { name: "tag", description: "Filter by tag", json_type: "string", example: serde_json::json!("core") },
                    InputField { name: "source_type", description: "Filter by source type", json_type: "string", example: serde_json::json!("builtin") },
                ], &[]))
                .with_raw_output_schema(Arc::new(output_schema_for_tool_search())),

            Tool::new(TOOL_TOOL_INSPECT, "Get full metadata and schemas for a specific tool",
                input_schema(&[
                    InputField { name: "arn", description: "Tool ARN", json_type: "string", example: serde_json::json!("arn:local:global:tool/bash") },
                ], &["arn"]))
                .with_raw_output_schema(Arc::new(output_schema_for_tool_inspect())),
        ];
        ListToolsResult::with_all_items(tools)
    }

    /// Extract tool metadata from a registry Node's config_json
    fn tool_metadata_from_node(node: &Node) -> serde_json::Value {
        let default_spec = serde_json::json!({});
        let spec = node
            .config_json
            .as_deref()
            .and_then(|c| serde_json::from_str::<serde_json::Value>(c).ok())
            .and_then(|v| v.get("spec").cloned())
            .unwrap_or(default_spec);

        let description = spec
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let category = spec
            .get("category")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let tags = spec
            .get("tags")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let source_type = spec
            .get("source_type")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let input_schema = spec.get("input_schema").cloned();
        let output_schema = spec.get("output_schema").cloned();

        serde_json::json!({
            "arn": node.id,
            "name": node.name,
            "description": description,
            "category": category,
            "tags": tags,
            "source_type": source_type,
            "input_schema": input_schema,
            "output_schema": output_schema,
        })
    }

    /// Handle tool calls
    async fn call_tool_internal(&self, name: &str, arguments: JsonObject) -> CallToolResult {
        let mcp_handler = self.mcp_handler.clone();
        let workflow_handler = self.workflow_handler.clone();
        let artifact_handler = self.artifact_handler.clone();
        let insights_handler = self.insights_handler.clone();
        let metrics_handler = self.metrics_handler.clone();

        // Helper to convert handler result to CallToolResult
        fn to_result<T: serde::Serialize>(r: Result<T, String>) -> CallToolResult {
            match r {
                Ok(v) => CallToolResult::success(vec![
                    make_text_content(serde_json::to_string_pretty(&v).unwrap_or_else(|_| "{}".into()))
                ]),
                Err(e) => CallToolResult::error(vec![make_text_content(e)]),
            }
        }

        // Helper to parse params with error handling
        fn parse_params<T: serde::de::DeserializeOwned>(args: &JsonObject) -> Result<T, String> {
            serde_json::from_value(serde_json::to_value(args).unwrap())
                .map_err(|_| "Invalid params".to_string())
        }

        match name {
            // Workflow Tools (routed to WorkflowMcpHandler)
            TOOL_WORKFLOW_LIST => {
                let params: ListParams = serde_json::from_value(serde_json::to_value(&arguments).unwrap())
                    .unwrap_or_default();
                to_result(workflow_handler.workflow_list(params).await)
            }
            TOOL_WORKFLOW_GET => {
                match parse_params::<GetByArnParams>(&arguments) {
                    Ok(params) => to_result(workflow_handler.workflow_get(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }
            TOOL_WORKFLOW_GET_DAG => {
                match parse_params::<GetByArnParams>(&arguments) {
                    Ok(params) => to_result(workflow_handler.workflow_get_dag(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }
            TOOL_WORKFLOW_EXECUTE => {
                match parse_params::<WorkflowExecuteParams>(&arguments) {
                    Ok(params) => to_result(workflow_handler.create_execution(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }
            TOOL_WORKFLOW_GET_STATE => {
                match parse_params::<WorkflowGetStateParams>(&arguments) {
                    Ok(params) => to_result(workflow_handler.get_execution(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }
            TOOL_WORKFLOW_UPDATE_STATE => {
                match parse_params::<WorkflowUpdateStateParams>(&arguments) {
                    Ok(params) => to_result(workflow_handler.update_execution(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }
            TOOL_WORKFLOW_GET_NEXT_STAGE => {
                match parse_params::<WorkflowGetNextStageParams>(&arguments) {
                    Ok(params) => to_result(workflow_handler.workflow_get_next_stage(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }
            TOOL_WORKFLOW_ABORT => {
                match parse_params::<WorkflowAbortParams>(&arguments) {
                    Ok(params) => to_result(workflow_handler.workflow_abort(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }

            // Agent Tools
            TOOL_AGENT_LIST => {
                let params: ListParams = serde_json::from_value(serde_json::to_value(&arguments).unwrap())
                    .unwrap_or_default();
                to_result(mcp_handler.agent_list(params).await)
            }
            TOOL_AGENT_GET => {
                match parse_params::<GetByArnParams>(&arguments) {
                    Ok(params) => to_result(mcp_handler.agent_get(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }
            TOOL_AGENT_QUERY => {
                match parse_params::<AgentQueryParams>(&arguments) {
                    Ok(params) => to_result(mcp_handler.agent_query(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }

            // Skill Tools
            TOOL_SKILL_LIST => {
                let params: ListParams = serde_json::from_value(serde_json::to_value(&arguments).unwrap())
                    .unwrap_or_default();
                to_result(mcp_handler.skill_list(params).await)
            }
            TOOL_SKILL_GET => {
                match parse_params::<GetByArnParams>(&arguments) {
                    Ok(params) => to_result(mcp_handler.skill_get(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }
            TOOL_SKILL_QUERY => {
                match parse_params::<SkillQueryParams>(&arguments) {
                    Ok(params) => to_result(mcp_handler.skill_query(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }

            // Prompt Tools
            TOOL_PROMPT_LIST => {
                let params: ListParams = serde_json::from_value(serde_json::to_value(&arguments).unwrap())
                    .unwrap_or_default();
                to_result(mcp_handler.prompt_list(params).await)
            }
            TOOL_PROMPT_GET => {
                match parse_params::<GetByArnParams>(&arguments) {
                    Ok(params) => to_result(mcp_handler.prompt_get(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }

            // Execution Tools
            TOOL_EXECUTION_LIST => {
                let params: ExecutionListParams = serde_json::from_value(serde_json::to_value(&arguments).unwrap())
                    .unwrap_or_default();
                to_result(workflow_handler.execution_list(params).await)
            }
            TOOL_EXECUTION_GET => {
                match parse_params::<GetByArnParams>(&arguments) {
                    Ok(params) => to_result(workflow_handler.execution_get(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }
            TOOL_EXECUTION_HISTORY => {
                match parse_params::<ExecutionHistoryParams>(&arguments) {
                    Ok(params) => to_result(workflow_handler.execution_history(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }

            // Artifact Tools (routed to ArtifactMcpHandler)
            TOOL_ARTIFACT_CREATE => {
                match parse_params::<ArtifactCreateParams>(&arguments) {
                    Ok(params) => to_result(artifact_handler.artifact_create(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }
            TOOL_ARTIFACT_GET => {
                match parse_params::<GetByArnParams>(&arguments) {
                    Ok(params) => to_result(artifact_handler.artifact_get(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }
            TOOL_ARTIFACT_LIST => {
                let params: ArtifactListParams = serde_json::from_value(serde_json::to_value(&arguments).unwrap())
                    .unwrap_or_default();
                to_result(artifact_handler.artifact_list(params).await)
            }

            // Insights Tools (routed to InsightsMcpHandler)
            TOOL_INSIGHTS_LOG => {
                match parse_params::<InsightsLogParams>(&arguments) {
                    Ok(params) => to_result(insights_handler.insights_log(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }
            TOOL_INSIGHTS_QUERY => {
                let params: InsightsQueryParams = serde_json::from_value(serde_json::to_value(&arguments).unwrap())
                    .unwrap_or_default();
                to_result(insights_handler.insights_query(params).await)
            }
            TOOL_INSIGHTS_AGGREGATE => {
                match parse_params::<InsightsAggregateParams>(&arguments) {
                    Ok(params) => to_result(insights_handler.insights_aggregate(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }

            // Metrics Tools (routed to MetricsMcpHandler)
            TOOL_METRICS_QUERY => {
                match parse_params::<MetricsQueryParams>(&arguments) {
                    Ok(params) => to_result(metrics_handler.metrics_query(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }
            TOOL_METRICS_SUBSCRIBE => {
                let params: MetricsSubscribeParams = serde_json::from_value(serde_json::to_value(&arguments).unwrap())
                    .unwrap_or_default();
                to_result(metrics_handler.metrics_subscribe(params).await)
            }

            // Impact Analysis Tools
            TOOL_ANALYZE_IMPACT => {
                match parse_params::<AnalyzeImpactParams>(&arguments) {
                    Ok(params) => to_result(mcp_handler.analyze_impact(params).await),
                    Err(e) => CallToolResult::error(vec![make_text_content(e)]),
                }
            }

            // Registry Tools
            TOOL_LIST_NODES => {
                let result = (|| -> Result<Vec<serde_json::Value>, String> {
                    let node_type = arguments.get("node_type").and_then(|v| v.as_str());

                    let nodes = match node_type {
                        Some("workflow") => self._state.node_service().list_by_type(NodeType::Workflow),
                        Some("agent") => self._state.node_service().list_by_type(NodeType::Agent),
                        Some("skill") => self._state.node_service().list_by_type(NodeType::Skill),
                        Some("prompt") => self._state.node_service().list_by_type(NodeType::Prompt),
                        Some("tool") => self._state.node_service().list_by_type(NodeType::Tool),
                        Some("template") => self._state.node_service().list_by_type(NodeType::Template),
                        Some("stage") => self._state.node_service().list_by_type(NodeType::Stage),
                        Some("artifact") => self._state.node_service().list_by_type(NodeType::Artifact),
                        Some("execution") => self._state.node_service().list_by_type(NodeType::Execution),
                        Some(_) => Ok(Vec::new()),
                        None => self._state.node_service().list_all(),
                    }
                    .map_err(|e| format!("Registry query error: {}", e))?;

                    Ok(nodes.into_iter().map(|node| {
                        serde_json::json!({
                            "id": node.id,
                            "type": node.node_type.as_str(),
                            "name": node.name,
                            "registry": node.registry,
                            "namespace": node.namespace,
                            "path": node.path,
                            "checksum": node.checksum,
                            "config_json": node.config_json,
                            "metadata_json": node.metadata_json,
                            "created_at": node.created_at.to_rfc3339(),
                            "updated_at": node.updated_at.to_rfc3339(),
                        })
                    }).collect())
                })();

                to_result(result)
            }
            TOOL_LIST_EDGES => {
                let result = (|| -> Result<Vec<serde_json::Value>, String> {
                    let node_type = arguments.get("node_type").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let relationship_type = arguments.get("relationship_type").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let limit = arguments.get("limit").and_then(|v| v.as_u64());

                    let conn = self._state.db().connection()
                        .map_err(|e| format!("DB connection error: {}", e))?;

                    let mut sql = String::from(
                        "SELECT e.from_id, e.to_id, e.relationship_type FROM edges e"
                    );
                    let mut param_values: Vec<String> = Vec::new();

                    if node_type.is_some() {
                        sql.push_str(" JOIN nodes n ON e.from_id = n.id");
                    }

                    sql.push_str(" WHERE 1=1");

                    if let Some(ref nt) = node_type {
                        sql.push_str(" AND n.type = ?");
                        param_values.push(nt.clone());
                    }
                    if let Some(ref rt) = relationship_type {
                        sql.push_str(" AND e.relationship_type = ?");
                        param_values.push(rt.clone());
                    }

                    sql.push_str(" ORDER BY e.id");

                    if let Some(l) = limit {
                        sql.push_str(" LIMIT ?");
                        param_values.push(l.to_string());
                    }

                    let param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter()
                        .map(|v| v as &dyn rusqlite::types::ToSql)
                        .collect();

                    let mut stmt = conn.prepare(&sql)
                        .map_err(|e| format!("Query prepare error: {}", e))?;

                    let edges: Vec<serde_json::Value> = stmt
                        .query_map(param_refs.as_slice(), |row| {
                            Ok(serde_json::json!({
                                "from_id": row.get::<_, String>(0)?,
                                "to_id": row.get::<_, String>(1)?,
                                "relationship_type": row.get::<_, String>(2)?,
                            }))
                        })
                        .map_err(|e| format!("Query error: {}", e))?
                        .filter_map(|r| r.ok())
                        .collect();

                    Ok(edges)
                })();

                to_result(result)
            }

            // Meta-tools
            TOOL_TOOL_SEARCH => {
                let category = arguments.get("category").and_then(|v| v.as_str()).map(|s| s.to_string());
                let tag = arguments.get("tag").and_then(|v| v.as_str()).map(|s| s.to_string());
                let source_type = arguments.get("source_type").and_then(|v| v.as_str()).map(|s| s.to_string());

                let nodes = self._state.node_service().list_by_type(NodeType::Tool)
                    .unwrap_or_default();

                let results: Vec<serde_json::Value> = nodes
                    .iter()
                    .filter(|node| {
                        let meta = Self::tool_metadata_from_node(node);
                        if let Some(ref cat) = category {
                            if meta.get("category").and_then(|v| v.as_str()) != Some(cat.as_str()) {
                                return false;
                            }
                        }
                        if let Some(ref t) = tag {
                            let tags = meta.get("tags").and_then(|v| v.as_array());
                            if !tags.map_or(false, |arr| arr.iter().any(|v| v.as_str() == Some(t.as_str()))) {
                                return false;
                            }
                        }
                        if let Some(ref st) = source_type {
                            if meta.get("source_type").and_then(|v| v.as_str()) != Some(st.as_str()) {
                                return false;
                            }
                        }
                        true
                    })
                    .map(|node| {
                        let meta = Self::tool_metadata_from_node(node);
                        serde_json::json!({
                            "arn": meta["arn"],
                            "name": meta["name"],
                            "description": meta["description"],
                            "category": meta["category"],
                            "tags": meta["tags"],
                            "source_type": meta["source_type"],
                        })
                    })
                    .collect();

                to_result(Ok(results))
            }
            TOOL_TOOL_INSPECT => {
                let arn = match arguments.get("arn").and_then(|v| v.as_str()) {
                    Some(a) => a.to_string(),
                    None => return CallToolResult::error(vec![make_text_content("Missing required parameter: arn".to_string())]),
                };

                match self._state.node_service().get(&arn) {
                    Ok(Some(node)) => {
                        let meta = Self::tool_metadata_from_node(&node);
                        to_result(Ok(meta))
                    }
                    Ok(None) => CallToolResult::error(vec![make_text_content(format!("Tool not found: {}", arn))]),
                    Err(e) => CallToolResult::error(vec![make_text_content(format!("Error looking up tool: {}", e))]),
                }
            }

            _ => CallToolResult::error(vec![make_text_content(format!("Unknown tool: {}", name))]),
        }
    }
}

impl ServerHandler for WorkflowServer {
    fn get_info(&self) -> ServerInfo {
        InitializeResult::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                .build(),
        )
        .with_server_info(Implementation::new("workflow-mcp", env!("CARGO_PKG_VERSION")))
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<rmcp::service::RoleServer>,
    ) -> Result<ListToolsResult, rmcp::ErrorData> {
        Ok(Self::list_tools_internal())
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<rmcp::service::RoleServer>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        let name = request.name.clone();
        let arguments = request.arguments.unwrap_or_default();

        info!("Tool call: {} with {:?}", name, arguments);

        // Time the tool execution
        let start = std::time::Instant::now();
        let result = self.call_tool_internal(&name, arguments).await;
        let duration_ms = start.elapsed().as_millis() as u64;

        // Emit telemetry event
        let is_error = result.is_error.unwrap_or(false);
        self._broadcaster.broadcast(
            metrics::domain::metric::MetricEvent::new(
                "*".to_string(),
                format!("tool:{}", name),
                metrics::domain::metric::MetricEventType::ToolCall,
            )
            .with_duration(duration_ms)
            .with_custom(serde_json::json!({
                "tool_name": name,
                "success": !is_error,
            }))
        );

        Ok(result)
    }

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<rmcp::service::RoleServer>,
    ) -> Result<ListResourcesResult, rmcp::ErrorData> {
        let resources = vec![
            make_resource("arn://registry/workflows", "All registered workflows"),
            make_resource("arn://registry/agents", "All registered agents"),
            make_resource("arn://registry/skills", "All registered skills"),
            make_resource("arn://registry/prompts", "All registered prompts"),
            make_resource("arn://registry/executions", "Recent executions"),
            make_resource("arn://registry/artifacts", "Recent artifacts"),
        ];
        Ok(ListResourcesResult::with_all_items(resources))
    }
}

// ============================================================================
// Main Entry Point
// ============================================================================

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    match cli {
        Cli::Init { workspace, template } => {
            let workspace = shellexpand::tilde(&workspace).into_owned();
            let service = BootstrapService::new(PathBuf::from(&workspace));

            if service.is_initialized() {
                println!("Workspace already initialized at {}", workspace);
                return Ok(());
            }

            let result = service.init()?;
            println!("Bootstrap complete:");
            println!("  Created: {}", result.created.join(", "));
            println!("  Skipped: {}", result.skipped.join(", "));

            if let Some(url) = template {
                println!("Loading template from {}", url);
                service.load_template(&url).await?;
            }

            Ok(())
        }
        Cli::Start { workspace, port, dev: _ } => {
            start_server(workspace, port).await
        }
    }
}

async fn start_server(workspace: String, port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let subscriber = FmtSubscriber::builder()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .compact()
        .with_writer(std::io::stderr)
        .finish();

    tracing::subscriber::set_global_default(subscriber)
        .expect("Failed to set subscriber");

    info!("Starting Workflow MCP Server v{}", env!("CARGO_PKG_VERSION"));

    // Initialize bootstrap (idempotent)
    let bootstrap = BootstrapService::new(PathBuf::from(&workspace));
    if !bootstrap.is_initialized() {
        info!("Workspace not initialized, running bootstrap...");
        bootstrap.init()?;
    }
    info!("Using workspace: {}", workspace);

    // Initialize application state with workspace path
    let state = Arc::new(AppState::new(&workspace).await?);
    let state_for_rest = state.clone();
    info!("Application state initialized");

    // Register all resources (workflows, agents, tools, skills, prompts) from YAML/files into database
    bootstrap.register_resources_to_db(state.node_service().clone())?;
    info!("Resources registered from YAML files");

    // Initialize metrics broadcaster
    let broadcaster = Arc::new(MetricsBroadcaster::new());
    let broadcaster_for_service = broadcaster.clone();
    let broadcaster_for_routes = broadcaster.clone();
    info!("Metrics broadcaster initialized");

    // Create the Streamable HTTP service
    let service: StreamableHttpService<WorkflowServer, LocalSessionManager> = StreamableHttpService::new(
        move || Ok(WorkflowServer::new(state.clone(), broadcaster_for_service.clone())),
        Default::default(),
        StreamableHttpServerConfig::default()
            .with_sse_keep_alive(Some(Duration::from_secs(15))),
    );

    // Create metrics routes
    let metrics_routes = metrics_sse::metrics_routes(broadcaster_for_routes);

    // Initialize REST API state — wraps AppState via Arc
    let rest_app = create_rest_router(state_for_rest);

    // Start REST API server on configurable port (default 8081)
    let rest_port: u16 = std::env::var("REST_PORT")
        .unwrap_or_else(|_| "8081".to_string())
        .parse()
        .unwrap_or(8081);
    let rest_addr = SocketAddr::from(([0, 0, 0, 0], rest_port));
    let rest_listener = TcpListener::bind(rest_addr).await?;
    info!("REST API server listening on http://{}", rest_addr);

    tokio::spawn(async move {
        axum::serve(rest_listener, rest_app).await.unwrap();
    });

    // CORS layer for IDE integration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Create studio routes
    let studio_router = studio::create_studio_router();

    // Mount on Axum router with CORS applied to all routes
    let app = Router::new()
        .nest_service("/mcp", service)
        .merge(metrics_routes)
        .merge(studio_router)
        .layer(cors);

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("HTTP MCP server listening on http://{}", addr);
    info!("MCP endpoint: http://{}/mcp", addr);
    info!("Metrics SSE: http://{}/metrics/sse", addr);
    info!("REST API: http://0.0.0.0:{}/api/*", rest_port);
    info!("Studio UI: http://{}/studio", addr);
    info!("Tools: workflow_list, workflow_get, workflow_get_dag, workflow_execute, workflow_get_state, workflow_update_state, workflow_get_next_stage, workflow_abort, agent_list, agent_get, agent_query, skill_list, skill_get, skill_query, prompt_list, prompt_get, execution_list, execution_get, execution_history, artifact_create, artifact_get, artifact_list, insights_log, insights_query, metrics_query, metrics_subscribe, list_edges");

    let server = axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = signal::ctrl_c().await;
            info!("Shutting down...");
        });

    server.await?;

    Ok(())
}
