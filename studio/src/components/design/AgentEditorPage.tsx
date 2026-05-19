/**
 * AgentEditorPage — /studio/projects/:projectId/design/agents/:agentId/editor
 * Full-page agent editor with model/provider config and resource bindings.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMcpTools } from '@/hooks/useMcpTools';
import { useResourceApi } from '@/hooks/useResourceApi';

type Tab = 'config' | 'resources' | 'yaml';

interface AgentData {
  id: string;
  name: string;
  namespace: string;
  description?: string;
  model?: string;
  provider?: string;
  skills?: string[];
  prompts?: string[];
  tools?: string[];
  timeout_ms?: number;
}

export function AgentEditorPage() {
  const { projectId, agentId } = useParams();
  const navigate = useNavigate();
  const { getResourceByArn } = useMcpTools();
  const { createResource, updateResource } = useResourceApi();

  const isNew = agentId === 'new';
  const arn = `arn:local:project/${projectId}:agent/${agentId}`;

  const [agent, setAgent] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('config');
  const [saving, setSaving] = useState(false);

  const fetchAgent = useCallback(async () => {
    if (isNew) { setLoading(false); return; }
    const targetArn = `arn:local:project/${projectId}:agent/${agentId}`;
    setLoading(true);
    setError(null);
    try {
      const result = await getResourceByArn(targetArn);
      if (!result) { setError('Agent not found'); return; }
      const ag = result as unknown as { kind: string; data: AgentData };
      setAgent(ag.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent');
    } finally {
      setLoading(false);
    }
  }, [isNew, projectId, agentId, getResourceByArn]);

  useEffect(() => { fetchAgent(); }, [fetchAgent]);

  useEffect(() => {
    if (isNew && !agent) {
      setAgent({
        id: '',
        name: 'New Agent',
        namespace: `project/${projectId}`,
        description: '',
        model: 'gpt-4',
        provider: 'openai',
        skills: [],
        prompts: [],
        tools: [],
        timeout_ms: 60000,
      });
    }
  }, [isNew, agent, projectId]);

  const handleSave = useCallback(async () => {
    if (!agent) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: agent.name,
        description: agent.description ?? '',
        model: agent.model ?? 'gpt-4',
        provider: agent.provider ?? 'openai',
        skills: agent.skills ?? [],
        prompts: agent.prompts ?? [],
        tools: agent.tools ?? [],
        timeout_ms: agent.timeout_ms ?? 60000,
      };

      let success = false;
      if (isNew) {
        const returnedArn = await createResource('agent', {
          scope: 'global',
          ...body,
        });
        success = !!returnedArn;
      } else {
        success = await updateResource(arn, body);
      }

      if (!success) {
        setError('Failed to save agent');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [agent, isNew, arn, createResource, updateResource]);

  if (loading && !isNew) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-secondary text-sm animate-pulse">Loading agent...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-outline-variant bg-surface-container/30">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/studio/projects/${projectId}/design/agents`)} className="text-secondary hover:text-on-surface transition-colors text-sm">← Agents</button>
          <div className="w-px h-4 bg-border-subtle" />
          <h1 className="text-base font-semibold text-on-surface">{isNew ? 'New Agent' : (agent?.name ?? agentId)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 bg-primary text-on-primary text-sm font-medium rounded hover:bg-primary/90 transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {error && <div className="mx-6 mt-4 p-3 bg-error/10 border border-primary-error/20 rounded text-error text-sm">{error}</div>}

      {/* Tab nav */}
      <div className="flex px-6 border-b border-outline-variant bg-surface-container/20">
        {(['config', 'resources', 'yaml'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-secondary hover:text-on-surface'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'config' && agent && (
          <div className="max-w-xl space-y-6">
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">Name</label>
              <input type="text" value={agent.name} onChange={(e) => setAgent((a) => a ? { ...a, name: e.target.value } : null)} className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">Description</label>
              <textarea value={agent.description ?? ''} onChange={(e) => setAgent((a) => a ? { ...a, description: e.target.value } : null)} rows={3} className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Model</label>
                <input type="text" value={agent.model ?? ''} onChange={(e) => setAgent((a) => a ? { ...a, model: e.target.value } : null)} placeholder="gpt-4" className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Provider</label>
                <select value={agent.provider ?? 'openai'} onChange={(e) => setAgent((a) => a ? { ...a, provider: e.target.value } : null)} className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-secondary outline-none focus:border-primary">
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                  <option value="ollama">Ollama</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">Timeout (ms)</label>
              <input type="number" value={agent.timeout_ms ?? 60000} onChange={(e) => setAgent((a) => a ? { ...a, timeout_ms: parseInt(e.target.value) } : null)} className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary" />
            </div>
          </div>
        )}

        {activeTab === 'resources' && agent && (
          <div className="max-w-xl space-y-6">
            <p className="text-sm text-secondary">Bind Skills, Prompts, and Tools to this agent.</p>
            {(['skills', 'prompts', 'tools'] as const).map((type) => {
              const items = (agent as unknown as Record<string, string[]>)[type] ?? [];
              return (
                <div key={type}>
                  <label className="block text-xs font-medium text-secondary mb-2 capitalize">{type}</label>
                  <div className="bg-surface-container border border-outline-variant rounded-lg p-3 min-h-[60px]">
                    {items.length === 0 ? (
                      <p className="text-xs text-secondary text-center py-2">No {type} bound</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {items.map((arn, i) => (
                          <span key={i} className="text-xs font-mono px-2 py-1 rounded bg-surface border border-outline-variant text-secondary">{arn.split('/').pop()}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'yaml' && (
          <div className="h-full">
            <pre className="text-xs font-mono text-secondary bg-surface-container border border-outline-variant rounded p-4 overflow-auto">
              {JSON.stringify(agent, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
