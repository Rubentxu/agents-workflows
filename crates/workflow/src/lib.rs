//! Workflow Bounded Context
//!
//! Manages workflow definitions, DAG structure, and stage orchestration.
//!
//! ## Domain
//! - Workflow: Top-level definition with stages and execution config
//! - Stage: Single unit of work in a workflow
//! - ExecutionConfig: How to run the workflow

pub mod domain;
pub mod application;
pub mod infrastructure;

pub use domain::*;
pub use application::*;
