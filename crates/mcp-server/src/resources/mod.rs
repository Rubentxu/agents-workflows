//! Resource CRUD module
//!
//! Provides generic CRUD operations for resource types via the ResourceCallbacks trait.
//!
//! ## Usage
//!
//! ```rust,ignore
//! use crate::resources::{CrudHandler, ResourceCallbacks};
//!
//! // Implement ResourceCallbacks for your resource type
//! impl ResourceCallbacks for MyCallbacks {
//!     type CreateRequest = CreateMyRequest;
//!     type UpdateRequest = UpdateMyRequest;
//!     // ...
//! }
//!
//! // Use in a handler
//! pub async fn get_my_resource(
//!     State(state): State<Arc<AppState>>,
//!     Path(arn): Path<String>,
//! ) -> Result<Json<MyResponse>, (StatusCode, Json<ErrorResponse>)> {
//!     let handler = CrudHandler::new(MyCallbacks);
//!     handler.get(&state, &arn)
//! }
//! ```

pub mod agent;
pub mod skill;
pub mod prompt;
pub mod tool;
pub mod template;
pub mod workflow;

use axum::{http::StatusCode, Json};
use registry::domain::Node;
use serde::Serialize;

use crate::rest_types::ErrorResponse;

/// Error type for CRUD operations
pub type CrudError = (StatusCode, Json<ErrorResponse>);

/// Helper to create a not found error
fn not_found(resource: &str, arn: &str) -> CrudError {
    (
        StatusCode::NOT_FOUND,
        Json(ErrorResponse::new("RESOURCE_NOT_FOUND", &format!("{} '{}' not found", resource, arn))),
    )
}

/// Helper to create an internal error
fn internal_error(e: impl ToString) -> CrudError {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse::new("INTERNAL_ERROR", &e.to_string())),
    )
}

/// Helper to create an invalid ARN error
fn invalid_arn() -> CrudError {
    (
        StatusCode::BAD_REQUEST,
        Json(ErrorResponse::new("INVALID_ARN", "Invalid ARN format")),
    )
}

/// Validate ARN format using the shared registry::domain::Arn::parse() logic
pub fn validate_arn(arn: &str) -> Result<String, CrudError> {
    registry::domain::Arn::parse(arn)
        .map(|_| arn.to_string())
        .ok_or_else(invalid_arn)
}

/// Convert Node to a JSON response
pub fn node_to_response(node: &Node) -> serde_json::Value {
    serde_json::json!({
        "id": node.id,
        "name": node.name,
        "namespace": node.namespace,
        "scope": node.scope,
        "config": node.config_json,
        "created_at": node.created_at.to_rfc3339(),
        "updated_at": node.updated_at.to_rfc3339(),
    })
}

/// Generic list response wrapper with resource-specific key
pub fn list_response<T: Serialize>(items: Vec<T>, resource_type: &str) -> serde_json::Value {
    serde_json::json!({ resource_type: items })
}
