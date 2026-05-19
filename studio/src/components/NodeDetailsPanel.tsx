import { useWorkflowEditorStore } from '@/stores/workflowEditorStore';
import { useRegistryCacheStore } from '@/stores/registryCacheStore';
import type { Stage, AgentDefinition } from '@/types';

export function NodeDetailsPanel() {
  const workflow = useWorkflowEditorStore((state) => state.workflow);
  const selectedNodeId = useWorkflowEditorStore((state) => state.selectedNodeId);
  const nodes = useRegistryCacheStore((state) => state.nodes);

  if (!selectedNodeId || !workflow) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        Select a node to see its details
      </div>
    );
  }

  // Check if it's a stage
  const stage = workflow.stages.find((s) => s.id === selectedNodeId);
  if (stage) {
    return <StageDetails stage={stage} />;
  }

  // Check if it's an agent
  const agent = workflow.agents[selectedNodeId];
  if (agent) {
    return <AgentDetails agent={agent} agentKey={selectedNodeId} />;
  }

  // Check if it's a registry node
  const registryNode = nodes.find((n) => n.id === selectedNodeId);
  if (registryNode) {
    return <RegistryNodeDetails node={registryNode} />;
  }

  return (
    <div className="h-full flex items-center justify-center text-gray-400 text-sm">
      Unknown node type
    </div>
  );
}

interface StageDetailsProps {
  stage: Stage;
}

function StageDetails({ stage }: StageDetailsProps) {
  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-gray-200">
        <h2 className="font-semibold text-gray-800">Stage: {stage.id}</h2>
        <p className="text-xs text-gray-500 mt-1">{stage.description}</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Agent */}
        <Section title="Agent">
          <div className="font-mono text-sm text-indigo-600">{stage.agent}</div>
        </Section>

        {/* Dependencies */}
        <Section title="Dependencies">
          {stage.depends_on.length > 0 ? (
            <ul className="text-sm text-gray-600 space-y-1">
              {stage.depends_on.map((dep) => (
                <li key={dep} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                  {dep}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-sm text-gray-400">No dependencies</span>
          )}
        </Section>

        {/* Execution */}
        <Section title="Execution">
          <div className="text-sm">
            <span className="text-gray-600">Mode: </span>
            <span className="font-medium">{stage.execution.mode}</span>
            {stage.execution.batch_size && (
              <span className="text-gray-500 ml-2">
                (batch: {stage.execution.batch_size})
              </span>
            )}
          </div>
          <div className="text-sm mt-1">
            <span className="text-gray-600">Retry: </span>
            <span>
              {stage.execution.retry.max_attempts} attempts,
              {stage.execution.retry.backoff_ms}ms backoff
            </span>
          </div>
        </Section>

        {/* Input */}
        <Section title="Input">
          <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
            {JSON.stringify(stage.input, null, 2)}
          </pre>
        </Section>

        {/* Output */}
        <Section title="Output">
          <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
            {JSON.stringify(stage.output, null, 2)}
          </pre>
        </Section>

        {/* Conditions */}
        {stage.conditions.length > 0 && (
          <Section title="Conditions">
            <ul className="text-sm space-y-2">
              {stage.conditions.map((cond, i) => (
                <li key={i} className="bg-amber-50 p-2 rounded text-xs">
                  <span className="font-mono text-amber-700">{cond.when}</span>
                  <span className="text-gray-500"> {cond.operator} </span>
                  <span className="text-amber-700">
                    {JSON.stringify(cond.value)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Metrics */}
        {stage.metrics.length > 0 && (
          <Section title="Metrics">
            <div className="flex flex-wrap gap-2">
              {stage.metrics.map((metric) => (
                <span
                  key={metric}
                  className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded"
                >
                  {metric}
                </span>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

interface AgentDetailsProps {
  agent: AgentDefinition;
  agentKey: string;
}

function AgentDetails({ agent, agentKey }: AgentDetailsProps) {
  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-gray-200">
        <h2 className="font-semibold text-gray-800">Agent: {agentKey}</h2>
        <p className="text-xs text-gray-500 mt-1">{agent.description}</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Model */}
        <Section title="Model">
          <span className="text-sm font-mono text-emerald-600">{agent.model}</span>
        </Section>

        {/* Skills */}
        <Section title="Skills">
          {agent.skills.length > 0 ? (
            <ul className="space-y-1">
              {agent.skills.map((skill) => (
                <li key={skill} className="text-sm">
                  <span className="font-mono text-indigo-600">{skill}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-sm text-gray-400">No skills</span>
          )}
        </Section>

        {/* Tools */}
        <Section title="Tools">
          {agent.tools.length > 0 ? (
            <ul className="space-y-1">
              {agent.tools.map((tool) => (
                <li key={tool} className="text-sm">
                  <span className="font-mono text-orange-600">{tool}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-sm text-gray-400">No tools</span>
          )}
        </Section>

        {/* Prompts */}
        <Section title="Prompts">
          {agent.prompts.length > 0 ? (
            <ul className="space-y-1">
              {agent.prompts.map((prompt) => (
                <li key={prompt} className="text-sm">
                  <span className="font-mono text-purple-600">{prompt}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-sm text-gray-400">No prompts</span>
          )}
        </Section>

        {/* Timeout */}
        {agent.timeout_ms && (
          <Section title="Timeout">
            <span className="text-sm">{agent.timeout_ms}ms</span>
          </Section>
        )}
      </div>
    </div>
  );
}

interface RegistryNodeDetailsProps {
  node: {
    id: string;
    type: string;
    name: string;
    namespace: string;
    path?: string;
    checksum?: string;
    created_at: string;
    updated_at: string;
  };
}

function RegistryNodeDetails({ node }: RegistryNodeDetailsProps) {
  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-gray-200">
        <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded">
          {node.type}
        </span>
        <h2 className="font-semibold text-gray-800 mt-2">{node.name}</h2>
        <p className="font-mono text-xs text-gray-500 mt-1">{node.id}</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Namespace */}
        <Section title="Namespace">
          <span className="text-sm">{node.namespace}</span>
        </Section>

        {/* Path */}
        {node.path && (
          <Section title="Path">
            <span className="text-sm font-mono text-gray-600">{node.path}</span>
          </Section>
        )}

        {/* Checksum */}
        {node.checksum && (
          <Section title="Checksum">
            <span className="text-xs font-mono text-gray-500">{node.checksum}</span>
          </Section>
        )}

        {/* Timestamps */}
        <Section title="Created">
          <span className="text-sm">{new Date(node.created_at).toLocaleString()}</span>
        </Section>
        <Section title="Updated">
          <span className="text-sm">{new Date(node.updated_at).toLocaleString()}</span>
        </Section>
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}
