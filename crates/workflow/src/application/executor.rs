//! Workflow Execution Planner
//!
//! Generates execution plans for IDEs agenticos (Claude Code, OpenCode, Codex).
//! The actual execution is done by the orchestrator agent, not this system.
//!
//! ## Responsibility Division
//! - **WorkflowPlanner**: Validates DAG, generates execution plan, resolves dependencies
//! - **Orchestrator Agent**: Executes each stage by calling appropriate tools/agents
//! - **This System**: Provides workflow definition, input/output contracts, metrics

use std::collections::{HashMap, HashSet, VecDeque};
use serde::{Serialize, Deserialize};

use crate::domain::{
    InputValue, Stage, StageContext, Workflow, WorkflowError, WorkflowResult,
};

/// Represents a single unit of work to be executed by an orchestrator
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionStep {
    pub step_id: String,
    pub stage_id: String,
    pub agent_arn: String,
    pub description: String,
    pub input_contracts: Vec<InputContract>,
    pub output_contract: OutputContract,
    pub depends_on: Vec<String>,  // Step IDs this depends on
    pub retry_config: RetryStepConfig,
    pub conditions: Vec<ConditionSummary>,
}

/// Contract for an input parameter
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InputContract {
    pub name: String,
    pub source: InputSource,
    pub description: String,
}

/// Source of an input value
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InputSource {
    /// Direct string value
    Static(String),
    /// Reference to another stage's output
    StageOutput { stage_id: String, output_name: String },
    /// Variable from execution context
    Variable { name: String },
    /// Template with placeholders
    Template { template: String },
}

/// Contract for stage output
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputContract {
    pub artifacts: Vec<ArtifactContract>,
    pub result_field: String,  // Field name that contains the "result"
}

/// Contract for an artifact produced by a stage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactContract {
    pub name: String,
    pub path_template: String,
    pub content_type: Option<String>,
}

/// Retry configuration for a step
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryStepConfig {
    pub max_attempts: u32,
    pub backoff_ms: u64,
}

/// Summary of a condition for the orchestrator
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConditionSummary {
    pub expression: String,
    pub operator: String,
    pub value: String,
}

/// Complete execution plan for a workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionPlan {
    pub workflow_arn: String,
    pub workflow_name: String,
    pub execution_order: Vec<ExecutionStep>,
    pub parallel_groups: Vec<Vec<String>>,  // Steps that can run in parallel
    pub total_steps: usize,
    pub estimated_duration_ms: Option<u64>,
    pub input_variables: Vec<String>,
}

/// Planning result with warnings
#[derive(Debug)]
pub struct PlanningResult {
    pub plan: ExecutionPlan,
    pub warnings: Vec<String>,
}

/// DAG-based workflow planner for orchestrators
pub struct WorkflowPlanner;

impl WorkflowPlanner {
    pub fn new() -> Self {
        Self
    }

    /// Generate an execution plan from a workflow definition
    ///
    /// The orchestrator agent will use this plan to execute stages
    /// in the correct order with proper input/output handling.
    pub fn plan(&self, workflow: &Workflow) -> WorkflowResult<PlanningResult> {
        // Validate workflow structure
        self.validate_workflow(workflow)?;

        // Generate execution order via topological sort
        let execution_order = self.topological_sort(workflow)?;

        // Identify parallel execution groups
        let parallel_groups = self.identify_parallel_groups(workflow, &execution_order)?;

        // Build execution steps
        let mut steps = Vec::new();
        let mut warnings = Vec::new();

        for stage_id in &execution_order {
            let stage = workflow.get_stage(stage_id).unwrap();

            match self.build_execution_step(stage, workflow) {
                Ok(step) => steps.push(step),
                Err(e) => warnings.push(format!("Stage '{}': {}", stage.id, e)),
            }
        }

        Ok(PlanningResult {
            plan: ExecutionPlan {
                workflow_arn: workflow.arn.clone(),
                workflow_name: workflow.name.clone(),
                execution_order: steps,
                parallel_groups,
                total_steps: execution_order.len(),
                estimated_duration_ms: self.estimate_duration(workflow),
                input_variables: self.collect_input_variables(workflow),
            },
            warnings,
        })
    }

