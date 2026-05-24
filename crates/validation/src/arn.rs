//! ARN Reference Validation
//!
//! Validates that ARN references in content actually exist in the registry.
//! This catches broken references before runtime.

use super::{Diagnostic, RegistryView, ResourceType, ValidationResult};
use once_cell::sync::Lazy;
use regex::Regex;
use serde_yaml::Value as YamlValue;

static ARN_PATTERN: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"arn:local:[^:]+:[^/]+/[^:]+").unwrap());

/// Validate all ARN references in a document
pub fn validate_arn_references(
    value: &YamlValue,
    _self_arn: &str,
    _resource_type: ResourceType,
    registry: &dyn RegistryView,
) -> ValidationResult {
    let mut result = ValidationResult::new(String::new(), _resource_type);

    // Collect all ARN references from the document
    let arn_references = collect_arn_references(value);

    for arn_ref in arn_references {
        // Skip self-references
        if arn_ref == _self_arn {
            continue;
        }

        // Check if the referenced ARN exists
        if !registry.node_exists(&arn_ref) {
            result.add_diagnostic(Diagnostic::warning(
                format!("Referenced ARN '{}' does not exist in the registry", arn_ref),
                None,
                "UNRESOLVED_ARN".to_string(),
            ));
        }
    }

    result
}

/// Collect all ARN references from a YAML value recursively
fn collect_arn_references(value: &YamlValue) -> Vec<String> {
    let mut references = Vec::new();
    collect_arn_references_inner(value, &mut references);
    references
}

fn collect_arn_references_inner(value: &YamlValue, refs: &mut Vec<String>) {
    match value {
        YamlValue::Null => {}
        YamlValue::Bool(_) => {}
        YamlValue::Number(_) => {}
        YamlValue::String(s) => {
            // Check if the string contains an ARN
            if let Some(cap) = ARN_PATTERN.captures(s) {
                if let Some(arn) = cap.get(0) {
                    refs.push(arn.as_str().to_string());
                }
            }
        }
        YamlValue::Sequence(seq) => {
            for item in seq {
                collect_arn_references_inner(item, refs);
            }
        }
        YamlValue::Mapping(map) => {
            for (_key, val) in map {
                collect_arn_references_inner(val, refs);
            }
        }
        YamlValue::Tagged(tagged) => {
            collect_arn_references_inner(&tagged.value, refs);
        }
    }
}

/// ARN Resolver for validating and resolving ARN references
pub struct ArnResolver;

impl ArnResolver {
    /// Parse an ARN string and validate its format
    pub fn parse(arn: &str) -> Result<ArnComponents, String> {
        if !arn.starts_with("arn:local:") {
            return Err(format!("ARN must start with 'arn:local:', got: {}", arn));
        }

        // ARN format: arn:local:{scope}:{type}/{name}
        // where scope is "global" or "workspace/{id}"
        // Find the slash that separates type from name
        let slash_pos = arn.rfind('/').ok_or_else(|| {
            format!("ARN must have '/', got: {}", arn)
        })?;

        let after_prefix = &arn[10..slash_pos]; // skip "arn:local:"
        let name = &arn[slash_pos + 1..];

        // The part before the last colon before the slash is the type
        // The part before that is the scope
        let colon_pos = after_prefix.rfind(':').ok_or_else(|| {
            format!("ARN format is 'arn:local:{{scope}}:{{type}}/{{name}}', got: {}", arn)
        })?;

        let resource_type = &after_prefix[colon_pos + 1..];
        let scope = &after_prefix[..colon_pos];

        Ok(ArnComponents {
            arn: arn.to_string(),
            scope: scope.to_string(),
            resource_type: resource_type.to_string(),
            name: name.to_string(),
        })
    }

    /// Check if an ARN format is valid
    pub fn is_valid_format(arn: &str) -> bool {
        Self::parse(arn).is_ok()
    }
}

/// Parsed components of an ARN
#[derive(Debug, Clone)]
pub struct ArnComponents {
    pub arn: String,
    pub scope: String,
    pub resource_type: String,
    pub name: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    struct MockRegistry;

