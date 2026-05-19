//! ARN (Amazon Resource Name) value object and resolver
//!
//! New format: arn:local:{scope}:{type}/{name}
//!
//! Examples:
//! - arn:local:global:workflow/sdd-full
//! - arn:local:workspace/abc123:artifact/spec
//! - arn:local:global:skill/sdd-explore

use serde::{Deserialize, Serialize};
use regex::Regex;
use once_cell::sync::Lazy;

static ARN_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^arn:local:([^:]+):(\w+)/(.+)$").unwrap()
});

/// ARN value object - unique identifier for resources
///
/// New format: arn:local:{scope}:{type}/{name}
///
/// # Examples
/// - arn:local:global:workflow/sdd-full
/// - arn:local:workspace/abc123:artifact/spec
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct Arn {
    /// Scope of the resource: "global" or "workspace/{id}"
    pub scope: String,
    /// Resource type: workflow, agent, skill, prompt, tool, artifact, execution
    pub resource_type: String,
    /// Resource name
    pub name: String,
}

impl Arn {
    /// Parse an ARN string into an Arn value object
    ///
    /// Format: arn:local:{scope}:{type}/{name}
    ///
    /// # Examples
    /// - arn:local:global:workflow/sdd-full
    /// - arn:local:workspace/abc123:artifact/spec
    pub fn parse(s: &str) -> Option<Self> {
        let caps = ARN_REGEX.captures(s)?;
        Some(Arn {
            scope: caps.get(1)?.as_str().to_string(),
            resource_type: caps.get(2)?.as_str().to_string(),
            name: caps.get(3)?.as_str().to_string(),
        })
    }

    /// Format an Arn back to string representation
    pub fn to_string(&self) -> String {
        format!(
            "arn:local:{}:{}/{}",
            self.scope, self.resource_type, self.name
        )
    }

    /// Get the full ARN string
    pub fn as_str(&self) -> String {
        self.to_string()
    }

    /// Check if this ARN is for a global resource
    pub fn is_global(&self) -> bool {
        self.scope == "global"
    }

    /// Check if this ARN is for a workspace-scoped resource
    pub fn is_workspace(&self) -> bool {
        self.scope.starts_with("workspace/")
    }

    /// Extract the workspace ID if this is a workspace-scoped ARN
    ///
    /// Returns Some("abc123") for arn:local:workspace/abc123:workflow/test
    /// Returns None for arn:local:global:workflow/test
    pub fn workspace_id(&self) -> Option<String> {
        if self.scope.starts_with("workspace/") {
            Some(self.scope.strip_prefix("workspace/").unwrap().to_string())
        } else {
            None
        }
    }

    /// Build an ARN from its components
    pub fn new(scope: &str, resource_type: &str, name: &str) -> Self {
        Self {
            scope: scope.to_string(),
            resource_type: resource_type.to_string(),
            name: name.to_string(),
        }
    }
}

impl std::fmt::Display for Arn {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_arn_parse_global() {
        let arn = Arn::parse("arn:local:global:workflow/sdd-full").unwrap();
        assert_eq!(arn.scope, "global");
        assert_eq!(arn.resource_type, "workflow");
        assert_eq!(arn.name, "sdd-full");
    }

    #[test]
    fn test_arn_parse_workspace() {
        let arn = Arn::parse("arn:local:workspace/abc123:artifact/spec").unwrap();
        assert_eq!(arn.scope, "workspace/abc123");
        assert_eq!(arn.resource_type, "artifact");
        assert_eq!(arn.name, "spec");
    }

    #[test]
    fn test_arn_roundtrip() {
        let arn = Arn::parse("arn:local:global:skill/sdd-explore").unwrap();
        assert_eq!(arn.to_string(), "arn:local:global:skill/sdd-explore");
    }

    #[test]
    fn test_is_global() {
        let global_arn = Arn::parse("arn:local:global:workflow/test").unwrap();
        assert!(global_arn.is_global());
        assert!(!global_arn.is_workspace());

        let workspace_arn = Arn::parse("arn:local:workspace/abc:workflow/test").unwrap();
        assert!(!workspace_arn.is_global());
        assert!(workspace_arn.is_workspace());
    }

    #[test]
    fn test_workspace_id() {
        let arn = Arn::parse("arn:local:workspace/abc123:execution/run-001").unwrap();
        assert_eq!(arn.workspace_id(), Some("abc123".to_string()));

        let global_arn = Arn::parse("arn:local:global:workflow/test").unwrap();
        assert_eq!(global_arn.workspace_id(), None);
    }

    #[test]
    fn test_arn_new() {
        let arn = Arn::new("global", "workflow", "sdd-full");
        assert_eq!(arn.to_string(), "arn:local:global:workflow/sdd-full");
    }

    #[test]
    fn test_arn_invalid_format() {
        // Old format should not parse
        assert!(Arn::parse("workflow:arn://local/sdd-full").is_none());
        // Empty string should not parse
        assert!(Arn::parse("").is_none());
        // Invalid format
        assert!(Arn::parse("arn:invalid:format").is_none());
    }
}