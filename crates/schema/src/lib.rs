//! Schema Bounded Context
//!
//! Generates JSON Schema from Rust types using schemars.
//! These schemas drive Monaco editor validation and autocomplete.
//!
//! ## Design
//!
//! - Each spec type mirrors the YAML file format for a resource
//! - `#[derive(JsonSchema)]` on all spec types — schemas NEVER desync from code
//! - `#[derive(Serialize, Deserialize)]` for serde to parse YAML/JSON
//! - Frontmatter types (Skill, Prompt, Template) are the YAML header only
//!
//! ## Schema Types
//!
//! | Resource | Schema Type | File Format |
//! |----------|-------------|-------------|
//! | Agent | `AgentSpec` | Pure YAML |
//! | Skill | `SkillFrontmatter` | YAML frontmatter + Markdown body |
//! | Prompt | `PromptFrontmatter` | YAML frontmatter + Markdown body |
//! | Template | `TemplateFrontmatter` | YAML frontmatter + native format body |
//! | Tool | `ToolSpec` | Pure YAML |
//! | Workflow | `WorkflowSpec` | Pure YAML |

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================================
// Agent Spec — ADR-0010
// ============================================================================

/// Agent configuration stored in YAML files.
/// This is the schema for `agents/*.yaml` files.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct AgentSpec {
    /// Full ARN identifier
    pub arn: String,

    /// Kebab-case name, max 64 characters
    pub name: String,

    /// Human-readable description
    pub description: Option<String>,

    /// Provider and model ID (e.g. "anthropic/claude-3-5-sonnet")
    pub model: Option<String>,

    /// ARN of the Prompt resource for system instructions (single reference)
    pub prompt: Option<String>,

    /// ARN references to Skill resources
    #[serde(default)]
    pub skills: Vec<String>,

    /// Tool enable/disable map — tool name → enabled
    #[serde(default)]
    pub tools: HashMap<String, bool>,

    /// Granular permission config (glob patterns, ask/allow/deny)
    #[serde(default)]
    pub permission: Option<serde_json::Value>,

    /// Sampling temperature (0.0-2.0)
    #[schemars(range(min = 0.0, max = 2.0))]
    pub temperature: Option<f64>,

    /// Nucleus sampling threshold (0.0-1.0)
    #[schemars(range(min = 0.0, max = 1.0))]
    pub top_p: Option<f64>,

    /// Max agentic iterations before forcing text-only response
    #[schemars(range(min = 1, max = 10000))]
    pub steps: Option<u32>,

    /// Agent mode: primary | subagent | all
    #[serde(default = "default_agent_mode")]
    pub mode: Option<AgentMode>,

    /// Hide from autocomplete (subagent only)
    #[serde(default)]
    pub hidden: Option<bool>,

    /// Visual color: hex (#FF5733) or theme color
    pub color: Option<String>,

    /// Model variant identifier
    pub variant: Option<String>,

    /// Arbitrary passthrough to provider as model options
    #[serde(default)]
    pub options: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentMode {
    Primary,
    Subagent,
    All,
}

fn default_agent_mode() -> Option<AgentMode> {
    Some(AgentMode::Primary)
}

// ============================================================================
// Skill Frontmatter — ADR-0011
// ============================================================================

/// Skill frontmatter stored in SKILL.md YAML header.
/// Schema for the `---...---` block at the start of SKILL.md files.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SkillFrontmatter {
    /// Full ARN identifier
    pub arn: String,

    /// Kebab-case name, max 64 characters
    pub name: String,

    /// Human-readable description (Mattpocock format: first sentence = what it does, second = triggers)
    pub description: Option<String>,

    /// Scope: global or workspace/{id}
    #[serde(default = "default_global_scope")]
    pub scope: Option<String>,

    /// Path to SKILL.md file (relative to registry root)
    pub content_path: Option<String>,

    /// Semantic version
    #[serde(default = "default_version")]
    pub version: Option<String>,

    /// Author identifier
    pub author: Option<String>,

    /// License identifier (e.g. MIT, Apache-2.0)
    pub license: Option<String>,

    /// Trigger phrases for agent discovery
    #[serde(default)]
    pub triggers: Vec<String>,

    /// ARN references to other skills (shared modules)
    #[serde(default)]
    pub references: Vec<String>,

    /// Tool names this skill requires — agents must merge into their tools
    #[serde(default)]
    pub required_tools: Vec<String>,
}

fn default_global_scope() -> Option<String> {
    Some("global".to_string())
}

fn default_version() -> Option<String> {
    Some("1.0.0".to_string())
}

// ============================================================================
// Prompt Frontmatter — ADR-0012
// ============================================================================

/// Prompt frontmatter stored in prompt markdown files.
/// Schema for the `---...---` block at the start of prompt .md files.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct PromptFrontmatter {
    /// Full ARN identifier
    pub arn: String,

    /// Kebab-case name, max 64 characters
    pub name: String,

    /// Human-readable description
    pub description: Option<String>,

    /// Scope: global or workspace/{id}
    #[serde(default = "default_global_scope")]
    pub scope: Option<String>,

    /// Path to prompt body file with {{variable}} placeholders
    pub content_path: Option<String>,

    /// Prompt classification
    #[serde(default = "default_prompt_kind")]
    pub kind: Option<PromptKind>,

    /// ARN of Template resource for output format
    pub template: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PromptKind {
    System,
    User,
    Template,
}

