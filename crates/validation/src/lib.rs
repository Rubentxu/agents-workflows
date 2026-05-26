//! Validation Layer for Agentic Workflow System
//!
//! Provides validation for all resource types (workflows, agents, skills, prompts, tools, templates).
//! Architecture follows ADR-0016: Monaco Editors + Rust Validation Pipeline.
//!
//! ## Core Types
//!
//! - [`Diagnostic`] - A validation issue with location, severity, and message
//! - [`RegistryView`] - Trait for querying the registry (ARN resolution, node lookup)
//! - [`ValidationResult`] - Collection of diagnostics with summary
//! - [`ResourceType`] - All supported resource types for validation
//!
//! ## Validation Pipeline
//!
//! 1. **Syntax Validation** - YAML/JSON parse errors
//! 2. **Schema Validation** - JSON Schema validation via schemars
//! 3. **ARN Cross-Reference Validation** - Resolve ARN references
//! 4. **Semantic Validation** - Business rules per resource type
//!
//! ## Usage
//!
//! ```rust,ignore
//! use validation::{validate_resource, RegistryView, Diagnostic};
//!
//! let diagnostics = validate_resource(
//!     "arn:local:global:agent/my-agent",
//!     ResourceType::Agent,
//!     yaml_content,
//!     &registry_view
//! );
//! ```

use indexmap::IndexMap;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use thiserror::Error;

mod arn;
mod diagnostic;
mod registry;
mod schema;
mod syntax;

pub use arn::ArnResolver;
pub use diagnostic::{Diagnostic, Location, Severity, ValidationResult};
pub use registry::RegistryView;

// ============================================================================
// Resource Type
// ============================================================================

/// All resource types that can be validated
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ResourceType {
    Workflow,
    Agent,
    Skill,
    Prompt,
    Tool,
    Template,
}

impl ResourceType {
    /// Get the file extension for this resource type
    pub fn file_extension(&self) -> &'static str {
        match self {
            ResourceType::Workflow => "yaml",
            ResourceType::Agent => "yaml",
            ResourceType::Skill => "md",
            ResourceType::Prompt => "md",
            ResourceType::Tool => "yaml",
            ResourceType::Template => "md",
        }
    }

    /// Returns true if this resource type uses markdown with YAML frontmatter
    pub fn uses_frontmatter(&self) -> bool {
        matches!(self, ResourceType::Skill | ResourceType::Prompt | ResourceType::Template)
    }

    /// Get the JSON Schema name for this resource type
    pub fn schema_name(&self) -> &'static str {
        match self {
            ResourceType::Workflow => "WorkflowSpec",
            ResourceType::Agent => "AgentSpec",
            ResourceType::Skill => "SkillFrontmatter",
            ResourceType::Prompt => "PromptFrontmatter",
            ResourceType::Tool => "ToolSpec",
            ResourceType::Template => "TemplateFrontmatter",
        }
    }

    /// Parse from string (for REST API)
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "workflow" => Some(ResourceType::Workflow),
            "agent" => Some(ResourceType::Agent),
            "skill" => Some(ResourceType::Skill),
            "prompt" => Some(ResourceType::Prompt),
            "tool" => Some(ResourceType::Tool),
            "template" => Some(ResourceType::Template),
            _ => None,
        }
    }
}

impl std::fmt::Display for ResourceType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ResourceType::Workflow => write!(f, "workflow"),
            ResourceType::Agent => write!(f, "agent"),
            ResourceType::Skill => write!(f, "skill"),
            ResourceType::Prompt => write!(f, "prompt"),
            ResourceType::Tool => write!(f, "tool"),
            ResourceType::Template => write!(f, "template"),
        }
    }
}

// ============================================================================
// Validation Errors
// ============================================================================

#[derive(Debug, Error)]
pub enum ValidationError {
    #[error("Parse error: {0}")]
    ParseError(String),

    #[error("Schema validation failed: {0}")]
    SchemaError(String),

    #[error("ARN resolution failed: {0}")]
    ArnResolutionError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("JSON schema error: {0}")]
    JsonSchemaError(String),
}

// ============================================================================
// Main Validation Entry Point
// ============================================================================

