use std::path::PathBuf;
use std::fs;
use serde::{Deserialize, Serialize};
use registry::domain::{Node, NodeType};
use registry::application::node_service::NodeService;
use registry::infrastructure::db::Database;
use std::sync::Arc;

/// Bootstrap service for initializing ~/.workflows directory
pub struct BootstrapService {
    workspace_root: PathBuf,
}

impl BootstrapService {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self { workspace_root }
    }

    /// Get the global workflows directory
    pub fn global_dir(&self) -> PathBuf {
        self.workspace_root.join("global")
    }

    /// Get the workflows subdirectory
    pub fn workflows_dir(&self) -> PathBuf {
        self.global_dir().join("workflows")
    }

    /// Get the agents subdirectory
    pub fn agents_dir(&self) -> PathBuf {
        self.global_dir().join("agents")
    }

    /// Get the skills subdirectory
    pub fn skills_dir(&self) -> PathBuf {
        self.global_dir().join("skills")
    }

    /// Get the prompts subdirectory
    pub fn prompts_dir(&self) -> PathBuf {
        self.global_dir().join("prompts")
    }

    /// Run idempotent bootstrap
    pub fn init(&self) -> Result<BootstrapResult, BootstrapError> {
        let mut created = Vec::new();
        let mut skipped = Vec::new();

        // Create directory structure
        let dirs = [
            self.global_dir(),
            self.workflows_dir(),
            self.agents_dir(),
            self.skills_dir(),
            self.prompts_dir(),
        ];

        for dir in &dirs {
            if dir.exists() {
                skipped.push(dir.to_string_lossy().to_string());
            } else {
                fs::create_dir_all(dir)?;
                created.push(dir.to_string_lossy().to_string());
            }
        }

        // Create registry database if it doesn't exist
        let db_path = self.global_dir().join("registry.db");
        if db_path.exists() {
            skipped.push(db_path.to_string_lossy().to_string());
        } else {
            Database::open(db_path.to_str().unwrap_or_default())?;
            created.push(db_path.to_string_lossy().to_string());
        }

        // Create default resources (idempotent - only if not exists)
        self.create_default_workflow()?;
        self.create_default_agents()?;
        self.create_default_skills()?;
        self.create_default_prompts()?;

        Ok(BootstrapResult { created, skipped })
    }

    /// Register all workflows from YAML files into the database
    pub fn register_workflows_to_db(&self, node_service: Arc<NodeService>) -> Result<(), BootstrapError> {
        let workflows_dir = self.workflows_dir();

        if !workflows_dir.exists() {
            return Ok(());
        }

        // Read all YAML files in the workflows directory
        for entry in fs::read_dir(&workflows_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.extension().and_then(|s| s.to_str()) != Some("yaml") {
                continue;
            }

            // Read the YAML content
            let content = fs::read_to_string(&path)?;

            // Parse the YAML to get ARN and name
            // The YAML format has `arn:` at the top
            let arn = content.lines()
                .find(|line| line.starts_with("arn:"))
                .map(|line| line.trim_start_matches("arn:").trim())
                .unwrap_or_default();

            let name = content.lines()
                .find(|line| line.starts_with("name:"))
                .map(|line| line.trim_start_matches("name:").trim().trim_matches('"'))
                .unwrap_or_default();

            if arn.is_empty() || name.is_empty() {
                continue;
            }

            // Check if already registered
            if node_service.get(arn).ok().flatten().is_some() {
                continue;
            }

            // Create the node and save it
            let node = Node::new_global(
                arn.to_string(),
                NodeType::Workflow,
                name.to_string(),
            )
            .with_path(path.to_string_lossy().to_string())
            .with_config(serde_yaml::from_str(&content).unwrap_or(serde_json::Value::Null));

            if let Err(e) = node_service.create(node) {
                eprintln!("Warning: failed to register workflow {}: {}", arn, e);
            }
        }

        Ok(())
    }

    /// Check if already initialized
    pub fn is_initialized(&self) -> bool {
        self.global_dir().exists()
            && self.workflows_dir().join("sdd-full.yaml").exists()
            && self.global_dir().join("registry.db").exists()
    }

    /// Create default SDD workflow
    fn create_default_workflow(&self) -> Result<(), BootstrapError> {
        let path = self.workflows_dir().join("sdd-full.yaml");
        if path.exists() {
            return Ok(());
        }

        let content = include_str!("../templates/sdd-full.yaml");
        fs::write(&path, content)?;
        Ok(())
    }

    /// Create default agents
    fn create_default_agents(&self) -> Result<(), BootstrapError> {
        // Orchestrator agent
        let orch_path = self.agents_dir().join("orchestrator.yaml");
        if !orch_path.exists() {
            let content = include_str!("../templates/orchestrator.yaml");
            fs::write(&orch_path, content)?;
        }

        Ok(())
    }

    /// Create default skills (mattpocock format)
    fn create_default_skills(&self) -> Result<(), BootstrapError> {
        let skills = [
            ("sdd-explore", include_str!("../templates/skills/sdd-explore.md")),
            ("sdd-apply", include_str!("../templates/skills/sdd-apply.md")),
            ("sdd-propose", include_str!("../templates/skills/sdd-propose.md")),
            ("sdd-spec", include_str!("../templates/skills/sdd-spec.md")),
            ("sdd-design", include_str!("../templates/skills/sdd-design.md")),
            ("sdd-tasks", include_str!("../templates/skills/sdd-tasks.md")),
            ("sdd-verify", include_str!("../templates/skills/sdd-verify.md")),
            ("sdd-archive", include_str!("../templates/skills/sdd-archive.md")),
        ];

        for (name, content) in skills {
            let path = self.skills_dir().join(name).join("SKILL.md");
            if !path.exists() {
                fs::create_dir_all(path.parent().unwrap())?;
                fs::write(&path, content)?;
            }
        }

        Ok(())
    }

    /// Create default prompts
    fn create_default_prompts(&self) -> Result<(), BootstrapError> {
        let prompts = [
            ("sdd-orchestrator", include_str!("../templates/prompts/sdd-orchestrator.md")),
        ];

        for (name, content) in prompts {
            let path = self.prompts_dir().join(name).with_extension("md");
            if !path.exists() {
                fs::write(&path, content)?;
            }
        }

        Ok(())
    }

    /// Load from git template
    pub async fn load_template(&self, git_url: &str) -> Result<TemplateResult, BootstrapError> {
        // For now, just verify the URL is valid
        // Full git integration would use git2 or async-git
        if !git_url.starts_with("git") && !git_url.starts_with("http") && !git_url.starts_with("github") {
            return Err(BootstrapError::InvalidTemplate {
                url: git_url.to_string(),
                reason: "Invalid git URL format".to_string(),
            });
        }

        // Placeholder - would clone/fetch git repo
        Ok(TemplateResult {
            url: git_url.to_string(),
            resources: vec![],
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BootstrapResult {
    pub created: Vec<String>,
    pub skipped: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateResult {
    pub url: String,
    pub resources: Vec<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum BootstrapError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Invalid template URL: {url} - {reason}")]
    InvalidTemplate { url: String, reason: String },
}
