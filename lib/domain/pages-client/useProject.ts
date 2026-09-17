import { useState, useEffect } from 'react';
import { normalizeAdminProjectId } from './project-context';

export function useActiveProject() {
  const [projectId, setProjectId] = useState<string | null>(null);
  
  useEffect(() => {
    // Read cookie asynchronously to avoid sync setState during mount effect,
    // which triggers React cascading render warnings.
    // This is purely a UI representation; real authorization happens on the server.
    Promise.resolve().then(() => {
      const match = document.cookie.match(/(?:^|;)\s*syn_project_id=([^;]*)/);
      if (match) {
        setProjectId(normalizeAdminProjectId(match[1]));
      }
    });
  }, []);
  
  return projectId;
}