fn default_prompt_kind() -> Option<PromptKind> {
    Some(PromptKind::System)
}

// ============================================================================
// Template Frontmatter — ADR-0013
// ============================================================================

/// Template frontmatter stored in template files.
/// Schema for the `---...---` block at the start of template files.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct TemplateFrontmatter {
    /// Full ARN identifier
    pub arn: String,

    /// Kebab-case name, max 64 characters
    pub name: String,

    /// Human-readable description
    pub description: Option<String>,

    /// Scope: global or workspace/{id}
    #[serde(default = "default_global_scope")]
    pub scope: Option<String>,

    /// Path to template file in native format (markdown, json, yaml, text)
    pub content_path: Option<String>,

    /// Output format: markdown | json | yaml | text
    pub format: TemplateFormat,

    /// What resource type uses this template
    #[serde(default = "default_target_kind")]
    pub target_kind: Option<TargetKind>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TemplateFormat {
    Markdown,
    Json,
    Yaml,
    Text,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TargetKind {
    Prompt,
    Agent,
    Skill,
    Tool,
    Any,
}

fn default_target_kind() -> Option<TargetKind> {
    Some(TargetKind::Any)
}

// ============================================================================
// Tool Spec — ADR-0014
// ============================================================================

/// Tool configuration stored in YAML files.
/// Schema for `tools/*.yaml` files.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct ToolSpec {
    /// Full ARN identifier
    pub arn: String,

    /// Kebab-case name, max 64 characters
    pub name: String,

    /// Human-readable description
    pub description: Option<String>,

    /// Tool origin: mcp://{server} | builtin://{name} | custom://{name}
    pub source: Option<String>,

    /// Tool source type: mcp | builtin | custom
    pub source_type: Option<ToolSourceType>,

    /// JSON Schema describing input parameters
    #[serde(default)]
    pub input_schema: Option<serde_json::Value>,

    /// JSON Schema describing output (optional)
    #[serde(default)]
    pub output_schema: Option<serde_json::Value>,

    /// Catalog grouping category
    pub category: Option<String>,

    /// Search/filter labels
    #[serde(default)]
    pub tags: Vec<String>,

    /// Path to implementation script (custom tools only)
    pub implementation_path: Option<String>,

    /// Runtime for custom tools: bash | node | python
    pub runtime: Option<String>,

    /// Scope: global or workspace/{id}
    #[serde(default = "default_global_scope")]
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ToolSourceType {
    Mcp,
    Builtin,
    Custom,
}

// ============================================================================
// Workflow Spec
// ============================================================================

/// Workflow configuration stored in YAML files.
/// Schema for `workflows/*.yaml` files.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct WorkflowSpec {
    /// Full ARN identifier
    pub arn: String,

    /// Kebab-case name, max 64 characters
    pub name: String,

    /// Semantic version
    #[serde(default = "default_version")]
    pub version: Option<String>,

    /// Human-readable description
    pub description: Option<String>,

    /// Scope: global or workspace/{id}
    #[serde(default = "default_global_scope")]
    pub scope: Option<String>,

    /// Agent definitions (name → config)
    #[serde(default)]
    pub agents: HashMap<String, AgentDefinitionSpec>,

    /// Skill references (name → config)
    #[serde(default)]
    pub skills: HashMap<String, SkillReferenceSpec>,

    /// Stage definitions
    #[serde(default)]
    pub stages: Vec<StageSpec>,

    /// Global execution configuration
    #[serde(default)]
    pub execution: Option<ExecutionConfigSpec>,

    /// Metrics configuration
    #[serde(default)]
    pub metrics: Option<MetricsConfigSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct AgentDefinitionSpec {
    pub name: String,
    pub description: Option<String>,
    pub model: Option<String>,
    pub skills: Vec<String>,
    pub tools: Vec<String>,
    pub prompts: Vec<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SkillReferenceSpec {
    pub source: Option<String>,
    pub triggers: Vec<String>,
    #[serde(default)]
    pub compact_rules: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct StageSpec {
    pub id: String,
    pub agent: String,
    #[serde(default)]
    pub depends_on: Vec<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub input: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub output: Option<StageOutputSpec>,
    #[serde(default)]
    pub execution: Option<StageExecutionSpec>,
    #[serde(default)]
    pub conditions: Vec<ConditionSpec>,
    #[serde(default)]
    pub metrics: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct StageOutputSpec {
    #[serde(default)]
    pub artifacts: Vec<ArtifactRefSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct ArtifactRefSpec {
    pub name: String,
    pub path_template: Option<String>,
    pub content_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct StageExecutionSpec {
    pub mode: Option<ExecutionModeSpec>,
    pub batch_size: Option<usize>,
    #[serde(default)]
    pub retry: Option<RetryConfigSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionModeSpec {
    Sequential,
    Parallel,
    Batch,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct RetryConfigSpec {
    pub max_attempts: Option<u32>,
    pub backoff_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct ConditionSpec {
    pub when: String,
    #[serde(rename = "operator")]
    pub condition_operator: ConditionOperatorSpec,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConditionOperatorSpec {
    Equals,
    NotEquals,
    In,
    NotIn,
    GreaterThan,
    LessThan,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct ExecutionConfigSpec {
    pub mode: Option<WorkflowExecutionModeSpec>,
    #[serde(default)]
    pub parallel_stages: Vec<Vec<String>>,
    #[serde(default)]
    pub on_failure: Option<FailureStrategySpec>,
    #[serde(default)]
    pub incremental: Option<IncrementalConfigSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowExecutionModeSpec {
    Sequential,
    Parallel,
    Hybrid,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FailureStrategySpec {
    Stop,
    Continue,
    Interactive,
    Retry,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct IncrementalConfigSpec {
    #[serde(default)]
    pub enabled: Option<bool>,
    pub cache_dir: Option<String>,
    #[serde(default)]
    pub skip_if_outputs_valid: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct MetricsConfigSpec {
    #[serde(default = "default_metrics_streaming")]
    pub streaming: Option<bool>,
    #[serde(default = "default_metrics_interval")]
    pub interval_ms: Option<u64>,
    #[serde(default)]
    pub channels: Vec<String>,
}

fn default_metrics_streaming() -> Option<bool> {
    Some(true)
}

fn default_metrics_interval() -> Option<u64> {
    Some(1000_u64)
}

// ============================================================================
// Schema Registry
// ============================================================================

/// Resource types that have JSON Schema schemas
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SchemaType {
    Agent,
    Skill,
    Prompt,
    Template,
    Tool,
    Workflow,
}

impl SchemaType {
    /// Parse from string (used by the REST API endpoint)
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "agent" => Some(Self::Agent),
            "skill" => Some(Self::Skill),
            "prompt" => Some(Self::Prompt),
            "template" => Some(Self::Template),
            "tool" => Some(Self::Tool),
            "workflow" => Some(Self::Workflow),
            _ => None,
        }
    }
}

/// Get the JSON Schema for a resource type as a JSON value.
/// Returns None if the type is unknown.
pub fn get_schema_for_type(schema_type: SchemaType) -> Option<serde_json::Value> {
    let schema = match schema_type {
        SchemaType::Agent => schemars::schema_for!(AgentSpec),
        SchemaType::Skill => schemars::schema_for!(SkillFrontmatter),
        SchemaType::Prompt => schemars::schema_for!(PromptFrontmatter),
        SchemaType::Template => schemars::schema_for!(TemplateFrontmatter),
        SchemaType::Tool => schemars::schema_for!(ToolSpec),
        SchemaType::Workflow => schemars::schema_for!(WorkflowSpec),
    };
    serde_json::to_value(schema).ok()
}

/// Get the JSON Schema for a resource type by name string.
/// Returns None if the type is unknown.
pub fn get_schema_by_name(name: &str) -> Option<serde_json::Value> {
    SchemaType::from_str(name).and_then(get_schema_for_type)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_schema_generation() {
        let schema = get_schema_for_type(SchemaType::Agent);
        assert!(schema.is_some());
        let schema = schema.unwrap();
        assert!(schema.get("title").is_some());
    }

    #[test]
    fn test_skill_schema_generation() {
        let schema = get_schema_for_type(SchemaType::Skill);
        assert!(schema.is_some());
    }

    #[test]
    fn test_prompt_schema_generation() {
        let schema = get_schema_for_type(SchemaType::Prompt);
        assert!(schema.is_some());
    }

    #[test]
    fn test_template_schema_generation() {
        let schema = get_schema_for_type(SchemaType::Template);
        assert!(schema.is_some());
    }

    #[test]
    fn test_tool_schema_generation() {
        let schema = get_schema_for_type(SchemaType::Tool);
        assert!(schema.is_some());
    }

    #[test]
    fn test_workflow_schema_generation() {
        let schema = get_schema_for_type(SchemaType::Workflow);
        assert!(schema.is_some());
    }

    #[test]
    fn test_schema_by_name() {
        assert!(get_schema_by_name("agent").is_some());
        assert!(get_schema_by_name("Agent").is_some());
        assert!(get_schema_by_name("AGENT").is_some());
        assert!(get_schema_by_name("unknown").is_none());
    }

    #[test]
    fn test_schema_types_from_str() {
        assert_eq!(SchemaType::from_str("agent"), Some(SchemaType::Agent));
        assert_eq!(SchemaType::from_str("skill"), Some(SchemaType::Skill));
        assert_eq!(SchemaType::from_str("prompt"), Some(SchemaType::Prompt));
        assert_eq!(SchemaType::from_str("template"), Some(SchemaType::Template));
        assert_eq!(SchemaType::from_str("tool"), Some(SchemaType::Tool));
        assert_eq!(SchemaType::from_str("workflow"), Some(SchemaType::Workflow));
        assert_eq!(SchemaType::from_str("unknown"), None);
    }
}
