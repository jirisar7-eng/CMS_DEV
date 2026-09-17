import { useState, useEffect } from 'react';
import { normalizeAdminProjectId } from './project-context';

export function useActiveProject() {
  const [projectId, setProjectId] = useState<string | null>(null);
  
  useEffect(() => {
    const match = document.cookie.match(/(?:^|;)\s*syn_project_id=([^;]*)/);
    if (match) {
      setProjectId(normalizeAdminProjectId(match[1]));
    }
  }, []);
  
  return projectId;
}