    /// Validate workflow structure
    fn validate_workflow(&self, workflow: &Workflow) -> WorkflowResult<()> {
        // Check for duplicate stage IDs
        let mut stage_ids = HashSet::new();
        for stage in &workflow.stages {
            if !stage_ids.insert(&stage.id) {
                return Err(WorkflowError::InvalidStageConfig(format!(
                    "Duplicate stage ID: {}",
                    stage.id
                )));
            }
        }

        // Check all dependencies exist
        for stage in &workflow.stages {
            for dep in &stage.depends_on {
                if !stage_ids.contains(dep) {
                    return Err(WorkflowError::InvalidStageConfig(format!(
                        "Stage '{}' depends on non-existent stage '{}'",
                        stage.id, dep
                    )));
                }
            }
        }

        // Check for circular dependencies
        if let Some(cycle) = self.detect_cycle(workflow) {
            return Err(WorkflowError::CircularDependency(cycle));
        }

        // Check referenced agents exist in workflow
        for stage in &workflow.stages {
            if !workflow.agents.contains_key(&stage.agent) {
                return Err(WorkflowError::InvalidStageConfig(format!(
                    "Stage '{}' references undefined agent '{}'",
                    stage.id, stage.agent
                )));
            }
        }

        Ok(())
    }

    /// Build an execution step from a stage
    fn build_execution_step(
        &self,
        stage: &Stage,
        workflow: &Workflow,
    ) -> WorkflowResult<ExecutionStep> {
        let agent = workflow.agents.get(&stage.agent)
            .ok_or_else(|| WorkflowError::InvalidStageConfig(format!(
                "Agent '{}' not found in workflow agents",
                stage.agent
            )))?;

        let mut input_contracts = Vec::new();

        for (key, value) in &stage.input {
            let source = match value {
                InputValue::String(s) => InputSource::Static(s.clone()),
                InputValue::Reference { from } => {
                    // Verify the referenced stage exists
                    if !workflow.stages.iter().any(|s| &s.id == from) {
                        return Err(WorkflowError::InvalidStageConfig(format!(
                            "Stage '{}' references non-existent stage '{}' in input '{}'",
                            stage.id, from, key
                        )));
                    }
                    InputSource::StageOutput {
                        stage_id: from.clone(),
                        output_name: "result".to_string(),  // Default output name
                    }
                }
                InputValue::Template(s) => InputSource::Template { template: s.clone() },
            };

            input_contracts.push(InputContract {
                name: key.clone(),
                source,
                description: format!("Input for stage {}", stage.id),
            });
        }

        let output_artifacts = stage.output.artifacts.iter().map(|a| ArtifactContract {
            name: a.name.clone(),
            path_template: a.path_template.clone(),
            content_type: a.content_type.clone(),
        }).collect();

        Ok(ExecutionStep {
            step_id: format!("{}/{}", workflow.arn, stage.id),
            stage_id: stage.id.clone(),
            agent_arn: agent.name.clone(),
            description: stage.description.clone(),
            input_contracts,
            output_contract: OutputContract {
                artifacts: output_artifacts,
                result_field: "result".to_string(),
            },
            depends_on: stage.depends_on.clone(),
            retry_config: RetryStepConfig {
                max_attempts: stage.execution.retry.max_attempts,
                backoff_ms: stage.execution.retry.backoff_ms,
            },
            conditions: stage.conditions.iter().map(|c| ConditionSummary {
                expression: c.when.clone(),
                operator: format!("{:?}", c.operator),
                value: c.value.to_string(),
            }).collect(),
        })
    }

