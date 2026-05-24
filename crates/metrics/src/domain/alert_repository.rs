//! Alert Repository Port
//!
//! Abstract interface for alert persistence. Implementations live in
//! the infrastructure layer (e.g., SQLite adapter).

use crate::domain::{Alert, AlertQuery, MetricsResult};

/// Alert repository port - abstracts persistence of alerts
pub trait AlertRepository: Send + Sync {
    /// List alerts with optional filters
    fn list(&self, query: &AlertQuery) -> MetricsResult<Vec<Alert>>;

    /// Get an alert by ID
    fn get(&self, id: i64) -> MetricsResult<Option<Alert>>;

    /// Create a new alert
    fn create(&self, alert: &Alert) -> MetricsResult<i64>;

    /// Update an existing alert
    fn update(&self, alert: &Alert) -> MetricsResult<()>;

    /// Delete an alert by ID
    fn delete(&self, id: i64) -> MetricsResult<()>;
}
