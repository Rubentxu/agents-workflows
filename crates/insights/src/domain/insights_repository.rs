//! Insights Repository Port
//!
//! Abstract interface for insights persistence. Implementations live in
//! the infrastructure layer (e.g., SQLite adapter).

use crate::domain::{Insight, InsightsResult};

/// Query parameters for insights
#[derive(Debug, Clone)]
pub struct InsightsQuery {
    pub execution_arn: Option<String>,
    pub stage_id: Option<String>,
    pub insight_type: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
}

/// Insights repository port - abstracts persistence of insights
pub trait InsightsRepository: Send + Sync {
    /// Log a new insight
    fn log(&self, insight: &Insight) -> InsightsResult<()>;

    /// Query insights with optional filters
    fn query(&self, params: &InsightsQuery) -> InsightsResult<Vec<Insight>>;

    /// Get insights aggregate statistics
    fn aggregate(&self, params: &InsightsAggregateParams) -> InsightsResult<InsightsAggregateResult>;
}

/// Parameters for insights aggregation
#[derive(Debug, Clone)]
pub struct InsightsAggregateParams {
    pub execution_arn: Option<String>,
    pub group_by: String,
}

/// Result of insights aggregation
#[derive(Debug, Clone)]
pub struct InsightsAggregateResult {
    pub groups: Vec<InsightsGroup>,
}

/// A single group in the aggregate result
#[derive(Debug, Clone)]
pub struct InsightsGroup {
    pub key: String,
    pub count: i64,
    pub data: serde_json::Value,
}
