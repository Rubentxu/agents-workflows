//! Artifact Bounded Context
//!
//! Manages artifact storage with hybrid approach:
//! - SQLite for artifacts < 1MB
//! - Filesystem for artifacts >= 1MB

pub mod domain;
pub mod application;
pub mod infrastructure;

pub use domain::*;
pub use application::*;
