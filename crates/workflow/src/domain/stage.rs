//! Stage Entity

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Stage - single unit of work in a workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stage {
    pub id: String,
    pub agent: String,             // Agent ARN
    pub depends_on: Vec<String>,    // Stage IDs this depends on
    pub description: String,
    pub input: HashMap<String, InputValue>,
    pub output: StageOutput,
    pub execution: StageExecution,
    pub conditions: Vec<Condition>,
    pub metrics: Vec<String>,
}

impl Stage {
    pub fn new(id: String, agent: String) -> Self {
        Self {
            id,
            agent,
            depends_on: Vec::new(),
            description: String::new(),
            input: HashMap::new(),
            output: StageOutput::default(),
            execution: StageExecution::default(),
            conditions: Vec::new(),
            metrics: Vec::new(),
        }
    }

    /// Check if all conditions are met
    pub fn check_conditions(&self, context: &dyn StageContext) -> bool {
        self.conditions.iter().all(|c| c.evaluate(context))
    }
}

/// Input value for a stage
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum InputValue {
    String(String),
    Reference { from: String },  // Reference to another stage's output
    Template(String),             // Template with placeholders
}

impl InputValue {
    pub fn resolve(&self, context: &dyn StageContext) -> String {
        match self {
            InputValue::String(s) => s.clone(),
            InputValue::Reference { from } => context.get_output(from),
            InputValue::Template(s) => resolve_template(s, context),
        }
    }
}

/// Stage output definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageOutput {
    pub artifacts: Vec<ArtifactRef>,
}

impl Default for StageOutput {
    fn default() -> Self {
        Self {
            artifacts: Vec::new(),
        }
    }
}

/// Artifact reference
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactRef {
    pub name: String,
    pub path_template: String,
    pub content_type: Option<String>,
}

/// Stage execution configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageExecution {
    pub mode: ExecutionMode,
    pub batch_size: Option<usize>,
    pub retry: RetryConfig,
}

impl Default for StageExecution {
    fn default() -> Self {
        Self {
            mode: ExecutionMode::Sequential,
            batch_size: None,
            retry: RetryConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionMode {
    Sequential,
    Parallel,
    Batch,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryConfig {
    pub max_attempts: u32,
    pub backoff_ms: u64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            backoff_ms: 1000,
        }
    }
}

/// Condition for stage execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Condition {
    pub when: String,  // Expression to evaluate
    pub operator: ConditionOperator,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConditionOperator {
    Equals,
    NotEquals,
    In,
    NotIn,
    GreaterThan,
    LessThan,
}

impl Condition {
    pub fn evaluate(&self, context: &dyn StageContext) -> bool {
        let var_value = context.get_variable(&self.when);
        let var_str = match var_value {
            Some(v) => v,
            None => return false,
        };

        match self.operator {
            ConditionOperator::Equals => var_str == self.value.to_string().trim_matches('"'),
            ConditionOperator::NotEquals => var_str != self.value.to_string().trim_matches('"'),
            ConditionOperator::In => {
                if let Some(arr) = self.value.as_array() {
                    arr.iter().any(|v| v.to_string().trim_matches('"') == var_str)
                } else {
                    false
                }
            }
            ConditionOperator::NotIn => {
                if let Some(arr) = self.value.as_array() {
                    !arr.iter().any(|v| v.to_string().trim_matches('"') == var_str)
                } else {
                    true
                }
            }
            ConditionOperator::GreaterThan => {
                if let (Ok(l), Ok(r)) = (var_str.parse::<f64>(), self.value.as_str().unwrap_or("").parse::<f64>()) {
                    l > r
                } else {
                    false
                }
            }
            ConditionOperator::LessThan => {
                if let (Ok(l), Ok(r)) = (var_str.parse::<f64>(), self.value.as_str().unwrap_or("").parse::<f64>()) {
                    l < r
                } else {
                    false
                }
            }
        }
    }
}

/// Resolve `{{variable}}` placeholders in a template string using the stage context.
fn resolve_template(template: &str, context: &dyn StageContext) -> String {
    let mut result = String::new();
    let chars: Vec<char> = template.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '{' && i + 1 < chars.len() && chars[i + 1] == '{' {
            // Find closing }}
            let start = i + 2;
            let mut end = start;
            while end < chars.len() && !(chars[end] == '}' && end + 1 < chars.len() && chars[end + 1] == '}') {
                end += 1;
            }
            if end < chars.len() {
                let var_name = template[start..end].trim();
                let value = context.get_variable(var_name).unwrap_or_default();
                result.push_str(&value);
                i = end + 2;
            } else {
                result.push(chars[i]);
                i += 1;
            }
        } else {
            result.push(chars[i]);
            i += 1;
        }
    }
    result
}

/// Context for stage execution
pub trait StageContext {
    fn get_output(&self, stage_id: &str) -> String;
    fn get_variable(&self, name: &str) -> Option<String>;
}
