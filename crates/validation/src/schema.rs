//! JSON Schema Validation
//!
//! Validates YAML content structure against schemars-generated JSON Schema.
//! Uses the schemas from the `schema` crate which are generated from Rust types via `#[derive(JsonSchema)]`.

use super::{Diagnostic, Location, ResourceType, ValidationResult};
use jsonschema::{Draft, JSONSchema};
use schema::SchemaType;

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

/// Map validation::ResourceType to schema::SchemaType
fn to_schema_type(resource_type: ResourceType) -> Option<SchemaType> {
    match resource_type {
        ResourceType::Workflow => Some(SchemaType::Workflow),
        ResourceType::Agent => Some(SchemaType::Agent),
        ResourceType::Skill => Some(SchemaType::Skill),
        ResourceType::Prompt => Some(SchemaType::Prompt),
        ResourceType::Tool => Some(SchemaType::Tool),
        ResourceType::Template => Some(SchemaType::Template),
    }
}

/// Validate content against schemars-generated JSON Schema
pub fn validate_schema(
    content: &str,
    resource_type: ResourceType,
) -> ValidationResult {
    let mut result = ValidationResult::new(String::new(), resource_type);

    // For frontmatter types (skill, prompt, template), extract YAML frontmatter before parsing.
    let yaml_content = if matches!(resource_type, ResourceType::Skill | ResourceType::Prompt | ResourceType::Template) {
        extract_frontmatter(content).unwrap_or_else(|| content.to_string())
    } else {
        content.to_string()
    };

    // Parse YAML to JSON
    let yaml_parsed = serde_yaml::from_str::<serde_yaml::Value>(&yaml_content);

    // Studio persists workflows as full manifests:
    //   apiVersion/kind/metadata/spec
    // while the schema crate currently exposes a DTO-style `WorkflowSpec` schema
    // with top-level fields like `arn` and `name`.
    // Until those two representations are unified, treat manifest-style workflows
    // as schema-valid here and rely on syntax + semantic + ARN validation.
    if matches!(resource_type, ResourceType::Workflow) {
        if let Ok(ref v) = yaml_parsed {
            if v.get("spec").is_some() && v.get("kind").is_some() {
                return result;
            }
        }
    }

    let json_value: serde_json::Value = match yaml_parsed {
        Ok(ref v) => match serde_json::to_value(if matches!(resource_type, ResourceType::Workflow) {
            // Studio persists workflows as full manifests with a top-level `spec` wrapper,
            // while the schema for workflows is generated from `WorkflowSpec`.
            // Accept both forms by validating `spec` when present.
            v.get("spec").unwrap_or(v)
        } else {
            v
        }) {
            Ok(jv) => jv,
            Err(e) => {
                result.add_diagnostic(Diagnostic::error(
                    format!("Failed to convert YAML to JSON for schema validation: {}", e),
                    None,
                    "SCHEMA_CONVERSION_ERROR".to_string(),
                ));
                return result;
            }
        },
        Err(_) => return result, // Syntax errors handled by syntax validator
    };

    // Get the schemars-generated schema for this resource type
    let schema_type = match to_schema_type(resource_type) {
        Some(t) => t,
        None => return result,
    };

    let schema_json = match schema::get_schema_for_type(schema_type) {
        Some(s) => s,
        None => return result,
    };

    // Compile JSON Schema
    let compiled_schema = match JSONSchema::options()
        .with_draft(Draft::Draft7)
        .compile(&schema_json)
    {
        Ok(cs) => cs,
        Err(e) => {
            result.add_diagnostic(Diagnostic::error(
                format!("Failed to compile JSON Schema: {}", e),
                None,
                "SCHEMA_COMPILE_ERROR".to_string(),
            ));
            return result;
        }
    };

    // Validate the JSON value against the schema
    let validation_result = compiled_schema.validate(&json_value);

    if let Err(errors) = validation_result {
        for error in errors {
            // Determine the path/location from the JSON path in the error message
            // JSONPointer is empty when iter().next() is None
            let location = if error.instance_path.iter().next().is_none() {
                None
            } else {
                // Try to extract line number from the path or use a reasonable default
                Some(Location::line(1))
            };

            result.add_diagnostic(Diagnostic::error(
                format!("{}", error),
                location,
                "SCHEMA_VALIDATION_ERROR".to_string(),
            ));
        }
    }

    // Store parsed content for downstream validators (syntax errors already returned above)
    if let Ok(yaml) = yaml_parsed {
        result.set_parsed_content(yaml);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_frontmatter() {
        let content = r#"---
name: test-skill
description: A test skill
---
This is the body.
"#;
        let fm = extract_frontmatter(content);
        assert!(fm.is_some());
        assert!(fm.unwrap().contains("name: test-skill"));
    }
}