    /// Topological sort using Kahn's algorithm
    fn topological_sort(&self, workflow: &Workflow) -> WorkflowResult<Vec<String>> {
        let mut in_degree: HashMap<&str, usize> = HashMap::new();
        let mut adjacency: HashMap<&str, Vec<&str>> = HashMap::new();

        // Initialize
        for stage in &workflow.stages {
            in_degree.insert(stage.id.as_str(), stage.depends_on.len());
            adjacency.insert(stage.id.as_str(), vec![]);
        }

        // Build adjacency list (reversed dependencies)
        for stage in &workflow.stages {
            for dep in &stage.depends_on {
                if let Some(neighbors) = adjacency.get_mut(dep.as_str()) {
                    neighbors.push(stage.id.as_str());
                }
            }
        }

        // Start with nodes that have no dependencies
        let mut queue: VecDeque<&str> = in_degree
            .iter()
            .filter(|(_, degree)| **degree == 0)
            .map(|(&id, _)| id)
            .collect();

        let mut result = Vec::new();

        while let Some(node) = queue.pop_front() {
            result.push(node.to_string());

            // Reduce in-degree of dependent nodes
            if let Some(neighbors) = adjacency.get(node) {
                for &neighbor in neighbors {
                    if let Some(degree) = in_degree.get_mut(neighbor) {
                        *degree -= 1;
                        if *degree == 0 {
                            queue.push_back(neighbor);
                        }
                    }
                }
            }
        }

        // If we didn't process all nodes, there's a cycle
        if result.len() != workflow.stages.len() {
            return Err(WorkflowError::CircularDependency(
                "Circular dependency detected".to_string(),
            ));
        }

        Ok(result)
    }

    /// Identify which steps can run in parallel
    fn identify_parallel_groups(
        &self,
        workflow: &Workflow,
        execution_order: &[String],
    ) -> WorkflowResult<Vec<Vec<String>>> {
        let mut groups: Vec<Vec<String>> = Vec::new();
        let mut assigned: HashSet<String> = HashSet::new();

        // Pre-compute dependency relationships
        let _stage_map: HashMap<&str, &Stage> = workflow.stages
            .iter()
            .map(|s| (s.id.as_str(), s))
            .collect();

        for stage_id in execution_order {
            // Skip if already assigned to a group
            if assigned.contains(stage_id) {
                continue;
            }

            let stage = workflow.get_stage(stage_id).unwrap();

            // Check if this stage's dependencies are satisfied
            let deps_satisfied = stage.depends_on.iter().all(|d| assigned.contains(d));

            if deps_satisfied {
                let mut group = vec![stage_id.clone()];
                assigned.insert(stage_id.clone());

                // Find other stages that can also run now (parallel with current)
                for other_id in execution_order {
                    if assigned.contains(other_id) {
                        continue;
                    }

                    let other_stage = workflow.get_stage(other_id).unwrap();

                    // Check if other's dependencies are satisfied
                    let other_deps_satisfied = other_stage.depends_on.iter()
                        .all(|d| assigned.contains(d));

                    if other_deps_satisfied {
                        // Check they don't depend on each other
                        let not_dependent_on_each_other =
                            !other_stage.depends_on.contains(stage_id)
                            && !stage.depends_on.contains(other_id);

                        if not_dependent_on_each_other {
                            group.push(other_id.clone());
                            assigned.insert(other_id.clone());
                        }
                    }
                }

                groups.push(group);
            }
        }

        Ok(groups)
    }

    /// Detect cycles using DFS
    fn detect_cycle(&self, workflow: &Workflow) -> Option<String> {
        let mut visited = HashSet::new();
        let mut stack = HashSet::new();

        for stage in &workflow.stages {
            if !visited.contains(&stage.id) {
                if let Some(cycle) = self.visit(workflow, &stage.id, &mut visited, &mut stack) {
                    return Some(cycle);
                }
            }
        }

        None
    }

    fn visit(
        &self,
        workflow: &Workflow,
        stage_id: &str,
        visited: &mut HashSet<String>,
        stack: &mut HashSet<String>,
    ) -> Option<String> {
        visited.insert(stage_id.to_string());
        stack.insert(stage_id.to_string());

        if let Some(stage) = workflow.get_stage(stage_id) {
            for dep in &stage.depends_on {
                if stack.contains(dep) {
                    return Some(format!("{} -> {}", dep, stage_id));
                }
                if !visited.contains(dep) {
                    if let Some(cycle) = self.visit(workflow, dep, visited, stack) {
                        return Some(cycle);
                    }
                }
            }
        }

        stack.remove(stage_id);
        None
    }

