"use client";

import React, { useEffect, useState } from 'react';
import { ChevronDown, FolderOpen } from 'lucide-react';

interface Project {
  id: string;
  name: string;
}

export function ProjectSelector() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Read from cookie
    const match = document.cookie.match(/(?:^|;)\s*syn_project_id=([^;]*)/);
    if (match) {
      setActiveProjectId(match[1]);
    }

    fetch('/api/admin/projects')
      .then(res => res.json())
      .then(data => {
        setProjects(data);
        if (!match && data.length > 0) {
          // Auto select first if none selected
          handleSelect(data[0].id);
        }
      })
      .catch(err => console.error("Failed to load projects", err));
  }, []);

  const handleSelect = (id: string) => {
    document.cookie = `syn_project_id=${id}; path=/; max-age=31536000`;
    setActiveProjectId(id);
    setIsOpen(false);
    // Reload to apply context globally (Server Components will read the new cookie)
    window.location.reload();
  };

  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0];

  if (projects.length === 0) return null;

  return (
    <div className="relative">
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors text-sm font-medium w-full text-left"
      >
        <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="truncate flex-1">{activeProject?.name || 'Vyberte projekt'}</span>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
          {projects.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelect(p.id)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${activeProjectId === p.id ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'}`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
