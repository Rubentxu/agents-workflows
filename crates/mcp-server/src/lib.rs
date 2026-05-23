//! Workflow MCP Server Library
//!
//! This library exposes the MCP server components for use in testing
//! and embedding in other applications.

pub mod state;
pub mod metrics_sse;
pub mod handler;
pub mod workflow_handler;
pub mod artifact_handler;
pub mod insights_handler;
pub mod metrics_handler;
pub mod execution_store;
pub mod artifact_store;
pub mod execution_repository_adapter;
pub mod types;
pub mod mappers;
pub mod rest;
pub mod rest_types;
pub mod rest_handlers;
pub mod studio;
pub mod bootstrap;
pub mod auth;
pub mod resources;

pub use state::AppState;
pub use metrics_sse::MetricsBroadcaster;
pub use handler::McpHandler;
pub use workflow_handler::WorkflowMcpHandler;
pub use artifact_handler::ArtifactMcpHandler;
pub use insights_handler::InsightsMcpHandler;
pub use metrics_handler::MetricsMcpHandler;
pub use execution_store::ExecutionStore;
pub use execution_repository_adapter::ExecutionRepositoryAdapter;
pub use types::*;