    /// Estimate workflow duration based on stage timeouts
    fn estimate_duration(&self, workflow: &Workflow) -> Option<u64> {
        let mut total = 0u64;

        for stage in &workflow.stages {
            if let Some(timeout) = workflow.agents.get(&stage.agent)
                .and_then(|a| a.timeout_ms)
            {
                total += timeout;
            } else {
                // Default timeout of 60 seconds per stage
                total += 60_000;
            }
        }

        Some(total)
    }

    /// Collect all input variables needed for the workflow
    fn collect_input_variables(&self, _workflow: &Workflow) -> Vec<String> {
        // For now, return empty - external input collection is handled by the orchestrator
        vec![]
    }

    /// Export plan as JSON for the orchestrator
    pub fn export_json(&self, plan: &ExecutionPlan) -> String {
        serde_json::to_string_pretty(plan).unwrap_or_default()
    }

    /// Export plan as a markdown execution guide
    pub fn export_markdown(&self, plan: &ExecutionPlan) -> String {
        let mut md = format!("# Execution Plan: {}\n\n", plan.workflow_name);
        md.push_str(&format!("**ARN:** {}\n\n", plan.workflow_arn));
        md.push_str(&format!("**Total Steps:** {}\n\n", plan.total_steps));

        if !plan.input_variables.is_empty() {
            md.push_str("## Input Variables\n\n");
            for var in &plan.input_variables {
                md.push_str(&format!("- `{}`\n", var));
            }
            md.push('\n');
        }

        md.push_str("## Execution Steps\n\n");

        for (i, step) in plan.execution_order.iter().enumerate() {
            md.push_str(&format!("### {}. {}\n\n", i + 1, step.stage_id));
            md.push_str(&format!("**Agent:** `{}`\n\n", step.agent_arn));

            if !step.description.is_empty() {
                md.push_str(&format!("**Description:** {}\n\n", step.description));
            }

            if !step.input_contracts.is_empty() {
                md.push_str("**Inputs:**\n");
                for input in &step.input_contracts {
                    match &input.source {
                        InputSource::Static(s) => {
                            md.push_str(&format!("- `{}`: `{}`\n", input.name, s));
                        }
                        InputSource::StageOutput { stage_id, .. } => {
                            md.push_str(&format!("- `{}`: from stage `{}`\n", input.name, stage_id));
                        }
                        InputSource::Variable { name } => {
                            md.push_str(&format!("- `{}`: variable `${}\n", input.name, name));
                        }
                        InputSource::Template { template } => {
                            md.push_str(&format!("- `{}`: template `{}\\n", input.name, template));
                        }
                    }
                }
                md.push('\n');
            }

            if !step.output_contract.artifacts.is_empty() {
                md.push_str("**Outputs:**\n");
                for artifact in &step.output_contract.artifacts {
                    md.push_str(&format!("- `{}` → `{}`\n", artifact.name, artifact.path_template));
                }
                md.push('\n');
            }

            if !step.depends_on.is_empty() {
                md.push_str(&format!("**Depends on:** {}\n\n", step.depends_on.join(", ")));
            }

            md.push_str("---\n\n");
        }

        md
    }
}

impl Default for WorkflowPlanner {
    fn default() -> Self {
        Self::new()
    }
}

/// Context for stage execution (used by IDEs to resolve references)
pub struct ExecutionContext {
    pub outputs: HashMap<String, serde_json::Value>,
    pub variables: HashMap<String, String>,
}

impl StageContext for ExecutionContext {
    fn get_output(&self, stage_id: &str) -> String {
        self.outputs
            .get(stage_id)
            .and_then(|v| serde_json::to_string(v).ok())
            .unwrap_or_default()
    }

