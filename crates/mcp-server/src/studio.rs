//! Embedded Studio UI server
//!
//! Serves the React Studio UI from the filesystem.
//! When embedded-studio feature is enabled, assets are bundled in the binary.

use axum::{
    body::Body,
    http::header,
    response::Response,
    Router,
};

#[cfg(feature = "embedded-studio")]
mod embedded {
    use axum::{
        body::Body,
        http::header,
        response::Response,
    };
    use include_dir::Dir;
    use include_dir_macros::include_dir;

    // CARGO_MANIFEST_DIR is crates/mcp-server
    // Use path! to construct the path at compile time
    const STUDIO_PATH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../studio/dist");
    pub static STUDIO_DIR: Dir<'_> = include_dir!(STUDIO_PATH);

    pub fn serve_file(path: &str) -> Option<Response> {
        let path = path.trim_start_matches('/');
        let file_path = if path.is_empty() || path == "studio" {
            "index.html"
        } else {
            path
        };

        STUDIO_DIR.get_file(file_path).map(|file| {
            let content = file.contents();
            let mime = mime_guess::from_path(file_path)
                .first_or_octet_stream();

            Response::builder()
                .status(200)
                .header(header::CONTENT_TYPE, mime.as_ref())
                .body(Body::from(content.to_vec()))
                .unwrap()
        })
    }

    pub fn serve_index() -> Response {
        let file = STUDIO_DIR.get_file("index.html").unwrap();
        let content = file.contents();

        Response::builder()
            .status(200)
            .header(header::CONTENT_TYPE, "text/html")
            .body(Body::from(content.to_vec()))
            .unwrap()
    }
}

/// Get the studio path from environment or default
pub fn get_studio_path() -> std::path::PathBuf {
    std::path::PathBuf::from(
        std::env::var("STUDIO_PATH")
            .unwrap_or_else(|_| "studio/dist".to_string())
    )
}

/// Create the studio router
#[cfg(feature = "embedded-studio")]
pub fn create_studio_router() -> Router {
    Router::new()
        .route("/*path", axum::routing::get(studio_handler))
        .route("/", axum::routing::get(studio_index_handler))
        .route("/studio", axum::routing::get(studio_index_handler))
        .route("/studio/", axum::routing::get(studio_index_handler))
}

#[cfg(not(feature = "embedded-studio"))]
pub fn create_studio_router() -> Router {
    let studio_path = get_studio_path();
    Router::new()
        // Specific routes first so they are matched before the wildcard
        .route("/", axum::routing::get(studio_index_handler))
        .route("/studio", axum::routing::get(studio_index_handler))
        .route("/studio/", axum::routing::get(studio_index_handler))
        // Wildcard last — captures all other /studio/* paths for SPA routing
        .route("/*path", axum::routing::get(studio_handler))
        .with_state(studio_path)
}

#[cfg(feature = "embedded-studio")]
async fn studio_handler(path: axum::extract::Path<String>) -> Response {
    // First try to serve the file directly
    if let Some(response) = embedded::serve_file(&path) {
        return response;
    }

    // For SPA routing: if path starts with "studio/" or is a known studio route,
    // fall back to index.html
    let path_str = path.trim_start_matches('/');
    if path_str.starts_with("studio/") || path_str == "studio" || path_str.starts_with("projects/") {
        return embedded::serve_index();
    }

    // File not found and not a studio route
    Response::builder()
        .status(404)
        .header(header::CONTENT_TYPE, "text/plain")
        .body(Body::from("Not found"))
        .unwrap()
}

#[cfg(feature = "embedded-studio")]
async fn studio_index_handler() -> Response {
    embedded::serve_index()
}

#[cfg(not(feature = "embedded-studio"))]
mod filesystem {
    use axum::{
        body::Body,
        http::header,
        response::Response,
    };
    use std::path::Path;

    pub fn serve_file(path: &str, studio_path: &Path) -> Option<Response> {
        let path = path.trim_start_matches('/');
        // Strip "studio/" prefix since studio_path already points to studio/dist
        let path = path.strip_prefix("studio/").unwrap_or(path);
        let file_path = if path.is_empty() || path == "studio" {
            studio_path.join("index.html")
        } else {
            studio_path.join(path)
        };

        if file_path.exists() && file_path.is_file() {
            let content = std::fs::read(&file_path).ok()?;
            let mime = mime_guess::from_path(&file_path)
                .first_or_octet_stream();

            return Some(
                Response::builder()
                    .status(200)
                    .header(header::CONTENT_TYPE, mime.as_ref())
                    .body(Body::from(content))
                    .unwrap()
            );
        }
        None
    }

    pub fn serve_index(studio_path: &Path) -> Response {
        let index_path = studio_path.join("index.html");
        if index_path.exists() {
            let content = std::fs::read(&index_path).unwrap_or_default();
            Response::builder()
                .status(200)
                .header(header::CONTENT_TYPE, "text/html")
                .body(Body::from(content))
                .unwrap()
        } else {
            Response::builder()
                .status(404)
                .header(header::CONTENT_TYPE, "text/plain")
                .body(Body::from("Studio not found. Build the studio first with: cd studio && npm install && npm run build"))
                .unwrap()
        }
    }
}

#[cfg(not(feature = "embedded-studio"))]
async fn studio_handler(
    path: axum::extract::Path<String>,
    axum::extract::State(studio_path): axum::extract::State<std::path::PathBuf>,
) -> Response {
    // First try to serve the file directly
    if let Some(response) = filesystem::serve_file(&path, &studio_path) {
        return response;
    }

    // For SPA routing: if path starts with "studio/" or is a known studio route,
    // fall back to index.html
    let path_str = path.trim_start_matches('/');
    if path_str.starts_with("studio/") || path_str == "studio" || path_str.starts_with("projects/") {
        return filesystem::serve_index(&studio_path);
    }

    // File not found and not a studio route
    Response::builder()
        .status(404)
        .header(header::CONTENT_TYPE, "text/plain")
        .body(Body::from("Not found"))
        .unwrap()
}

#[cfg(not(feature = "embedded-studio"))]
async fn studio_index_handler(
    axum::extract::State(studio_path): axum::extract::State<std::path::PathBuf>,
) -> Response {
    filesystem::serve_index(&studio_path)
}
