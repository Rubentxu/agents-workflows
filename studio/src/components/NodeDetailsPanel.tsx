import { useWorkflowEditorStore } from '@/stores/workflowEditorStore';
import { useRegistryCacheStore } from '@/stores/registryCacheStore';
import type { Stage, AgentDefinition } from '@/types';

export function NodeDetailsPanel() {
  const workflow = useWorkflowEditorStore((state) => state.workflow);
  const selectedNodeId = useWorkflowEditorStore((state) => state.selectedNodeId);
  const nodes = useRegistryCacheStore((state) => state.nodes);

  if (!selectedNodeId || !workflow) {
    return (
      <div className="h-full flex items-center justify-center text-on-surface/40 text-sm">
        Select a node to see its details
      </div>
    );
  }

  const stage = workflow.stages.find((s) => s.id === selectedNodeId);
  if (stage) {
    return <StageDetails stage={stage} />;
  }

  const agent = workflow.agents[selectedNodeId];
  if (agent) {
    return <AgentDetails agent={agent} agentKey={selectedNodeId} />;
  }

  const registryNode = nodes.find((n) => n.id === selectedNodeId);
  if (registryNode) {
    return <RegistryNodeDetails node={registryNode} />;
  }

  return (
    <div className="h-full flex items-center justify-center text-on-surface/40 text-sm">
      Unknown node type
    </div>
  );
}

interface StageDetailsProps {
  stage: Stage;
}

function StageDetails({ stage }: StageDetailsProps) {
  return (
    <div className="h-full flex flex-col bg-surface-container">
      <div className="px-4 py-3 bg-surface border-b border-outline">
        <h2 className="font-semibold text-on-surface">Stage: {stage.id}</h2>
        <p className="text-xs text-on-surface/50 mt-1">{stage.description}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Section title="Agent">
          <div className="font-mono text-sm text-primary">{stage.agent}</div>
        </Section>

        <Section title="Dependencies">
          {stage.depends_on.length > 0 ? (
            <ul className="text-sm text-on-surface/60 space-y-1">
              {stage.depends_on.map((dep) => (
                <li key={dep} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-on-surface/30"></span>
                  {dep}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-sm text-on-surface/40">No dependencies</span>
          )}
        </Section>

        <Section title="Execution">
          <div className="text-sm">
            <span className="text-on-surface/60">Mode: </span>
            <span className="font-medium">{stage.execution.mode}</span>
            {stage.execution.batch_size && (
              <span className="text-on-surface/50 ml-2">
                (batch: {stage.execution.batch_size})
              </span>
            )}
          </div>
          <div className="text-sm mt-1">
            <span className="text-on-surface/60">Retry: </span>
            <span>
              {stage.execution.retry.max_attempts} attempts,
              {stage.execution.retry.backoff_ms}ms backoff
            </span>
          </div>
        </Section>

        <Section title="Input">
          <pre className="text-xs bg-surface-container-low p-2 rounded overflow-x-auto">
            {JSON.stringify(stage.input, null, 2)}
          </pre>
        </Section>

        <Section title="Output">
          <pre className="text-xs bg-surface-container-low p-2 rounded overflow-x-auto">
            {JSON.stringify(stage.output, null, 2)}
          </pre>
        </Section>

        {stage.conditions.length > 0 && (
          <Section title="Conditions">
            <ul className="text-sm space-y-2">
              {stage.conditions.map((cond, i) => (
                <li key={i} className="bg-warning-container/50 p-2 rounded text-xs">
                  <span className="font-mono text-on-warning-container">{cond.when}</span>
                  <span className="text-on-surface/50"> {cond.operator} </span>
                  <span className="text-on-warning-container">
                    {JSON.stringify(cond.value)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {stage.metrics.length > 0 && (
          <Section title="Metrics">
            <div className="flex flex-wrap gap-2">
              {stage.metrics.map((metric) => (
                <span
                  key={metric}
                  className="text-xs bg-info-container text-on-info-container px-2 py-1 rounded"
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
    <div className="h-full flex flex-col bg-surface-container">
      <div className="px-4 py-3 bg-surface border-b border-outline">
        <h2 className="font-semibold text-on-surface">Agent: {agentKey}</h2>
        <p className="text-xs text-on-surface/50 mt-1">{agent.description}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Section title="Model">
          <span className="text-sm font-mono text-success">{agent.model}</span>
        </Section>

        <Section title="Skills">
          {agent.skills.length > 0 ? (
            <ul className="space-y-1">
              {agent.skills.map((skill) => (
                <li key={skill} className="text-sm">
                  <span className="font-mono text-primary">{skill}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-sm text-on-surface/40">No skills</span>
          )}
        </Section>

        <Section title="Tools">
          {agent.tools.length > 0 ? (
            <ul className="space-y-1">
              {agent.tools.map((tool) => (
                <li key={tool} className="text-sm">
                  <span className="font-mono text-warning">{tool}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-sm text-on-surface/40">No tools</span>
          )}
        </Section>

        <Section title="Prompts">
          {agent.prompts.length > 0 ? (
            <ul className="space-y-1">
              {agent.prompts.map((prompt) => (
                <li key={prompt} className="text-sm">
                  <span className="font-mono text-secondary">{prompt}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-sm text-on-surface/40">No prompts</span>
          )}
        </Section>

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
    <div className="h-full flex flex-col bg-surface-container">
      <div className="px-4 py-3 bg-surface border-b border-outline">
        <span className="text-xs px-2 py-0.5 bg-surface-container-high text-on-surface/70 rounded">
          {node.type}
        </span>
        <h2 className="font-semibold text-on-surface mt-2">{node.name}</h2>
        <p className="font-mono text-xs text-on-surface/50 mt-1">{node.id}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Section title="Namespace">
          <span className="text-sm">{node.namespace}</span>
        </Section>

        {node.path && (
          <Section title="Path">
            <span className="text-sm font-mono text-on-surface/60">{node.path}</span>
          </Section>
        )}

        {node.checksum && (
          <Section title="Checksum">
            <span className="text-xs font-mono text-on-surface/50">{node.checksum}</span>
          </Section>
        )}

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
      <h3 className="text-xs font-semibold text-on-surface/50 uppercase tracking-wide mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}
