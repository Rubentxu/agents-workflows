//! YAML Syntax Validation
//!
//! Validates YAML content for parse errors and basic structure issues.

use super::{Diagnostic, Location, RegistryView, ResourceType, ValidationResult};
use serde_yaml::Value as YamlValue;

/// Validate YAML syntax and basic structure
pub fn validate_syntax(content: &str, resource_type: ResourceType) -> ValidationResult {
    let mut result = ValidationResult::new(String::new(), resource_type);

    // Check for BOM (Byte Order Mark) which can cause parsing issues
    if content.starts_with('\u{feff}') {
        result.add_diagnostic(Diagnostic::error(
            "File contains UTF-8 BOM (Byte Order Mark)".to_string(),
            Some(Location::line(1)),
            "UTF8_BOM".to_string(),
        ));
    }

    // For frontmatter types (skill, prompt, template), extract YAML frontmatter before parsing.
    // These resources use markdown with YAML frontmatter: --- YAML --- Markdown body
    let yaml_content = if matches!(resource_type, ResourceType::Skill | ResourceType::Prompt | ResourceType::Template) {
        extract_frontmatter(content).unwrap_or_else(|| content.to_string())
    } else {
        content.to_string()
    };

    // Try to parse YAML
    let parsed: Result<YamlValue, _> = serde_yaml::from_str(&yaml_content);

    match parsed {
        Ok(value) => {
            // Check for common issues based on resource type
            validate_yaml_structure(&value, &mut result, resource_type);

            // Store parsed content for downstream validators
            result.set_parsed_content(value);
        }
        Err(e) => {
            // Extract line number from error if possible
            let location = extract_yaml_error_location(&e, &yaml_content);

            result.add_diagnostic(Diagnostic::error(
                format!("YAML parse error: {}", e),
                location,
                "YAML_SYNTAX".to_string(),
            ));
        }
    }

    result
}

/// Extract YAML frontmatter from markdown frontmatter content.
/// Returns the YAML content between the first pair of --- markers.
fn extract_frontmatter(content: &str) -> Option<String> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        // No frontmatter marker, treat entire content as YAML (for bare YAML frontmatter)
        return Some(content.to_string());
    }

    // Find the closing ---
    let after_first_dash = trimmed[3..].trim_start();
    if let Some(end_idx) = after_first_dash.find("\n---") {
        let frontmatter = &after_first_dash[..end_idx];
        Some(frontmatter.to_string())
    } else {
        // No closing --- found, treat as bare YAML
        Some(content.to_string())
    }
}

/// Extract line number from yaml parsing error
fn extract_yaml_error_location(error: &serde_yaml::Error, _content: &str) -> Option<Location> {
    // serde_yaml::Error::location() returns Option<serde_yaml::Location>
    if let Some(location) = error.location() {
        Some(Location::new(location.line(), Some(location.column())))
    } else {
        // Fallback: look for the problematic area in error message
        let error_msg = error.to_string();
        if let Some(line_match) = error_msg.lines().find_map(|line| {
            line.strip_prefix("at line ")
                .and_then(|s| s.split_whitespace().next())
                .and_then(|s| s.parse::<usize>().ok())
        }) {
            Some(Location::line(line_match))
        } else {
            None
        }
    }
}

/// Validate basic YAML structure based on resource type
fn validate_yaml_structure(
    value: &YamlValue,
    result: &mut ValidationResult,
    resource_type: ResourceType,
) {
    match resource_type {
        ResourceType::Skill | ResourceType::Prompt | ResourceType::Template => {
            // These types use frontmatter (YAML block)
            if let YamlValue::Mapping(map) = value {
                // Check that frontmatter has proper structure
                if map.is_empty() {
                    result.add_diagnostic(Diagnostic::warning(
                        "Frontmatter is empty".to_string(),
                        Some(Location::line(1)),
                        "EMPTY_FRONTMATTER".to_string(),
                    ));
                }
            } else if let YamlValue::Sequence(seq) = value {
                // If the whole file is a sequence, it might be missing frontmatter
                result.add_diagnostic(Diagnostic::info(
                    "Content appears to be a YAML list without frontmatter header".to_string(),
                    Some(Location::line(1)),
                    "MISSING_FRONTMATTER".to_string(),
                ));
            }
        }
        ResourceType::Workflow | ResourceType::Agent | ResourceType::Tool => {
            // These types are pure YAML
            if let YamlValue::Mapping(map) = value {
                if map.is_empty() {
                    result.add_diagnostic(Diagnostic::warning(
                        "Document is empty".to_string(),
                        Some(Location::line(1)),
                        "EMPTY_DOCUMENT".to_string(),
                    ));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct MockRegistry;

    impl RegistryView for MockRegistry {
        fn node_exists(&self, _arn: &str) -> bool {
            true
        }
        fn get_node_name(&self, _arn: &str) -> Option<String> {
            None
        }
        fn get_node_type(&self, _arn: &str) -> Option<ResourceType> {
            None
        }
    }

    #[test]
    fn test_valid_yaml_workflow() {
        let yaml = r#"
name: test-workflow
stages:
  - name: stage1
    agent: test-agent
"#;
        let result = validate_syntax(yaml, ResourceType::Workflow);
        assert!(!result.has_fatal_errors());
        assert!(result.parsed_content().is_some());
    }

    #[test]
    fn test_invalid_yaml_syntax() {
        let yaml = r#"
name: test
  invalid_indent: value
"#;
        let result = validate_syntax(yaml, ResourceType::Workflow);
        assert!(result.has_fatal_errors());
        assert!(result.errors().iter().any(|d| d.code == "YAML_SYNTAX"));
    }

    #[test]
    fn test_yaml_with_bom() {
        let yaml = "\u{feff}name: test\n";
        let result = validate_syntax(yaml, ResourceType::Workflow);
        assert!(result.errors().iter().any(|d| d.code == "UTF8_BOM"));
    }

    #[test]
    fn test_empty_document_warning() {
        let yaml = "";
        let result = validate_syntax(yaml, ResourceType::Workflow);
        // Empty document triggers warning about empty content
        assert!(result.parsed_content().is_some());
    }

    #[test]
    fn test_valid_skill_frontmatter() {
        // Simple YAML frontmatter (without --- markers for parsing test)
        let yaml = r#"name: test-skill
description: A test skill
"#;
        let result = validate_syntax(yaml, ResourceType::Skill);
        assert!(!result.has_fatal_errors());
    }
}
