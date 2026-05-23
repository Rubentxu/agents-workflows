//! Diagnostic type for validation results

use serde::{Deserialize, Serialize};
use std::fmt;

/// Represents a location in the source content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Location {
    /// Line number (1-indexed)
    pub line: usize,
    /// Column number (0-indexed, optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column: Option<usize>,
}

impl Location {
    pub fn new(line: usize, column: Option<usize>) -> Self {
        Self { line, column }
    }

    pub fn line(line: usize) -> Self {
        Self { line, column: None }
    }
}

impl fmt::Display for Location {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(col) = self.column {
            write!(f, "line {}, column {}", self.line, col)
        } else {
            write!(f, "line {}", self.line)
        }
    }
}

/// Severity level for diagnostics
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
    Info,
    Hint,
}

impl fmt::Display for Severity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Severity::Error => write!(f, "error"),
            Severity::Warning => write!(f, "warning"),
            Severity::Info => write!(f, "info"),
            Severity::Hint => write!(f, "hint"),
        }
    }
}

/// A single diagnostic (validation issue)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diagnostic {
    /// The severity level
    pub severity: Severity,
    /// Human-readable message
    pub message: String,
    /// Source location (if known)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<Location>,
    /// Machine-readable error code
    pub code: String,
}

impl Diagnostic {
    pub fn new(severity: Severity, message: String, location: Option<Location>, code: String) -> Self {
        Self {
            severity,
            message,
            location,
            code,
        }
    }

    pub fn error(message: impl Into<String>, location: Option<Location>, code: impl Into<String>) -> Self {
        Self::new(Severity::Error, message.into(), location, code.into())
    }

    pub fn warning(message: impl Into<String>, location: Option<Location>, code: impl Into<String>) -> Self {
        Self::new(Severity::Warning, message.into(), location, code.into())
    }

    pub fn info(message: impl Into<String>, location: Option<Location>, code: impl Into<String>) -> Self {
        Self::new(Severity::Info, message.into(), location, code.into())
    }

    pub fn hint(message: impl Into<String>, location: Option<Location>, code: impl Into<String>) -> Self {
        Self::new(Severity::Hint, message.into(), location, code.into())
    }
}

/// Collection of diagnostics with summary information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    /// ARN being validated
    pub arn: String,
    /// Type of resource
    #[serde(skip_serializing)]
    pub resource_type: super::ResourceType,
    /// All diagnostics found
    #[serde(default)]
    diagnostics: Vec<Diagnostic>,
    /// Parsed content (for downstream use)
    #[serde(skip_serializing)]
    parsed_content: Option<serde_yaml::Value>,
}

impl ValidationResult {
    pub fn new(arn: String, resource_type: super::ResourceType) -> Self {
        Self {
            arn,
            resource_type,
            diagnostics: Vec::new(),
            parsed_content: None,
        }
    }

    /// Add a diagnostic
    pub fn add_diagnostic(&mut self, diagnostic: Diagnostic) {
        self.diagnostics.push(diagnostic);
    }

    /// Merge another result into this one
    pub fn merge(&mut self, mut other: ValidationResult) {
        self.diagnostics.extend(other.diagnostics.drain(..));
        if self.parsed_content.is_none() {
            self.parsed_content = other.parsed_content;
        }
    }

    /// Get all diagnostics
    pub fn diagnostics(&self) -> &[Diagnostic] {
        &self.diagnostics
    }

    /// Get diagnostics by severity
    pub fn errors(&self) -> Vec<&Diagnostic> {
        self.diagnostics.iter().filter(|d| d.severity == Severity::Error).collect()
    }

    pub fn warnings(&self) -> Vec<&Diagnostic> {
        self.diagnostics.iter().filter(|d| d.severity == Severity::Warning).collect()
    }

    pub fn infos(&self) -> Vec<&Diagnostic> {
        self.diagnostics.iter().filter(|d| d.severity == Severity::Info).collect()
    }

    pub fn hints(&self) -> Vec<&Diagnostic> {
        self.diagnostics.iter().filter(|d| d.severity == Severity::Hint).collect()
    }

    /// Check if there are any errors
    pub fn has_errors(&self) -> bool {
        self.diagnostics.iter().any(|d| d.severity == Severity::Error)
    }

    /// Check if there are fatal errors (parse errors)
    pub fn has_fatal_errors(&self) -> bool {
        self.diagnostics.iter().any(|d| d.severity == Severity::Error && d.code == "YAML_SYNTAX")
    }

    /// Get the parsed content (if parsing succeeded)
    pub fn parsed_content(&self) -> &Option<serde_yaml::Value> {
        &self.parsed_content
    }

    /// Set parsed content (used by validators)
    pub fn set_parsed_content(&mut self, content: serde_yaml::Value) {
        self.parsed_content = Some(content);
    }

    /// Summary counts
    pub fn summary(&self) -> ValidationSummary {
        ValidationSummary {
            total: self.diagnostics.len(),
            errors: self.errors().len(),
            warnings: self.warnings().len(),
            infos: self.infos().len(),
            hints: self.hints().len(),
        }
    }

    /// Was validation successful (no errors)?
    pub fn is_valid(&self) -> bool {
        !self.has_errors()
    }
}

/// Summary of validation results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationSummary {
    pub total: usize,
    pub errors: usize,
    pub warnings: usize,
    pub infos: usize,
    pub hints: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diagnostic_factory() {
        let err = Diagnostic::error("test error", Some(Location::line(10)), "TEST_ERROR");
        assert_eq!(err.severity, Severity::Error);
        assert_eq!(err.message, "test error");
        assert_eq!(err.code, "TEST_ERROR");

        let warn = Diagnostic::warning("test warning", None, "TEST_WARN");
        assert_eq!(warn.severity, Severity::Warning);
    }

    #[test]
    fn test_validation_result_summary() {
        let mut result = ValidationResult::new(
            "arn:local:global:workflow/test".to_string(),
            super::super::ResourceType::Workflow,
        );

        result.add_diagnostic(Diagnostic::error("err1", None, "E1"));
        result.add_diagnostic(Diagnostic::warning("warn1", None, "W1"));
        result.add_diagnostic(Diagnostic::info("info1", None, "I1"));

        let summary = result.summary();
        assert_eq!(summary.total, 3);
        assert_eq!(summary.errors, 1);
        assert_eq!(summary.warnings, 1);
        assert_eq!(summary.infos, 1);
        assert!(!result.is_valid()); // Has errors
        assert!(result.has_errors());
    }

    #[test]
    fn test_has_fatal_errors() {
        let mut result = ValidationResult::new(
            "arn:local:global:workflow/test".to_string(),
            super::super::ResourceType::Workflow,
        );

        assert!(!result.has_fatal_errors());

        result.add_diagnostic(Diagnostic::error("yaml syntax error", Some(Location::line(1)), "YAML_SYNTAX"));
        assert!(result.has_fatal_errors());
    }
}
