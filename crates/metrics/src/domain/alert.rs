//! Alert entity and alert types
//!
//! Alerts are system notifications for monitoring and observability.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Alert severity levels
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AlertSeverity {
    Info,
    Warning,
    Error,
    Critical,
}

impl AlertSeverity {
    pub fn as_str(&self) -> &'static str {
        match self {
            AlertSeverity::Info => "info",
            AlertSeverity::Warning => "warning",
            AlertSeverity::Error => "error",
            AlertSeverity::Critical => "critical",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "info" => Some(AlertSeverity::Info),
            "warning" => Some(AlertSeverity::Warning),
            "error" => Some(AlertSeverity::Error),
            "critical" => Some(AlertSeverity::Critical),
            _ => None,
        }
    }
}

/// Alert state
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AlertState {
    Open,
    Acknowledged,
    Resolved,
}

impl AlertState {
    pub fn as_str(&self) -> &'static str {
        match self {
            AlertState::Open => "open",
            AlertState::Acknowledged => "acknowledged",
            AlertState::Resolved => "resolved",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "open" => Some(AlertState::Open),
            "acknowledged" => Some(AlertState::Acknowledged),
            "resolved" => Some(AlertState::Resolved),
            _ => None,
        }
    }
}

/// Alert entity - system notification for monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alert {
    /// Database ID
    pub id: Option<i64>,
    /// Alert message
    pub message: String,
    /// Severity level
    pub severity: AlertSeverity,
    /// Current state
    pub state: AlertState,
    /// Source of the alert (e.g., "execution", "system", "metrics")
    pub source: Option<String>,
    /// Workspace ID this alert belongs to
    pub workspace_id: Option<String>,
    /// When the alert was created
    pub created_at: DateTime<Utc>,
    /// When the alert was last updated
    pub updated_at: DateTime<Utc>,
}

impl Alert {
    /// Create a new alert with current timestamp
    pub fn new(
        message: String,
        severity: AlertSeverity,
        source: Option<String>,
        workspace_id: Option<String>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: None,
            message,
            severity,
            state: AlertState::Open,
            source,
            workspace_id,
            created_at: now,
            updated_at: now,
        }
    }

    /// Set the database ID (used after persistence)
    pub fn with_id(mut self, id: i64) -> Self {
        self.id = Some(id);
        self
    }

    /// Acknowledge the alert
    pub fn acknowledge(&mut self) {
        self.state = AlertState::Acknowledged;
        self.updated_at = Utc::now();
    }

    /// Resolve the alert
    pub fn resolve(&mut self) {
        self.state = AlertState::Resolved;
        self.updated_at = Utc::now();
    }
}

/// Query parameters for listing alerts
#[derive(Debug, Clone, Default)]
pub struct AlertQuery {
    pub state: Option<AlertState>,
    pub severity: Option<AlertSeverity>,
    pub workspace_id: Option<String>,
    pub limit: Option<usize>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_alert_severity_as_str() {
        assert_eq!(AlertSeverity::Info.as_str(), "info");
        assert_eq!(AlertSeverity::Warning.as_str(), "warning");
        assert_eq!(AlertSeverity::Error.as_str(), "error");
        assert_eq!(AlertSeverity::Critical.as_str(), "critical");
    }

    #[test]
    fn test_alert_severity_from_str() {
        assert_eq!(AlertSeverity::from_str("info"), Some(AlertSeverity::Info));
        assert_eq!(AlertSeverity::from_str("WARNING"), Some(AlertSeverity::Warning));
        assert_eq!(AlertSeverity::from_str("invalid"), None);
    }

    #[test]
    fn test_alert_state_as_str() {
        assert_eq!(AlertState::Open.as_str(), "open");
        assert_eq!(AlertState::Acknowledged.as_str(), "acknowledged");
        assert_eq!(AlertState::Resolved.as_str(), "resolved");
    }

    #[test]
    fn test_alert_new() {
        let alert = Alert::new(
            "Test alert".to_string(),
            AlertSeverity::Warning,
            Some("test".to_string()),
            None,
        );
        assert!(alert.id.is_none());
        assert_eq!(alert.message, "Test alert");
        assert_eq!(alert.severity, AlertSeverity::Warning);
        assert_eq!(alert.state, AlertState::Open);
    }

    #[test]
    fn test_alert_acknowledge() {
        let mut alert = Alert::new(
            "Test".to_string(),
            AlertSeverity::Info,
            None,
            None,
        );
        alert.acknowledge();
        assert_eq!(alert.state, AlertState::Acknowledged);
    }

    #[test]
    fn test_alert_resolve() {
        let mut alert = Alert::new(
            "Test".to_string(),
            AlertSeverity::Error,
            None,
            None,
        );
        alert.resolve();
        assert_eq!(alert.state, AlertState::Resolved);
    }
}
