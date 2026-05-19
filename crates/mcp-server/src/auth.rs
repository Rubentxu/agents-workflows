//! Auth middleware for REST API
//!
//! Simple API key check: validates X-API-Key header against API_KEY env var.
//! In development (API_KEY=dev), all requests are allowed through.

use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use std::env;

/// Check X-API-Key header against the API_KEY environment variable.
/// Dev mode: if API_KEY=dev, always allow.
pub async fn auth_middleware(req: Request, next: Next) -> Result<Response, StatusCode> {
    let api_key = env::var("API_KEY").unwrap_or_else(|_| "dev".to_string());

    // Dev mode: allow all requests
    if api_key == "dev" {
        return Ok(next.run(req).await);
    }

    // Check X-API-Key header
    match req.headers().get("x-api-key") {
        Some(key) if key.to_str().ok() == Some(api_key.as_str()) => {
            Ok(next.run(req).await)
        }
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}
