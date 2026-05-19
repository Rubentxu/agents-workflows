/**
 * TemplateEditorPage — /studio/projects/:projectId/design/templates/:templateId/editor
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMcpTools } from '@/hooks/useMcpTools';
import { useResourceApi } from '@/hooks/useResourceApi';

export function TemplateEditorPage() {
  const { projectId, templateId } = useParams();
  const navigate = useNavigate();
  const { getResourceByArn } = useMcpTools();
  const { createResource, updateResource } = useResourceApi();
  const isNew = templateId === 'new';
  const arn = `arn:local:project/${projectId}:template/${templateId}`;

  const [template, setTemplate] = useState<{ name: string; namespace: string; targetKind?: string; parameters?: string; exampleValues?: string } | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) { setLoading(false); setTemplate({ name: 'New Template', namespace: `project/${projectId}`, targetKind: 'Workflow', parameters: '{}', exampleValues: '{}' }); return; }
    getResourceByArn(`arn:local:project/${projectId}:template/${templateId}`).then(r => { if (r) setTemplate((r as unknown as { data: typeof template }).data); }).finally(() => setLoading(false));
  }, [isNew, projectId, templateId, getResourceByArn]);

  const handleSave = async () => {
    if (!template) return;
    setSaving(true);
    try {
      let paramsObj = [];
      try { paramsObj = JSON.parse(template.parameters ?? '[]'); } catch { /* ignore */ }

      const body = {
        name: template.name,
        targetKind: template.targetKind ?? 'Workflow',
        parameters: paramsObj,
      };

      if (isNew) {
        await createResource('template', body);
      } else {
        await updateResource(arn, body);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><span className="text-secondary text-sm animate-pulse">Loading...</span></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-outline-variant bg-surface-container/30">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/studio/projects/${projectId}/design/templates`)} className="text-secondary hover:text-on-surface text-sm">← Templates</button>
          <div className="w-px h-4 bg-border-subtle" />
          <h1 className="text-base font-semibold text-on-surface">{isNew ? 'New Template' : templateId}</h1>
        </div>
        <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 bg-primary text-on-primary text-sm font-medium rounded disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {template && (
          <div className="max-w-xl space-y-6">
            <div><label className="block text-xs font-medium text-secondary mb-1">Name</label>
              <input type="text" value={template.name} onChange={e => setTemplate(t => t ? { ...t, name: e.target.value } : null)} className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary" /></div>
            <div><label className="block text-xs font-medium text-secondary mb-1">Target Kind</label>
              <select value={template.targetKind ?? 'Workflow'} onChange={e => setTemplate(t => t ? { ...t, targetKind: e.target.value } : null)} className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-secondary outline-none focus:border-primary">
                {['Workflow', 'Agent', 'Skill', 'Prompt', 'Tool'].map(k => <option key={k} value={k}>{k}</option>)}
              </select></div>
            <div><label className="block text-xs font-medium text-secondary mb-1">Parameter Schema (JSON)</label>
              <textarea value={template.parameters ?? '{}'} onChange={e => setTemplate(t => t ? { ...t, parameters: e.target.value } : null)} rows={8} className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary resize-none font-mono" /></div>
            <div><label className="block text-xs font-medium text-secondary mb-1">Example Values (JSON)</label>
              <textarea value={template.exampleValues ?? '{}'} onChange={e => setTemplate(t => t ? { ...t, exampleValues: e.target.value } : null)} rows={6} className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary resize-none font-mono" /></div>
          </div>
        )}
      </div>
    </div>
  );
}
