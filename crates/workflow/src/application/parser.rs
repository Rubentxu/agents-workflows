//! YAML Parser for Workflow definitions

use crate::domain::{Workflow, Stage, StageExecution, ExecutionMode, RetryConfig, MetricsConfig, InputValue};
use crate::WorkflowResult;
use serde::Deserialize;
use std::collections::HashMap;

/// Parse a workflow YAML into a Workflow domain object
pub fn parse_workflow_yaml(yaml_content: &str) -> WorkflowResult<Workflow> {
    let raw: RawWorkflow = serde_yaml::from_str(yaml_content)
        .map_err(|e| crate::domain::WorkflowError::InvalidStageConfig(e.to_string()))?;

    let mut workflow = Workflow::new(
        raw.name.clone(),
        raw.name,
    );
    workflow.version = raw.version.unwrap_or_else(|| "1.0".to_string());
    workflow.description = raw.description.unwrap_or_default();

    // Parse agents
    if let Some(agents) = raw.agents {
        for (name, agent_raw) in agents {
            let agent = crate::domain::AgentDefinition {
                name: name.clone(),
                description: agent_raw.description.unwrap_or_default(),
                model: agent_raw.model.unwrap_or_default(),
                skills: agent_raw.skills.unwrap_or_default(),
                tools: agent_raw.tools.unwrap_or_default(),
                prompts: agent_raw.prompts.unwrap_or_default(),
                timeout_ms: agent_raw.timeout,
            };
            workflow.agents.insert(name, agent);
        }
    }

    // Parse stages
    if let Some(stages_raw) = raw.stages {
        for (id, stage_raw) in stages_raw {
            let mut stage = Stage::new(id.clone(), stage_raw.agent.clone());
            stage.description = stage_raw.description.unwrap_or_default();
            stage.depends_on = stage_raw.depends_on.unwrap_or_default();

            // Parse input
            if let Some(input_raw) = stage_raw.input {
                stage.input = input_raw.into_iter().map(|(k, v)| {
                    let input_val = match v {
                        serde_json::Value::String(s) => InputValue::String(s),
                        serde_json::Value::Object(obj) if obj.contains_key("from") => {
                            InputValue::Reference { from: obj.get("from").and_then(|v| v.as_str()).unwrap_or("").to_string() }
                        }
                        _ => InputValue::String(v.to_string()),
                    };
                    (k, input_val)
                }).collect();
            }

            // Parse execution config
            if let Some(exec_raw) = stage_raw.execution {
                stage.execution = StageExecution {
                    mode: match exec_raw.mode.as_deref() {
                        Some("parallel") => ExecutionMode::Parallel,
                        Some("batch") => ExecutionMode::Batch,
                        _ => ExecutionMode::Sequential,
                    },
                    batch_size: exec_raw.batch_size,
                    retry: RetryConfig {
                        max_attempts: exec_raw.retry.as_ref().and_then(|r| r.max_attempts).unwrap_or(3),
                        backoff_ms: exec_raw.retry.and_then(|r| r.backoff_ms).unwrap_or(1000),
                    },
                };
            }

            workflow.stages.push(stage);
        }
    }

    // Parse execution config
    if let Some(exec_raw) = raw.execution {
        workflow.execution = crate::domain::ExecutionConfig {
            mode: match exec_raw.mode.as_deref() {
                Some("parallel") => crate::domain::WorkflowExecutionMode::Parallel,
                Some("hybrid") => crate::domain::WorkflowExecutionMode::Hybrid,
                _ => crate::domain::WorkflowExecutionMode::Sequential,
            },
            parallel_stages: exec_raw.parallel_stages.unwrap_or_default(),
            on_failure: match exec_raw.on_failure.as_deref() {
                Some("stop") => crate::domain::FailureStrategy::Stop,
                Some("continue") => crate::domain::FailureStrategy::Continue,
                Some("retry") => crate::domain::FailureStrategy::Retry,
                _ => crate::domain::FailureStrategy::Interactive,
            },
            incremental: crate::domain::IncrementalConfig {
                enabled: exec_raw.incremental.as_ref().and_then(|i| i.enabled).unwrap_or(true),
                cache_dir: exec_raw.incremental.as_ref().and_then(|i| i.cache_dir.clone()).unwrap_or_else(|| ".workflow-cache".to_string()),
                skip_if_outputs_valid: exec_raw.incremental.as_ref().and_then(|i| i.skip_if_outputs_valid).unwrap_or(true),
            },
        };
    }

    // Parse metrics config
    if let Some(metrics_raw) = raw.metrics {
        workflow.metrics = MetricsConfig {
            streaming: metrics_raw.streaming.unwrap_or(true),
            interval_ms: metrics_raw.interval_ms.unwrap_or(1000),
            channels: metrics_raw.channels.unwrap_or_else(|| vec![
                "execution_state".to_string(),
                "artifacts".to_string(),
            ]),
        };
    }

    Ok(workflow)
}

