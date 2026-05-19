/**
 * SkillEditorPage — /studio/projects/:projectId/design/skills/:skillId/editor
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMcpTools } from '@/hooks/useMcpTools';
import { useResourceApi } from '@/hooks/useResourceApi';

export function SkillEditorPage() {
  const { projectId, skillId } = useParams();
  const navigate = useNavigate();
  const { getResourceByArn } = useMcpTools();
  const { createResource, updateResource } = useResourceApi();
  const isNew = skillId === 'new';
  const arn = `arn:local:project/${projectId}:skill/${skillId}`;

  const [skill, setSkill] = useState<{ name: string; namespace: string; description?: string; instructions?: string; triggers?: string[] } | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) { setLoading(false); setSkill({ name: 'New Skill', namespace: `project/${projectId}`, instructions: '', triggers: [] }); return; }
    getResourceByArn(`arn:local:project/${projectId}:skill/${skillId}`).then(r => { if (r) setSkill((r as unknown as { data: typeof skill }).data); }).finally(() => setLoading(false));
  }, [isNew, projectId, skillId, getResourceByArn]);

  const handleSave = async () => {
    if (!skill) return;
    setSaving(true);
    try {
      const body = {
        name: skill.name,
        description: skill.description ?? '',
        content: skill.instructions ?? '',
        triggers: skill.triggers ?? [],
      };

      if (isNew) {
        await createResource('skill', body);
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
          <button onClick={() => navigate(`/studio/projects/${projectId}/design/skills`)} className="text-secondary hover:text-on-surface text-sm">← Skills</button>
          <div className="w-px h-4 bg-border-subtle" />
          <h1 className="text-base font-semibold text-on-surface">{isNew ? 'New Skill' : skillId}</h1>
        </div>
        <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 bg-primary text-on-primary text-sm font-medium rounded disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {skill && (
          <div className="max-w-xl space-y-6">
            <div><label className="block text-xs font-medium text-secondary mb-1">Name</label>
              <input type="text" value={skill.name} onChange={e => setSkill(s => s ? { ...s, name: e.target.value } : null)} className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary" /></div>
            <div><label className="block text-xs font-medium text-secondary mb-1">Instructions</label>
              <textarea value={skill.instructions ?? ''} onChange={e => setSkill(s => s ? { ...s, instructions: e.target.value } : null)} rows={12} className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary resize-none font-mono" /></div>
            <div><label className="block text-xs font-medium text-secondary mb-1">Triggers (comma-separated)</label>
              <input type="text" value={(skill.triggers ?? []).join(', ')} onChange={e => setSkill(s => s ? { ...s, triggers: e.target.value.split(',').map(t => t.trim()).filter(Boolean) } : null)} className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary" /></div>
          </div>
        )}
      </div>
    </div>
  );
}
