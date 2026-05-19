/**
 * PromptEditorPage — /studio/projects/:projectId/design/prompts/:promptId/editor
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMcpTools } from '@/hooks/useMcpTools';
import { useResourceApi } from '@/hooks/useResourceApi';

export function PromptEditorPage() {
  const { projectId, promptId } = useParams();
  const navigate = useNavigate();
  const { getResourceByArn } = useMcpTools();
  const { createResource, updateResource } = useResourceApi();
  const isNew = promptId === 'new';
  const arn = `arn:local:project/${projectId}:prompt/${promptId}`;

  const [prompt, setPrompt] = useState<{ name: string; namespace: string; content?: string; variables?: string[] } | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) { setLoading(false); setPrompt({ name: 'New Prompt', namespace: `project/${projectId}`, content: '', variables: [] }); return; }
    getResourceByArn(`arn:local:project/${projectId}:prompt/${promptId}`).then(r => { if (r) setPrompt((r as unknown as { data: typeof prompt }).data); }).finally(() => setLoading(false));
  }, [isNew, projectId, promptId, getResourceByArn]);

  const handleSave = async () => {
    if (!prompt) return;
    setSaving(true);
    try {
      const body = {
        name: prompt.name,
        description: '',
        content: prompt.content ?? '',
      };

      if (isNew) {
        await createResource('prompt', body);
      } else {
        await updateResource(arn, body);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><span className="text-text-muted text-sm animate-pulse">Loading...</span></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border-subtle bg-bg-elevated/30">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/studio/projects/${projectId}/design/prompts`)} className="text-text-muted hover:text-text-primary text-sm">← Prompts</button>
          <div className="w-px h-4 bg-border-subtle" />
          <h1 className="text-base font-semibold text-text-primary">{isNew ? 'New Prompt' : promptId}</h1>
        </div>
        <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 bg-accent text-white text-sm font-medium rounded disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {prompt && (
          <div className="max-w-2xl space-y-6">
            <div><label className="block text-xs font-medium text-text-muted mb-1">Name</label>
              <input type="text" value={prompt.name} onChange={e => setPrompt(p => p ? { ...p, name: e.target.value } : null)} className="w-full text-sm bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary outline-none focus:border-accent" /></div>
            <div><label className="block text-xs font-medium text-text-muted mb-1">Template Content</label>
              <textarea value={prompt.content ?? ''} onChange={e => setPrompt(p => p ? { ...p, content: e.target.value } : null)} rows={16} className="w-full text-sm bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary outline-none focus:border-accent resize-none font-mono" /></div>
            <div><label className="block text-xs font-medium text-text-muted mb-1">Variables (comma-separated)</label>
              <input type="text" value={(prompt.variables ?? []).join(', ')} onChange={e => setPrompt(p => p ? { ...p, variables: e.target.value.split(',').map(v => v.trim()).filter(Boolean) } : null)} className="w-full text-sm bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary outline-none focus:border-accent" /></div>
          </div>
        )}
      </div>
    </div>
  );
}
