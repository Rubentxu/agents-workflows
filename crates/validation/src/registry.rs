//! Registry View Trait
//!
//! Abstracts access to the registry for validation purposes.
//! Implementations can query the actual registry or use mock data for testing.

use super::ResourceType;

/// Trait for accessing registry data during validation.
///
/// This allows the validation layer to be decoupled from the actual registry
/// implementation. The mcp-server provides an implementation that queries
/// the real registry, while tests can use mock implementations.
pub trait RegistryView: Send + Sync {
    /// Check if a node with the given ARN exists
    fn node_exists(&self, arn: &str) -> bool;

    /// Get the name of a node by ARN
    fn get_node_name(&self, arn: &str) -> Option<String>;

    /// Get the type of a node by ARN
    fn get_node_type(&self, arn: &str) -> Option<ResourceType>;

    /// List all ARNs of a given type (for autocomplete validation)
    fn list_by_type(&self, resource_type: ResourceType) -> Vec<String> {
        let _ = resource_type;
        vec![] // Default: empty
    }

    /// Get the file path for an ARN (for future file-based validation)
    fn get_file_path(&self, arn: &str) -> Option<String> {
        let _ = arn;
        None // Default: unknown
    }
}

/// Default implementation for RegistryView that always returns false
impl<T: RegistryView + ?Sized> RegistryView for &T {
    fn node_exists(&self, arn: &str) -> bool {
        (**self).node_exists(arn)
    }

    fn get_node_name(&self, arn: &str) -> Option<String> {
        (**self).get_node_name(arn)
    }

    fn get_node_type(&self, arn: &str) -> Option<ResourceType> {
        (**self).get_node_type(arn)
    }

    fn list_by_type(&self, resource_type: ResourceType) -> Vec<String> {
        (**self).list_by_type(resource_type)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct MockRegistry {
        nodes: Vec<&'static str>,
    }

    impl MockRegistry {
        fn new(nodes: &[&'static str]) -> Self {
            Self {
                nodes: nodes.to_vec(),
            }
        }
    }

    impl RegistryView for MockRegistry {
        fn node_exists(&self, arn: &str) -> bool {
            self.nodes.contains(&arn)
        }

        fn get_node_name(&self, arn: &str) -> Option<String> {
            if self.node_exists(arn) {
                arn.rsplit('/').next().map(|s| s.to_string())
            } else {
                None
            }
        }

        fn get_node_type(&self, arn: &str) -> Option<ResourceType> {
            if !self.node_exists(arn) {
                return None;
            }
            if arn.contains(":workflow/") {
                Some(ResourceType::Workflow)
            } else if arn.contains(":agent/") {
                Some(ResourceType::Agent)
            } else {
                None
            }
        }
    }

    #[test]
    fn test_mock_registry_exists() {
        let registry = MockRegistry::new(&[
            "arn:local:global:workflow/test",
            "arn:local:global:agent/my-agent",
        ]);

        assert!(registry.node_exists("arn:local:global:workflow/test"));
        assert!(!registry.node_exists("arn:local:global:workflow/nonexistent"));
    }

    #[test]
    fn test_mock_registry_get_name() {
        let registry = MockRegistry::new(&["arn:local:global:workflow/test"]);

        assert_eq!(registry.get_node_name("arn:local:global:workflow/test"), Some("test".to_string()));
        assert_eq!(registry.get_node_name("arn:local:global:workflow/nonexistent"), None);
    }

    #[test]
    fn test_mock_registry_get_type() {
        let registry = MockRegistry::new(&[
            "arn:local:global:workflow/test",
            "arn:local:global:agent/my-agent",
        ]);

        // MockRegistry detects workflow and agent
        assert_eq!(registry.get_node_type("arn:local:global:workflow/test"), Some(ResourceType::Workflow));
        assert_eq!(registry.get_node_type("arn:local:global:agent/my-agent"), Some(ResourceType::Agent));
        assert_eq!(registry.get_node_type("arn:local:global:workflow/nonexistent"), None);
    }
}
