//! MCP API Type Definitions
//!
//! Request/Response types for all MCP tools following the ARN format:
//! arn:local:{scope}:{type}/{name}
//!
//! All types in this module are DTOs (Data Transfer Objects) that live at the
//! MCP/presentation boundary. They are intentionally named with *Dto suffix when
//! they conflict with domain types to prevent confusion.

pub mod workflow_dto;
pub mod execution;
pub mod agent;
pub mod skill;
pub mod prompt;
pub mod artifact_dto;
pub mod insight;
pub mod metrics_dto;
pub mod impact;

// Re-export all types for backwards compatibility
pub use workflow_dto::*;
pub use execution::*;
pub use agent::*;
pub use skill::*;
pub use prompt::*;
pub use artifact_dto::*;
pub use insight::*;
pub use metrics_dto::*;
pub use impact::*;