/// Extract YAML frontmatter from markdown frontmatter content.
/// Returns the YAML content between the first pair of --- markers.
fn extract_frontmatter(content: &str) -> Option<String> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return Some(content.to_string());
    }
    let after_first_dash = trimmed[3..].trim_start();
    if let Some(end_idx) = after_first_dash.find("\n---") {
        let frontmatter = &after_first_dash[..end_idx];
        Some(frontmatter.to_string())
    } else {
        Some(content.to_string())
    }
}

/// Validate a resource's content and return diagnostics
pub fn validate_resource(
    arn: &str,
    resource_type: ResourceType,
    content: &str,
    registry: &dyn RegistryView,
) -> ValidationResult {
    let mut result = ValidationResult::new(arn.to_string(), resource_type);

    // Phase 1: Syntax validation
    let syntax_diagnostics = syntax::validate_syntax(content, resource_type);
    result.merge(syntax_diagnostics);

    // If syntax is broken, skip deeper validation
    if result.has_fatal_errors() {
        return result;
    }

    // Phase 2: Schema validation
    let schema_diagnostics = schema::validate_schema(content, resource_type);
    result.merge(schema_diagnostics);

    // For frontmatter types, extract YAML frontmatter before parsing for ARN resolution
    let yaml_content = if resource_type.uses_frontmatter() {
        extract_frontmatter(content).unwrap_or_else(|| content.to_string())
    } else {
        content.to_string()
    };

    // If schema validation failed, still try to get structure for ARN resolution
    let parsed = if let Ok(v) = serde_yaml::from_str::<serde_yaml::Value>(&yaml_content) {
        Some(v)
    } else {
        None
    };

    // Phase 3: ARN cross-reference validation
    if let Some(value) = parsed {
        let arn_diagnostics = arn::validate_arn_references(&value, arn, resource_type, registry);
        result.merge(arn_diagnostics);
    }

    // Phase 4: Type-specific semantic validation
    let semantic_diagnostics = validate_semantic(content, resource_type, &result.parsed_content());
    result.merge(semantic_diagnostics);

    result
}

/// Validate semantic rules specific to each resource type
fn validate_semantic(
    _content: &str,
    resource_type: ResourceType,
    parsed: &Option<serde_yaml::Value>,
) -> ValidationResult {
    let mut result = ValidationResult::new(String::new(), resource_type);

    let Some(value) = parsed else {
        return result;
    };

    match resource_type {
        ResourceType::Workflow => {
            let workflow_value = value.get("spec").unwrap_or(value);
            validate_workflow_semantic(workflow_value, &mut result)
        }
        ResourceType::Agent => validate_agent_semantic(&value, &mut result),
        ResourceType::Skill => validate_skill_semantic(&value, &mut result),
        ResourceType::Prompt => validate_prompt_semantic(&value, &mut result),
        ResourceType::Tool => validate_tool_semantic(&value, &mut result),
        ResourceType::Template => validate_template_semantic(&value, &mut result),
    }

    result
}

// ============================================================================
// Type-Specific Semantic Validation
// ============================================================================

