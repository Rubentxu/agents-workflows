//! Registry Scanner - Discovers resources from filesystem

use crate::domain::{Arn, Node, NodeType, RegistryResult};
use crate::application::NodeService;
use std::path::Path;
use walkdir::WalkDir;
use blake3::Hasher;

/// Scanner for discovering resources from filesystem
pub struct RegistryScanner {
    _node_service: std::sync::Arc<NodeService>,
    workflows_path: String,
    skills_path: String,
}

impl RegistryScanner {
    pub fn new(
        node_service: std::sync::Arc<NodeService>,
        workflows_path: String,
        skills_path: String,
    ) -> Self {
        Self {
            _node_service: node_service,
            workflows_path,
            skills_path,
        }
    }

    /// Scan all directories and register found resources
    pub fn scan_all(&self) -> RegistryResult<Vec<Node>> {
        let mut nodes = Vec::new();

        nodes.extend(self.scan_workflows()?);
        nodes.extend(self.scan_skills()?);

        Ok(nodes)
    }

    /// Scan workflows directory
    pub fn scan_workflows(&self) -> RegistryResult<Vec<Node>> {
        let mut nodes = Vec::new();
        let path = Path::new(&self.workflows_path);

        if !path.exists() {
            return Ok(nodes);
        }

        for entry in WalkDir::new(path)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let file_path = entry.path();
            if file_path.extension().and_then(|s| s.to_str()) == Some("yaml") {
                if let Some(node) = self.discover_workflow(file_path)? {
                    nodes.push(node);
                }
            }
        }

        Ok(nodes)
    }

    /// Scan skills directory
    pub fn scan_skills(&self) -> RegistryResult<Vec<Node>> {
        let mut nodes = Vec::new();
        let path = Path::new(&self.skills_path);

        if !path.exists() {
            return Ok(nodes);
        }

        for entry in WalkDir::new(path)
            .max_depth(2)  // skill-name/SKILL.md
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let file_path = entry.path();
            if file_path.file_name().and_then(|s| s.to_str()) == Some("SKILL.md") {
                if let Some(node) = self.discover_skill(file_path)? {
                    nodes.push(node);
                }
            }
        }

        Ok(nodes)
    }

    fn discover_workflow(&self, path: &Path) -> RegistryResult<Option<Node>> {
        let path_str = path.to_string_lossy().to_string();

        // Extract ARN from path: workflows/{namespace}/{name}.yaml
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        let parent = path.parent().and_then(|p| p.file_name()).and_then(|s| s.to_str()).unwrap_or("");

        let arn = Arn::new(parent, "workflow", stem).to_string();
        let checksum = self.calculate_checksum(path)?;

        let mut node = Node::new(
            arn.clone(),
            NodeType::Workflow,
            stem.to_string(),
            "local".to_string(),
            parent.to_string(),
        )
        .with_path(path_str.clone())
        .with_checksum(checksum);

        node.config_json = Some(serde_json::json!({
            "arn": arn,
            "path": path_str.clone(),
        }).to_string());

        Ok(Some(node))
    }

    fn discover_skill(&self, path: &Path) -> RegistryResult<Option<Node>> {
        let path_str = path.to_string_lossy().to_string();

        // Extract skill name from directory: skills/{name}/SKILL.md
        let skill_dir = path.parent().and_then(|p| p.file_name()).and_then(|s| s.to_str()).unwrap_or("");
        let namespace = path.parent().and_then(|p| p.parent()).and_then(|p| p.file_name()).and_then(|s| s.to_str()).unwrap_or("local");

        let arn = Arn::new(namespace, "skill", skill_dir).to_string();
        let checksum = self.calculate_checksum(path)?;

        // Parse description from SKILL.md
        let description = self.extract_skill_description(path).unwrap_or_default();

        let mut node = Node::new(
            arn.clone(),
            NodeType::Skill,
            skill_dir.to_string(),
            "local".to_string(),
            namespace.to_string(),
        )
        .with_path(path_str)
        .with_checksum(checksum);

        node.config_json = Some(serde_json::json!({
            "arn": arn,
            "description": description,
            "namespace": namespace,
        }).to_string());

        Ok(Some(node))
    }

    fn calculate_checksum(&self, path: &Path) -> RegistryResult<String> {
        use std::io::Read;

        let mut file = std::fs::File::open(path)?;
        let mut hasher = Hasher::new();
        let mut buffer = [0u8; 8192];

        loop {
            let bytes_read = Read::read(&mut file, &mut buffer)?;
            if bytes_read == 0 {
                break;
            }
            hasher.update(&buffer[..bytes_read]);
        }

        Ok(hasher.finalize().to_hex().to_string())
    }

    fn extract_skill_description(&self, path: &Path) -> Option<String> {
        let content = std::fs::read_to_string(path).ok()?;
        let first_line = content.lines().nth(3)?; // After --- and name lines
        Some(first_line.trim().to_string())
    }
}
