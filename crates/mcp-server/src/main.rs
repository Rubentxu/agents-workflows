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

use state::AppState;
use metrics_sse::MetricsBroadcaster;
use handler::McpHandler;
use workflow_handler::WorkflowMcpHandler;
use artifact_handler::ArtifactMcpHandler;
use insights_handler::InsightsMcpHandler;
use metrics_handler::MetricsMcpHandler;
use types::*;
use rest::{create_rest_router, RestState};
use bootstrap::BootstrapService;

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

// ============================================================================
// Schema Helpers
// ============================================================================

/// Create an empty input schema
fn empty_schema() -> JsonObject {
    JsonObject::new()
}

/// Create input schema for get/list operations
fn get_schema(required_fields: &[&str]) -> JsonObject {
    let mut obj = JsonObject::new();
    let properties = serde_json::Map::new();
    obj.insert("properties".into(), serde_json::to_value(properties).unwrap().into());
    obj.insert("required".into(), serde_json::to_value(required_fields).unwrap().into());
    obj
}

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
            // Workflow Tools
            Tool::new(TOOL_WORKFLOW_LIST, "List all registered workflows", empty_schema()),
            Tool::new(TOOL_WORKFLOW_GET, "Get a workflow by ARN", get_schema(&["arn"])),
            Tool::new(TOOL_WORKFLOW_GET_DAG, "Get workflow DAG (parallel groups, dependencies)", get_schema(&["arn"])),
            Tool::new(TOOL_WORKFLOW_EXECUTE, "Execute a workflow", get_schema(&["workflow_arn", "workspace_id"])),
            Tool::new(TOOL_WORKFLOW_GET_STATE, "Get current execution state", get_schema(&["execution_arn"])),
            Tool::new(TOOL_WORKFLOW_UPDATE_STATE, "Update execution state", get_schema(&["execution_arn"])),
            Tool::new(TOOL_WORKFLOW_GET_NEXT_STAGE, "Get next suggested stage", get_schema(&["execution_arn"])),
            Tool::new(TOOL_WORKFLOW_ABORT, "Abort a workflow execution", get_schema(&["execution_arn"])),

            // Agent Tools
            Tool::new(TOOL_AGENT_LIST, "List all agents", empty_schema()),
            Tool::new(TOOL_AGENT_GET, "Get an agent by ARN", get_schema(&["arn"])),
            Tool::new(TOOL_AGENT_QUERY, "Query agents by search term", get_schema(&["query"])),

            // Skill Tools
            Tool::new(TOOL_SKILL_LIST, "List all skills", empty_schema()),
            Tool::new(TOOL_SKILL_GET, "Get a skill by ARN", get_schema(&["arn"])),
            Tool::new(TOOL_SKILL_QUERY, "Query skills by search term", get_schema(&["query"])),

            // Prompt Tools
            Tool::new(TOOL_PROMPT_LIST, "List all prompts", empty_schema()),
            Tool::new(TOOL_PROMPT_GET, "Get a prompt by ARN", get_schema(&["arn"])),

            // Execution Tools
            Tool::new(TOOL_EXECUTION_LIST, "List executions", empty_schema()),
            Tool::new(TOOL_EXECUTION_GET, "Get an execution by ARN", get_schema(&["arn"])),
            Tool::new(TOOL_EXECUTION_HISTORY, "Get execution history", get_schema(&["execution_arn"])),

            // Artifact Tools
            Tool::new(TOOL_ARTIFACT_CREATE, "Create an artifact", get_schema(&["execution_arn", "name", "content", "content_type"])),
            Tool::new(TOOL_ARTIFACT_GET, "Get an artifact by ARN", get_schema(&["arn"])),
            Tool::new(TOOL_ARTIFACT_LIST, "List artifacts", empty_schema()),

            // Insights Tools
            Tool::new(TOOL_INSIGHTS_LOG, "Log an insight event", get_schema(&["execution_arn", "insight_type", "data"])),
            Tool::new(TOOL_INSIGHTS_QUERY, "Query insights", empty_schema()),
            Tool::new(TOOL_INSIGHTS_AGGREGATE, "Aggregate insights for analytics", get_schema(&["execution_arn", "stage_id"])),

            // Metrics Tools
            Tool::new(TOOL_METRICS_QUERY, "Query execution metrics", get_schema(&["execution_arn"])),
            Tool::new(TOOL_METRICS_SUBSCRIBE, "Get SSE URL for metrics subscription", empty_schema()),

            // Impact Analysis Tools
            Tool::new(TOOL_ANALYZE_IMPACT, "Analyze the impact of an action on a resource", get_schema(&["arn", "kind"])),
        ];
        ListToolsResult::with_all_items(tools)
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

        Ok(self.call_tool_internal(&name, arguments).await)
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
    bootstrap.register_resources_to_db(state.node_service.clone())?;
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
    let rest_state = RestState::new(state_for_rest);
    let rest_app = create_rest_router(rest_state);

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
    info!("Tools: workflow_list, workflow_get, workflow_get_dag, workflow_execute, workflow_get_state, workflow_update_state, workflow_get_next_stage, workflow_abort, agent_list, agent_get, agent_query, skill_list, skill_get, skill_query, prompt_list, prompt_get, execution_list, execution_get, execution_history, artifact_create, artifact_get, artifact_list, insights_log, insights_query, metrics_query, metrics_subscribe");

    let server = axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = signal::ctrl_c().await;
            info!("Shutting down...");
        });

    server.await?;

    Ok(())
}