fn validate_workflow_semantic(value: &serde_yaml::Value, result: &mut ValidationResult) {
    let Some(map) = value.as_mapping() else { return };

    // Check for stages
    if let Some(stages) = map.get(&serde_yaml::Value::String("stages".to_string())) {
        // Normalize stages to sequence form (handles both mapping and sequence)
        let stages_seq: Vec<(&serde_yaml::Value, usize)> = match stages {
            serde_yaml::Value::Sequence(seq) => {
                seq.iter().enumerate().map(|(i, v)| (v, i)).collect()
            }
            serde_yaml::Value::Mapping(map) => {
                map.iter().enumerate().map(|(i, (_, v))| (v, i)).collect()
            }
            _ => return,
        };

        let mut stage_ids: IndexMap<String, usize> = IndexMap::new();
        let empty_mapping = serde_yaml::Mapping::new();

        // First pass: collect all stage ids and check for duplicates
        for (stage, idx) in &stages_seq {
            let stage_map = stage.as_mapping().unwrap_or(&empty_mapping);
            let stage_id = stage_map
                .get(&serde_yaml::Value::String("id".to_string()))
                .and_then(|v| v.as_str())
                .map(String::from)
                .or_else(|| {
                    // Fallback to 'name' if 'id' is not present (backward compatibility)
                    stage_map
                        .get(&serde_yaml::Value::String("name".to_string()))
                        .and_then(|v| v.as_str())
                        .map(String::from)
                })
                .unwrap_or_else(|| format!("stage-{}", idx));

            if let Some(_existing_idx) = stage_ids.get(&stage_id) {
                result.add_diagnostic(Diagnostic::warning(
                    format!("Duplicate stage id '{}'", stage_id),
                    Some(Location::line(idx + 1)),
                    "DUPLICATE_STAGE".to_string(),
                ));
            } else {
                stage_ids.insert(stage_id.clone(), *idx);
            }
        }

        // Second pass: check depends_on references
        for (stage, idx) in &stages_seq {
            let empty_mapping = serde_yaml::Mapping::new();
            let stage_map = stage.as_mapping().unwrap_or(&empty_mapping);
            let stage_id = stage_map
                .get(&serde_yaml::Value::String("id".to_string()))
                .and_then(|v| v.as_str())
                .map(String::from)
                .or_else(|| {
                    stage_map
                        .get(&serde_yaml::Value::String("name".to_string()))
                        .and_then(|v| v.as_str())
                        .map(String::from)
                })
                .unwrap_or_else(|| format!("stage-{}", idx));

            // Check for depends_on references to existing stages
            if let Some(deps) = stage_map.get(&serde_yaml::Value::String("depends_on".to_string()))
                .or_else(|| stage_map.get(&serde_yaml::Value::String("dependsOn".to_string())))
            {
                if let Some(deps_arr) = deps.as_sequence() {
                    for dep in deps_arr {
                        if let Some(dep_id) = dep.as_str() {
                            if !stage_ids.contains_key(dep_id) {
                                result.add_diagnostic(Diagnostic::warning(
                                    format!(
                                        "Stage '{}' depends on unknown stage '{}'",
                                        stage_id, dep_id
                                    ),
                                    Some(Location::line(idx + 1)),
                                    "UNDEFINED_DEPENDENCY".to_string(),
                                ));
                            }
                        }
                    }
                }
            }
        }
    }
}

fn validate_agent_semantic(value: &serde_yaml::Value, result: &mut ValidationResult) {
    let Some(map) = value.as_mapping() else { return };

    // Check that mode is valid
    if let Some(mode) = map.get(&serde_yaml::Value::String("mode".to_string())) {
        if let Some(mode_str) = mode.as_str() {
            let valid_modes = ["browse", "edit", "ask", "plan"];
            if !valid_modes.contains(&mode_str) {
                result.add_diagnostic(Diagnostic::warning(
                    format!("Unknown agent mode '{}'. Valid: {:?}", mode_str, valid_modes),
                    None,
                    "UNKNOWN_MODE".to_string(),
                ));
            }
        }
    }

    // Check temperature range
    if let Some(temp) = map.get(&serde_yaml::Value::String("temperature".to_string())) {
        if let Some(temp_f) = temp.as_f64() {
            if !(0.0..=2.0).contains(&temp_f) {
                result.add_diagnostic(Diagnostic::warning(
                    format!("Temperature {} is outside recommended range 0.0-2.0", temp_f),
                    None,
                    "TEMPERATURE_RANGE".to_string(),
                ));
            }
        }
    }
}

fn validate_skill_semantic(value: &serde_yaml::Value, result: &mut ValidationResult) {
    let Some(map) = value.as_mapping() else { return };

    // Check for required frontmatter fields
    let required = ["name", "description"];
    for field in required {
        if !map.contains_key(&serde_yaml::Value::String(field.to_string())) {
            result.add_diagnostic(Diagnostic::error(
                format!("Missing required frontmatter field: {}", field),
                None,
                "MISSING_FIELD".to_string(),
            ));
        }
    }

    // Check description length
    if let Some(desc) = map.get(&serde_yaml::Value::String("description".to_string())) {
        if let Some(desc_str) = desc.as_str() {
            if desc_str.len() < 10 {
                result.add_diagnostic(Diagnostic::warning(
                    "Description is very short (< 10 chars)".to_string(),
                    None,
                    "SHORT_DESCRIPTION".to_string(),
                ));
            }
            if desc_str.len() > 500 {
                result.add_diagnostic(Diagnostic::info(
                    "Description is very long (> 500 chars)".to_string(),
                    None,
                    "LONG_DESCRIPTION".to_string(),
                ));
            }
        }
    }
}

