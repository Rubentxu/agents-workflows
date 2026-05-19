//! Workflow Service

use crate::domain::{
    Workflow, Stage, WorkflowError, WorkflowResult
};
use std::collections::HashMap;

/// Workflow Service - application logic for workflow management
pub struct WorkflowService;

impl WorkflowService {
    /// Validate workflow structure
    pub fn validate(&self, workflow: &Workflow) -> WorkflowResult<()> {
        // Check for duplicate stage IDs
        let mut stage_ids = std::collections::HashSet::new();
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
        if let Some(cycle) = self.find_cycle(workflow) {
            return Err(WorkflowError::CircularDependency(cycle));
        }

        // Check referenced agents exist
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

    /// Find a cycle in the dependency graph
    fn find_cycle(&self, workflow: &Workflow) -> Option<String> {
        let mut visited = std::collections::HashSet::new();
        let mut stack = std::collections::HashSet::new();

        for stage in &workflow.stages {
            if !visited.contains(&stage.id) {
                if let Some(cycle) = self.visit(stage, workflow, &mut visited, &mut stack) {
                    return Some(cycle);
                }
            }
        }

        None
    }

    fn visit(
        &self,
        stage: &Stage,
        workflow: &Workflow,
        visited: &mut std::collections::HashSet<String>,
        stack: &mut std::collections::HashSet<String>,
    ) -> Option<String> {
        visited.insert(stage.id.clone());
        stack.insert(stage.id.clone());

        for dep in &stage.depends_on {
            if stack.contains(dep) {
                return Some(format!("{} -> {}", dep, stage.id));
            }

            if let Some(dep_stage) = workflow.get_stage(dep) {
                if let Some(cycle) = self.visit(dep_stage, workflow, visited, stack) {
                    return Some(cycle);
                }
            }
        }

        stack.remove(&stage.id);
        None
    }

    /// Get stages in execution order (topological sort)
    pub fn get_execution_order(workflow: &Workflow) -> Vec<&Stage> {
        workflow.stages_in_order()
    }

    /// Get parallelizable stage groups.
    /// Stages at the same level (same distance from roots) can run in parallel.
    pub fn get_parallel_groups(
        workflow: &Workflow
    ) -> Vec<Vec<&Stage>> {
        let stage_map: HashMap<&str, &Stage> = workflow.stages.iter()
            .map(|s| (s.id.as_str(), s))
            .collect();

        // Compute depth (level) for each stage: max depth of any dependency
        let mut depths: HashMap<&str, usize> = HashMap::new();
        for stage in &workflow.stages {
            compute_depth(stage.id.as_str(), &stage_map, &mut depths);
        }

        // Group stages by depth
        let mut groups: HashMap<usize, Vec<&Stage>> = HashMap::new();
        for stage in &workflow.stages {
            let d = *depths.get(stage.id.as_str()).unwrap_or(&0);
            groups.entry(d).or_default().push(stage);
        }

        // Sort by depth and return as ordered vector
        let mut result: Vec<(usize, Vec<&Stage>)> = groups.into_iter()
            .map(|(d, mut stages)| {
                stages.sort_by_key(|s| &s.id);
                (d, stages)
            })
            .collect();
        result.sort_by_key(|(d, _)| *d);
        result.into_iter().map(|(_, stages)| stages).collect()
    }
}

fn compute_depth<'a>(
    stage_id: &'a str,
    stage_map: &HashMap<&'a str, &'a Stage>,
    depths: &mut HashMap<&'a str, usize>,
) -> usize {
    if let Some(&d) = depths.get(stage_id) {
        return d;
    }
    let stage = match stage_map.get(stage_id) {
        Some(s) => *s,
        None => return 0,
    };
    if stage.depends_on.is_empty() {
        depths.insert(stage_id, 0);
        return 0;
    }
    let max_dep_depth = stage.depends_on.iter()
        .map(|dep| compute_depth(dep.as_str(), stage_map, depths))
        .max()
        .unwrap_or(0);
    let depth = max_dep_depth + 1;
    depths.insert(stage_id, depth);
    depth
}