    fn get_variable(&self, name: &str) -> Option<String> {
        self.variables.get(name).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::Stage;

    fn create_test_workflow() -> Workflow {
        let mut workflow = Workflow::new(
            "workflow:arn://test/simple".to_string(),
            "Test Workflow".to_string(),
        );

        workflow.agents.insert("agent".to_string(), AgentDefinition {
            name: "agent:arn://test/agent".to_string(),
            description: "Test agent".to_string(),
            model: "claude-3".to_string(),
            skills: vec![],
            tools: vec![],
            prompts: vec![],
            timeout_ms: Some(30000),
        });

        workflow.stages = vec![
            Stage::new("a".to_string(), "agent".to_string()),
            Stage::new("b".to_string(), "agent".to_string()),
            Stage::new("c".to_string(), "agent".to_string()),
        ];

        // b depends on a
        workflow.stages[1].depends_on = vec!["a".to_string()];
        // c depends on a and b
        workflow.stages[2].depends_on = vec!["a".to_string(), "b".to_string()];

        workflow
    }

    #[test]
    fn test_topological_sort_linear() {
        let workflow = create_test_workflow();
        let planner = WorkflowPlanner::new();

        let order = planner.topological_sort(&workflow).unwrap();
        assert_eq!(order, vec!["a", "b", "c"]);
    }

    #[test]
    fn test_plan_generation() {
        let workflow = create_test_workflow();
        let planner = WorkflowPlanner::new();

        let result = planner.plan(&workflow).unwrap();
        assert_eq!(result.plan.total_steps, 3);
        assert_eq!(result.plan.execution_order[0].stage_id, "a");
        assert_eq!(result.plan.execution_order[1].stage_id, "b");
        assert_eq!(result.plan.execution_order[2].stage_id, "c");
    }

    #[test]
    fn test_parallel_groups() {
        let mut workflow = Workflow::new(
            "workflow:arn://test/parallel".to_string(),
            "Parallel Test".to_string(),
        );

        workflow.agents.insert("agent".to_string(), AgentDefinition {
            name: "agent:arn://test/agent".to_string(),
            description: "Test agent".to_string(),
            model: "claude-3".to_string(),
            skills: vec![],
            tools: vec![],
            prompts: vec![],
            timeout_ms: Some(30000),
        });

        workflow.stages = vec![
            Stage::new("start".to_string(), "agent".to_string()),
            Stage::new("a".to_string(), "agent".to_string()),
            Stage::new("b".to_string(), "agent".to_string()),
            Stage::new("end".to_string(), "agent".to_string()),
        ];

        // start -> a
        workflow.stages[1].depends_on = vec!["start".to_string()];
        // start -> b
        workflow.stages[2].depends_on = vec!["start".to_string()];
        // end depends on both a and b
        workflow.stages[3].depends_on = vec!["a".to_string(), "b".to_string()];

        let planner = WorkflowPlanner::new();
        let result = planner.plan(&workflow).unwrap();

        // First group should be start
        assert_eq!(result.plan.parallel_groups[0], vec!["start"]);
        // a and b should be in second group (parallel)
        assert!(result.plan.parallel_groups[1].contains(&"a".to_string()));
        assert!(result.plan.parallel_groups[1].contains(&"b".to_string()));
    }

    #[test]
    fn test_cycle_detection() {
        let mut workflow = Workflow::new(
            "workflow:arn://test/cycle".to_string(),
            "Cycle Test".to_string(),
        );

        workflow.agents.insert("agent".to_string(), AgentDefinition {
            name: "agent:arn://test/agent".to_string(),
            description: "Test agent".to_string(),
            model: "claude-3".to_string(),
            skills: vec![],
            tools: vec![],
            prompts: vec![],
            timeout_ms: Some(30000),
        });

        workflow.stages = vec![
            Stage::new("a".to_string(), "agent".to_string()),
            Stage::new("b".to_string(), "agent".to_string()),
        ];

        // a depends on b, b depends on a - cycle!
        workflow.stages[0].depends_on = vec!["b".to_string()];
        workflow.stages[1].depends_on = vec!["a".to_string()];

        let planner = WorkflowPlanner::new();
        let result = planner.plan(&workflow);
        assert!(result.is_err());
    }

    #[test]
    fn test_markdown_export() {
        let workflow = create_test_workflow();
        let planner = WorkflowPlanner::new();
        let result = planner.plan(&workflow).unwrap();

        let md = planner.export_markdown(&result.plan);
        assert!(md.contains("# Execution Plan: Test Workflow"));
        assert!(md.contains("### 1. a"));
        assert!(md.contains("### 2. b"));
        assert!(md.contains("### 3. c"));
    }
}
