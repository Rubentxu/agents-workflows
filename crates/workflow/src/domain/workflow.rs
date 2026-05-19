//! Workflow Entity

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::Stage;
use super::ExecutionConfig;

/// Workflow definition - the top-level construct
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workflow {
    pub arn: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub agents: HashMap<String, AgentDefinition>,
    pub skills: HashMap<String, SkillReference>,
    pub stages: Vec<Stage>,
    pub execution: ExecutionConfig,
    pub metrics: MetricsConfig,
}

impl Workflow {
    pub fn new(arn: String, name: String) -> Self {
        Self {
            arn,
            name,
            version: "1.0".to_string(),
            description: String::new(),
            agents: HashMap::new(),
            skills: HashMap::new(),
            stages: Vec::new(),
            execution: ExecutionConfig::default(),
            metrics: MetricsConfig::default(),
        }
    }

    /// Get stage by ID
    pub fn get_stage(&self, stage_id: &str) -> Option<&Stage> {
        self.stages.iter().find(|s| s.id == stage_id)
    }

    /// Get all stages in topological order (respecting dependencies)
    pub fn stages_in_order(&self) -> Vec<&Stage> {
        let mut ordered = Vec::new();
        let mut visited = std::collections::HashSet::new();

        for stage in &self.stages {
            self.visit_stage(stage, &mut visited, &mut ordered);
        }

        ordered
    }

    fn visit_stage<'a>(&'a self, stage: &'a Stage, visited: &mut std::collections::HashSet<String>, ordered: &mut Vec<&'a Stage>) {
        if visited.contains(&stage.id) {
            return;
        }
        visited.insert(stage.id.clone());

        for dep in &stage.depends_on {
            if let Some(dep_stage) = self.get_stage(dep) {
                self.visit_stage(dep_stage, visited, ordered);
            }
        }

        ordered.push(stage);
    }
}

/// Agent definition within a workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentDefinition {
    pub name: String,
    pub description: String,
    pub model: String,
    pub skills: Vec<String>,       // Skill ARNs
    pub tools: Vec<String>,         // Tool ARNs
    pub prompts: Vec<String>,      // Prompt ARNs
    pub timeout_ms: Option<u64>,
}

/// Skill reference in workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillReference {
    pub source: String,            // ARN
    pub triggers: Vec<String>,
    pub compact_rules: bool,
}

/// Metrics configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsConfig {
    pub streaming: bool,
    pub interval_ms: u64,
    pub channels: Vec<String>,
}

impl Default for MetricsConfig {
    fn default() -> Self {
        Self {
            streaming: true,
            interval_ms: 1000,
            channels: vec![
                "execution_state".to_string(),
                "artifacts".to_string(),
                "quality_scores".to_string(),
            ],
        }
    }
}