/// Parse a registry-stored workflow YAML into a Workflow domain object.
///
/// This parser supports both top-level workflow documents and Kubernetes-style
/// `spec:` wrapped manifests while preserving the workflow ARN from the registry.
pub fn parse_registry_workflow_yaml(
    arn: &str,
    fallback_name: &str,
    yaml_content: &str,
) -> WorkflowResult<Workflow> {
    let yaml_val: serde_yaml::Value = serde_yaml::from_str(yaml_content)
        .map_err(|e| crate::domain::WorkflowError::InvalidStageConfig(e.to_string()))?;

    let root = yaml_val.as_mapping().cloned().unwrap_or_default();
    let spec = yaml_val
        .get("spec")
        .and_then(|v| v.as_mapping())
        .cloned()
        .unwrap_or_default();
    let container = if spec.is_empty() { &root } else { &spec };

    let name = yaml_val
        .get("metadata")
        .and_then(|v| v.get("name"))
        .and_then(|v| v.as_str())
        .or_else(|| yaml_val.get("name").and_then(|v| v.as_str()))
        .unwrap_or(fallback_name)
        .to_string();

    let version = yaml_val
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("1.0")
        .to_string();

    let description = yaml_val
        .get("description")
        .and_then(|v| v.as_str())
        .or_else(|| container.get("description").and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_string();

    let mut workflow = Workflow::new(arn.to_string(), name);
    workflow.version = version;
    workflow.description = description;

    if let Some(stages_val) = container.get("stages") {
        match stages_val {
            serde_yaml::Value::Mapping(map) => {
                for (idx, (stage_name, stage_val)) in map.iter().enumerate() {
                    let stage = parse_stage_yaml(stage_name.as_str(), stage_val, idx)?;
                    workflow.stages.push(stage);
                }
            }
            serde_yaml::Value::Sequence(seq) => {
                for (idx, stage_val) in seq.iter().enumerate() {
                    let stage = parse_stage_yaml(None, stage_val, idx)?;
                    workflow.stages.push(stage);
                }
            }
            _ => {}
        }
    }

    // Minimal execution config extraction for registry-backed workflows.
    if let Some(exec_val) = container.get("execution").and_then(|v| v.as_mapping()) {
        workflow.execution = crate::domain::ExecutionConfig {
            mode: match exec_val.get("mode").and_then(|v| v.as_str()) {
                Some("parallel") => crate::domain::WorkflowExecutionMode::Parallel,
                Some("hybrid") => crate::domain::WorkflowExecutionMode::Hybrid,
                _ => crate::domain::WorkflowExecutionMode::Sequential,
            },
            parallel_stages: Vec::new(),
            on_failure: match exec_val.get("onFailure").and_then(|v| v.as_str()) {
                Some("stop") => crate::domain::FailureStrategy::Stop,
                Some("continue") => crate::domain::FailureStrategy::Continue,
                Some("retry") => crate::domain::FailureStrategy::Retry,
                _ => crate::domain::FailureStrategy::Interactive,
            },
            incremental: crate::domain::IncrementalConfig::default(),
        };
    }

    if let Some(metrics_val) = container.get("metrics").and_then(|v| v.as_mapping()) {
        workflow.metrics = MetricsConfig {
            streaming: metrics_val.get("streaming").and_then(|v| v.as_bool()).unwrap_or(true),
            interval_ms: metrics_val
                .get("interval")
                .or_else(|| metrics_val.get("interval_ms"))
                .and_then(|v| v.as_u64())
                .unwrap_or(1000),
            channels: metrics_val
                .get("channels")
                .and_then(|v| v.as_sequence())
                .map(|seq| seq.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_else(|| vec!["execution_state".to_string(), "artifacts".to_string()]),
        };
    }

    Ok(workflow)
}

fn parse_stage_yaml(
    stage_name: Option<&str>,
    stage_val: &serde_yaml::Value,
    idx: usize,
) -> WorkflowResult<Stage> {
    let stage_map = stage_val
        .as_mapping()
        .cloned()
        .unwrap_or_default();

    let id = stage_map
        .get("id")
        .and_then(|v| v.as_str())
        .map(String::from)
        .or_else(|| stage_name.map(String::from))
        .unwrap_or_else(|| format!("stage-{}", idx));

    let agent = stage_map
        .get("agent")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let mut stage = Stage::new(id, agent);
    stage.description = stage_map
        .get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    stage.depends_on = stage_map
        .get("depends_on")
        .or_else(|| stage_map.get("dependsOn"))
        .and_then(|v| v.as_sequence())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    if let Some(input_raw) = stage_map.get("input").and_then(|v| v.as_mapping()) {
        stage.input = input_raw
            .iter()
            .filter_map(|(k, v)| {
                let key = k.as_str()?.to_string();
                let json_value = serde_json::to_value(v).ok()?;
                let input_val = match json_value {
                    serde_json::Value::String(s) => InputValue::String(s),
                    serde_json::Value::Object(obj) if obj.contains_key("from") => InputValue::Reference {
                        from: obj.get("from").and_then(|val| val.as_str()).unwrap_or("").to_string(),
                    },
                    other => InputValue::String(other.to_string()),
                };
                Some((key, input_val))
            })
            .collect();
    }

    Ok(stage)
}

#[derive(Deserialize)]
struct RawWorkflow {
    #[serde(alias = "name")]
    name: String,
    #[serde(alias = "version")]
    version: Option<String>,
    #[serde(alias = "description")]
    description: Option<String>,
    #[serde(alias = "agents")]
    agents: Option<HashMap<String, RawAgent>>,
    #[serde(alias = "stages")]
    stages: Option<HashMap<String, RawStage>>,
    #[serde(alias = "execution")]
    execution: Option<RawExecutionConfig>,
    #[serde(alias = "metrics")]
    metrics: Option<RawMetricsConfig>,
}

#[derive(Deserialize)]
struct RawAgent {
    #[serde(alias = "description")]
    description: Option<String>,
    #[serde(alias = "model")]
    model: Option<String>,
    #[serde(alias = "skills")]
    skills: Option<Vec<String>>,
    #[serde(alias = "tools")]
    tools: Option<Vec<String>>,
    #[serde(alias = "prompts")]
    prompts: Option<Vec<String>>,
    #[serde(alias = "timeout")]
    timeout: Option<u64>,
}

#[derive(Deserialize)]
struct RawStage {
    #[serde(alias = "agent")]
    agent: String,
    #[serde(alias = "description")]
    description: Option<String>,
    #[serde(alias = "dependsOn")]
    depends_on: Option<Vec<String>>,
    #[serde(alias = "input")]
    input: Option<HashMap<String, serde_json::Value>>,
    #[serde(alias = "execution")]
    execution: Option<RawStageExecution>,
}

#[derive(Deserialize)]
struct RawStageExecution {
    #[serde(alias = "mode")]
    mode: Option<String>,
    #[serde(alias = "batchSize")]
    batch_size: Option<usize>,
    #[serde(alias = "retry")]
    retry: Option<RawRetryConfig>,
}

#[derive(Deserialize)]
struct RawRetryConfig {
    #[serde(alias = "maxAttempts")]
    max_attempts: Option<u32>,
    #[serde(alias = "backoffMs")]
    backoff_ms: Option<u64>,
}

#[derive(Deserialize)]
struct RawExecutionConfig {
    #[serde(alias = "mode")]
    mode: Option<String>,
    #[serde(alias = "parallelStages")]
    parallel_stages: Option<Vec<Vec<String>>>,
    #[serde(alias = "onFailure")]
    on_failure: Option<String>,
    #[serde(alias = "incremental")]
    incremental: Option<RawIncrementalConfig>,
}

#[derive(Deserialize)]
struct RawIncrementalConfig {
    #[serde(alias = "enabled")]
    enabled: Option<bool>,
    #[serde(alias = "cacheDir")]
    cache_dir: Option<String>,
    #[serde(alias = "skipIfOutputsValid")]
    skip_if_outputs_valid: Option<bool>,
}

#[derive(Deserialize)]
struct RawMetricsConfig {
    #[serde(alias = "streaming")]
    streaming: Option<bool>,
    #[serde(alias = "interval")]
    interval_ms: Option<u64>,
    #[serde(alias = "channels")]
    channels: Option<Vec<String>>,
}
