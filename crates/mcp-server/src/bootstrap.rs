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

    /// Get the tools subdirectory
    pub fn tools_dir(&self) -> PathBuf {
        self.global_dir().join("tools")
    }

    /// Get the templates subdirectory
    pub fn templates_dir(&self) -> PathBuf {
        self.global_dir().join("templates")
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
            self.tools_dir(),
            self.templates_dir(),
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
        self.create_default_tools()?;

        Ok(BootstrapResult { created, skipped })
    }

    /// Register all YAML resources (workflows, agents, tools, templates) into the database.
    /// Also registers skills and prompts from their respective directories.
    pub fn register_resources_to_db(&self, node_service: Arc<NodeService>) -> Result<(), BootstrapError> {
        // Register workflows from YAML
        self.register_yaml_dir(&self.workflows_dir(), NodeType::Workflow, &node_service)?;

        // Register agents from YAML
        self.register_yaml_dir(&self.agents_dir(), NodeType::Agent, &node_service)?;

        // Register tools from YAML
        self.register_yaml_dir(&self.tools_dir(), NodeType::Tool, &node_service)?;

        // Register skills from subdirectories (skill-name/SKILL.md)
        self.register_skills_dir(&node_service)?;

        // Register prompts from markdown files
        self.register_prompts_dir(&node_service)?;

        Ok(())
    }

    /// Register all YAML files in a directory as nodes of the given type
    fn register_yaml_dir(
        &self,
        dir: &PathBuf,
        node_type: NodeType,
        node_service: &Arc<NodeService>,
    ) -> Result<(), BootstrapError> {
        if !dir.exists() {
            return Ok(());
        }

        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.extension().and_then(|s| s.to_str()) != Some("yaml") {
                continue;
            }

            let content = fs::read_to_string(&path)?;

            // Parse ARN and name from YAML
            let arn = Self::extract_yaml_field(&content, "arn");
            let name = Self::extract_yaml_field(&content, "name");

            if arn.is_empty() || name.is_empty() {
                continue;
            }

            // Check if already registered
            if node_service.get(&arn).ok().flatten().is_some() {
                continue;
            }

            let node = Node::new_global(
                arn.clone(),
                node_type.clone(),
                name,
            )
            .with_path(path.to_string_lossy().to_string())
            .with_config(serde_yaml::from_str(&content).unwrap_or(serde_json::Value::Null));

            if let Err(e) = node_service.create(node) {
                eprintln!("Warning: failed to register {}: {}", arn, e);
            }
        }

        Ok(())
    }

    /// Register skills from subdirectories (each skill has its own dir with SKILL.md)
    fn register_skills_dir(&self, node_service: &Arc<NodeService>) -> Result<(), BootstrapError> {
        let skills_dir = self.skills_dir();
        if !skills_dir.exists() {
            return Ok(());
        }

        for entry in fs::read_dir(&skills_dir)? {
            let entry = entry?;
            let skill_dir = entry.path();

            if !skill_dir.is_dir() {
                continue;
            }

            let skill_name = skill_dir.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            if skill_name.is_empty() {
                continue;
            }

            let arn = format!("arn:local:global:skill/{}", skill_name);

            // Check if already registered
            if node_service.get(&arn).ok().flatten().is_some() {
                continue;
            }

            let node = Node::new_global(
                arn.clone(),
                NodeType::Skill,
                skill_name,
            )
            .with_path(skill_dir.to_string_lossy().to_string());

            if let Err(e) = node_service.create(node) {
                eprintln!("Warning: failed to register skill {}: {}", arn, e);
            }
        }

        Ok(())
    }

    /// Register prompts from markdown files in prompts directory
    fn register_prompts_dir(&self, node_service: &Arc<NodeService>) -> Result<(), BootstrapError> {
        let prompts_dir = self.prompts_dir();
        if !prompts_dir.exists() {
            return Ok(());
        }

        for entry in fs::read_dir(&prompts_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.extension().and_then(|s| s.to_str()) != Some("md") {
                continue;
            }

            let prompt_name = path.file_stem()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            if prompt_name.is_empty() {
                continue;
            }

            let arn = format!("arn:local:global:prompt/{}", prompt_name);

            // Check if already registered
            if node_service.get(&arn).ok().flatten().is_some() {
                continue;
            }

            let node = Node::new_global(
                arn.clone(),
                NodeType::Prompt,
                prompt_name,
            )
            .with_path(path.to_string_lossy().to_string());

            if let Err(e) = node_service.create(node) {
                eprintln!("Warning: failed to register prompt {}: {}", arn, e);
            }
        }

        Ok(())
    }

    /// Extract a top-level field value from YAML content (simple parser)
    fn extract_yaml_field(content: &str, field: &str) -> String {
        let prefix = format!("{}:", field);
        content.lines()
            .find(|line| {
                let trimmed = line.trim();
                trimmed.starts_with(&prefix) && !trimmed.starts_with('#')
            })
            .map(|line| {
                let value = line.trim_start_matches(&prefix).trim();
                // Remove surrounding quotes
                value.trim_matches('"').trim_matches('\'').to_string()
            })
            .unwrap_or_default()
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

    /// Create default built-in tools (ADR-0014)
    fn create_default_tools(&self) -> Result<(), BootstrapError> {
        let tools = [
            ("bash", include_str!("../templates/tools/bash.yaml")),
            ("read", include_str!("../templates/tools/read.yaml")),
            ("edit", include_str!("../templates/tools/edit.yaml")),
            ("write", include_str!("../templates/tools/write.yaml")),
            ("glob", include_str!("../templates/tools/glob.yaml")),
            ("grep", include_str!("../templates/tools/grep.yaml")),
            ("task", include_str!("../templates/tools/task.yaml")),
            ("delegate", include_str!("../templates/tools/delegate.yaml")),
            ("webfetch", include_str!("../templates/tools/webfetch.yaml")),
            ("skill", include_str!("../templates/tools/skill.yaml")),
            ("todowrite", include_str!("../templates/tools/todowrite.yaml")),
            ("websearch", include_str!("../templates/tools/websearch.yaml")),
        ];

        for (name, content) in tools {
            let path = self.tools_dir().join(name).with_extension("yaml");
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
