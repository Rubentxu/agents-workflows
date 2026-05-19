/**
 * ToolEditorPage — /studio/projects/:projectId/design/tools/:toolId/editor
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMcpTools } from '@/hooks/useMcpTools';
import { useResourceApi } from '@/hooks/useResourceApi';

export function ToolEditorPage() {
  const { projectId, toolId } = useParams();
  const navigate = useNavigate();
  const { getResourceByArn } = useMcpTools();
  const { createResource, updateResource } = useResourceApi();
  const isNew = toolId === 'new';
  const arn = `arn:local:project/${projectId}:tool/${toolId}`;

  const [tool, setTool] = useState<{ name: string; namespace: string; description?: string; schema?: string } | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) { setLoading(false); setTool({ name: 'New Tool', namespace: `project/${projectId}`, schema: '{}' }); return; }
    getResourceByArn(`arn:local:project/${projectId}:tool/${toolId}`).then(r => { if (r) setTool((r as unknown as { data: typeof tool }).data); }).finally(() => setLoading(false));
  }, [isNew, projectId, toolId, getResourceByArn]);

  const handleSave = async () => {
    if (!tool) return;
    setSaving(true);
    try {
      let schemaObj = {};
      try { schemaObj = JSON.parse(tool.schema ?? '{}'); } catch { /* ignore */ }

      const body = {
        name: tool.name,
        description: tool.description ?? '',
        input_schema: schemaObj,
      };

      if (isNew) {
        await createResource('tool', body);
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
          <button onClick={() => navigate(`/studio/projects/${projectId}/design/tools`)} className="text-text-muted hover:text-text-primary text-sm">← Tools</button>
          <div className="w-px h-4 bg-border-subtle" />
          <h1 className="text-base font-semibold text-text-primary">{isNew ? 'New Tool' : toolId}</h1>
        </div>
        <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 bg-accent text-white text-sm font-medium rounded disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {tool && (
          <div className="max-w-xl space-y-6">
            <div><label className="block text-xs font-medium text-text-muted mb-1">Name</label>
              <input type="text" value={tool.name} onChange={e => setTool(t => t ? { ...t, name: e.target.value } : null)} className="w-full text-sm bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary outline-none focus:border-accent" /></div>
            <div><label className="block text-xs font-medium text-text-muted mb-1">Description</label>
              <textarea value={tool.description ?? ''} onChange={e => setTool(t => t ? { ...t, description: e.target.value } : null)} rows={2} className="w-full text-sm bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary outline-none focus:border-accent resize-none" /></div>
            <div><label className="block text-xs font-medium text-text-muted mb-1">JSON Schema</label>
              <textarea value={tool.schema ?? '{}'} onChange={e => setTool(t => t ? { ...t, schema: e.target.value } : null)} rows={12} className="w-full text-sm bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary outline-none focus:border-accent resize-none font-mono" /></div>
          </div>
        )}
      </div>
    </div>
  );
}