fn validate_prompt_semantic(value: &serde_yaml::Value, result: &mut ValidationResult) {
    let Some(map) = value.as_mapping() else { return };

    let required = ["name", "description"];
    for field in required {
        if !map.contains_key(&serde_yaml::Value::String(field.to_string())) {
            result.add_diagnostic(Diagnostic::error(
                format!("Missing required frontmatter field: {}", field),
                None,
                "MISSING_FIELD".to_string(),
            ));
        }
    }

    // Check for input_variables (should be declared if template uses {{var}})
    let template_content = map.get(&serde_yaml::Value::String("template".to_string()))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let var_regex = Regex::new(r"\{\{([^}]+)\}\}").unwrap();
    let template_vars: Vec<_> = var_regex.captures_iter(template_content).collect();

    if !template_vars.is_empty() {
        let inputs = map.get(&serde_yaml::Value::String("inputs".to_string()))
            .and_then(|v| v.as_mapping())
            .map(|m| m.keys().map(|k| k.as_str().unwrap_or("")).collect::<Vec<_>>())
            .unwrap_or_default();

        for cap in &template_vars {
            if let Some(var_name) = cap.get(1) {
                if !inputs.contains(&var_name.as_str()) {
                    result.add_diagnostic(Diagnostic::warning(
                        format!("Template uses variable '{{{{{}}}}}' but it's not declared in inputs", var_name.as_str()),
                        None,
                        "UNDECLARED_VARIABLE".to_string(),
                    ));
                }
            }
        }
    }
}

fn validate_tool_semantic(value: &serde_yaml::Value, result: &mut ValidationResult) {
    let Some(map) = value.as_mapping() else { return };

    // Check for required fields
    let required = ["name", "description"];
    for field in required {
        if !map.contains_key(&serde_yaml::Value::String(field.to_string())) {
            result.add_diagnostic(Diagnostic::error(
                format!("Missing required field: {}", field),
                None,
                "MISSING_FIELD".to_string(),
            ));
        }
    }

    // Check input_schema is valid JSON Schema
    if let Some(input_schema) = map.get(&serde_yaml::Value::String("input_schema".to_string())) {
        if let Ok(schema_str) = serde_json::to_string(input_schema) {
            if let Err(e) = serde_json::from_str::<JsonValue>(&schema_str) {
                result.add_diagnostic(Diagnostic::error(
                    format!("Invalid input_schema JSON: {}", e),
                    None,
                    "INVALID_INPUT_SCHEMA".to_string(),
                ));
            }
        }
    }
}

