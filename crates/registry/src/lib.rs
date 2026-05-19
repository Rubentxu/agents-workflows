//! Registry Bounded Context
//!
//! Manages the graph of nodes (workflows, agents, skills, prompts, tools)
//! and edges (relationships between them).
//!
//! ## Domain
//! - Node: ARN-identified resource with type, name, config
//! - Edge: Relationship between two nodes (uses, depends_on, etc.)
//!
//! ## Application Services
//! - NodeService: CRUD for nodes, ARN resolution
//! - EdgeService: Relationship management
//! - RegistryScanner: Discovers resources from filesystem

pub mod domain;
pub mod application;
pub mod infrastructure;

pub use domain::*;
pub use application::*;