    impl RegistryView for MockRegistry {
        fn node_exists(&self, arn: &str) -> bool {
            // Only these ARNs exist in mock
            matches!(
                arn,
                "arn:local:global:agent/test-agent"
                    | "arn:local:global:prompt/test-prompt"
                    | "arn:local:global:skill/test-skill"
            )
        }

        fn get_node_name(&self, arn: &str) -> Option<String> {
            self.node_exists(arn)
                .then(|| arn.rsplit('/').next().unwrap().to_string())
        }

        fn get_node_type(&self, arn: &str) -> Option<ResourceType> {
            if !self.node_exists(arn) {
                return None;
            }
            if arn.contains("/agent/") {
                Some(ResourceType::Agent)
            } else if arn.contains("/prompt/") {
                Some(ResourceType::Prompt)
            } else if arn.contains("/skill/") {
                Some(ResourceType::Skill)
            } else {
                None
            }
        }
    }

    #[test]
    fn test_arn_resolver_parse() {
        let result = ArnResolver::parse("arn:local:global:workflow/test-workflow").unwrap();
        assert_eq!(result.scope, "global");
        assert_eq!(result.resource_type, "workflow");
        assert_eq!(result.name, "test-workflow");
    }

    #[test]
    fn test_arn_resolver_parse_with_colons_in_name() {
        let result =
            ArnResolver::parse("arn:local:workspace/my-ws:agent/my-agent").unwrap();
        assert_eq!(result.scope, "workspace/my-ws");
        assert_eq!(result.resource_type, "agent");
        assert_eq!(result.name, "my-agent");
    }

    #[test]
    fn test_arn_resolver_invalid() {
        assert!(ArnResolver::parse("invalid-arn").is_err());
        assert!(ArnResolver::parse("arn:other:format").is_err());
    }

    #[test]
    fn test_collect_arn_references() {
        let yaml: YamlValue = serde_yaml::from_str(
            r#"
agent: arn:local:global:agent/test-agent
prompts:
  - arn:local:global:prompt/test-prompt
  - arn:local:global:prompt/nonexistent
"#,
        )
        .unwrap();

        let refs = collect_arn_references(&yaml);
        assert!(refs.contains(&"arn:local:global:agent/test-agent".to_string()));
        assert!(refs.contains(&"arn:local:global:prompt/test-prompt".to_string()));
        assert!(refs.contains(&"arn:local:global:prompt/nonexistent".to_string()));
    }

    #[test]
    fn test_validate_arn_references() {
        let yaml: YamlValue = serde_yaml::from_str(
            r#"
agent: arn:local:global:agent/test-agent
"#,
        )
        .unwrap();

        let registry = MockRegistry;
        let result = validate_arn_references(&yaml, "arn:local:global:workflow/test", ResourceType::Workflow, &registry);

        // test-agent exists, so no warning
        assert!(result.warnings().is_empty());
    }

    #[test]
    fn test_validate_arn_references_unresolved() {
        let yaml: YamlValue = serde_yaml::from_str(
            r#"
agent: arn:local:global:agent/nonexistent-agent
"#,
        )
        .unwrap();

        let registry = MockRegistry;
        let result = validate_arn_references(&yaml, "arn:local:global:workflow/test", ResourceType::Workflow, &registry);

        // nonexistent-agent does not exist, so warning
        let has_unresolved = result
            .warnings()
            .iter()
            .any(|d| d.code == "UNRESOLVED_ARN");
        assert!(has_unresolved);
    }

    #[test]
    fn test_arn_pattern_regex() {
        // Valid ARNs
        assert!(ARN_PATTERN.is_match("arn:local:global:workflow/test"));
        assert!(ARN_PATTERN.is_match("arn:local:workspace/abc:agent/test"));
        assert!(ARN_PATTERN.is_match("arn:local:global:skill/my-skill"));

        // Invalid - wrong prefix
        assert!(!ARN_PATTERN.is_match("arn:aws:s3:::bucket/key"));

        // Invalid - missing parts
        assert!(!ARN_PATTERN.is_match("arn:local:global"));
    }
}
