/**
 * useProjects — fetches the list of projects from Studio REST API.
 * Falls back to ['app'] if the API is not available.
 */

import { useEffect, useState } from 'react';
import { restApiUrl } from '@/lib/apiBase';

export interface Project {
  id: string;
  name: string;
  description?: string;
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([{ id: 'app', name: 'app' }]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(restApiUrl('/workspaces'));
        if (res.ok) {
          const data = await res.json() as { workspaces?: Array<{ id: string; name: string }> };
          if (data.workspaces && data.workspaces.length > 0) {
            setProjects(data.workspaces.map((w) => ({ id: w.id, name: w.name })));
          }
        }
      } catch {
        // Keep fallback list
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { projects, loading };
}