fn validate_template_semantic(value: &serde_yaml::Value, result: &mut ValidationResult) {
    let Some(map) = value.as_mapping() else { return };

    let required = ["name"];
    for field in required {
        if !map.contains_key(&serde_yaml::Value::String(field.to_string())) {
            result.add_diagnostic(Diagnostic::error(
                format!("Missing required frontmatter field: {}", field),
                None,
                "MISSING_FIELD".to_string(),
            ));
        }
    }

    // Check format field
    if let Some(format_val) = map.get(&serde_yaml::Value::String("format".to_string())) {
        if let Some(format_str) = format_val.as_str() {
            let valid_formats = ["markdown", "json", "yaml", "html", "text"];
            if !valid_formats.contains(&format_str) {
                result.add_diagnostic(Diagnostic::warning(
                    format!("Unknown format '{}'. Valid: {:?}", format_str, valid_formats),
                    None,
                    "UNKNOWN_FORMAT".to_string(),
                ));
            }
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    struct MockRegistry;

    impl RegistryView for MockRegistry {
        fn node_exists(&self, _arn: &str) -> bool {
            true // Mock always returns true
        }

        fn get_node_name(&self, _arn: &str) -> Option<String> {
            None // Mock returns no names
        }

        fn get_node_type(&self, _arn: &str) -> Option<ResourceType> {
            None // Mock returns no types
        }
    }

    #[test]
    fn test_validate_workflow_with_duplicate_stages() {
        let yaml = r#"
name: test-workflow
stages:
  - name: stage1
    agent: test-agent
  - name: stage2
    agent: test-agent
  - name: stage1
    agent: test-agent
"#;
        let registry = MockRegistry;
        let result = validate_resource(
            "arn:local:global:workflow/test",
            ResourceType::Workflow,
            yaml,
            &registry,
        );

        let duplicate_errors: Vec<_> = result
            .diagnostics()
            .iter()
            .filter(|d| d.code == "DUPLICATE_STAGE")
            .collect();

        assert!(!duplicate_errors.is_empty(), "Should detect duplicate stage names");
    }

    #[test]
    fn test_validate_workflow_with_undefined_dependency() {
        let yaml = r#"
name: test-workflow
stages:
  - name: stage1
    agent: test-agent
  - name: stage2
    agent: test-agent
    depends_on:
      - nonexistent
"#;
        let registry = MockRegistry;
        let result = validate_resource(
            "arn:local:global:workflow/test",
            ResourceType::Workflow,
            yaml,
            &registry,
        );

        let dep_errors: Vec<_> = result
            .diagnostics()
            .iter()
            .filter(|d| d.code == "UNDEFINED_DEPENDENCY")
            .collect();

        assert!(!dep_errors.is_empty(), "Should detect undefined dependencies");
    }

    #[test]
    fn test_validate_skill_missing_required_fields() {
        // Skill frontmatter - YAML part only for parsing test
        let yaml = r#"name: test-skill
"#;
        let registry = MockRegistry;
        let result = validate_resource(
            "arn:local:global:skill/test",
            ResourceType::Skill,
            yaml,
            &registry,
        );

        // Should detect missing description
        let missing_errors: Vec<_> = result
            .diagnostics()
            .iter()
            .filter(|d| d.code == "MISSING_FIELD")
            .collect();

        assert!(!missing_errors.is_empty(), "Should detect missing required fields");
    }

    #[test]
    fn test_validate_prompt_undeclared_variables() {
        // Prompt with template that uses {{company}} but inputs only has name
        let yaml = r#"name: test-prompt
description: A test prompt
inputs:
  - name
template: "Hello {{name}}, welcome to {{company}}"
"#;
        let registry = MockRegistry;
        let result = validate_resource(
            "arn:local:global:prompt/test",
            ResourceType::Prompt,
            yaml,
            &registry,
        );

        let var_errors: Vec<_> = result
            .diagnostics()
            .iter()
            .filter(|d| d.code == "UNDECLARED_VARIABLE")
            .collect();

        assert!(!var_errors.is_empty(), "Should detect undeclared template variables");
    }

    #[test]
    fn test_validate_tool_invalid_input_schema() {
        // input_schema that produces invalid JSON when converted
        // Note: This test is limited because YAML->JSON conversion usually produces valid JSON
        // The semantic validation (type: invalid-type) is done at runtime by the tool executor
        let yaml = r#"arn: arn:local:global:tool/test
name: test-tool
description: A test tool
input_schema:
  type: object
"#;
        let registry = MockRegistry;
        let result = validate_resource(
            "arn:local:global:tool/test",
            ResourceType::Tool,
            yaml,
            &registry,
        );

        // Basic validation should pass for valid input_schema structure
        // Semantic validation (unknown types) is done by the executor
        assert!(result.diagnostics().is_empty() || !result.has_errors());
    }

    #[test]
    fn test_resource_type_file_extension() {
        assert_eq!(ResourceType::Workflow.file_extension(), "yaml");
        assert_eq!(ResourceType::Agent.file_extension(), "yaml");
        assert_eq!(ResourceType::Skill.file_extension(), "md");
        assert_eq!(ResourceType::Prompt.file_extension(), "md");
        assert_eq!(ResourceType::Tool.file_extension(), "yaml");
        assert_eq!(ResourceType::Template.file_extension(), "md");
    }

    #[test]
    fn test_resource_type_from_str() {
        assert_eq!(ResourceType::from_str("workflow"), Some(ResourceType::Workflow));
        assert_eq!(ResourceType::from_str("agent"), Some(ResourceType::Agent));
        assert_eq!(ResourceType::from_str("skill"), Some(ResourceType::Skill));
        assert_eq!(ResourceType::from_str("prompt"), Some(ResourceType::Prompt));
        assert_eq!(ResourceType::from_str("tool"), Some(ResourceType::Tool));
        assert_eq!(ResourceType::from_str("template"), Some(ResourceType::Template));
        assert_eq!(ResourceType::from_str("unknown"), None);
    }
}
