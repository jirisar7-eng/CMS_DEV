"use client";

import React, { useEffect, useState } from 'react';
import { ChevronDown, FolderOpen } from 'lucide-react';

interface Project {
  id: string;
  name: string;
}

function setCookie(id: string) {
  if (typeof document !== 'undefined') {
    document.cookie = `syn_project_id=${id}; path=/; max-age=31536000`;
  }
}

export function ProjectSelector() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    fetch('/api/admin/projects')
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch projects");
        return res.json();
      })
      .then((data: Project[]) => {
        if (!mounted) return;
        setProjects(data);

        // Read cookie asynchronously to avoid sync setState in effect
        const match = document.cookie.match(/(?:^|;)\s*syn_project_id=([^;]*)/);
        const cookieId = match ? match[1] : null;

        // Ensure the stored ID is actually valid and authorized (returned from API)
        if (cookieId && data.some(p => p.id === cookieId)) {
          setActiveProjectId(cookieId);
        } else {
          setActiveProjectId(null);
        }
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Failed to load projects", err);
        if (mounted) setIsLoading(false);
      });

    return () => { mounted = false; };
  }, []);

  const handleSelect = (id: string) => {
    setCookie(id);
    setActiveProjectId(id);
    setIsOpen(false);
    window.location.reload();
  };

  const activeProject = projects.find(p => p.id === activeProjectId);

  if (isLoading) {
    return (
      <div className="w-full px-3 py-1.5 h-9 bg-muted/50 animate-pulse rounded-lg border border-border"></div>
    );
  }

  // The user explicitly requested to NOT have a default fallback and to show "Projekt nevybrán"
  // if it's invalid or empty.
  
  return (
    <div className="relative">
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors text-sm font-medium w-full text-left"
      >
        <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="truncate flex-1">
          {activeProject?.name || 'Projekt nevybrán'}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
          {projects.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground italic">Žádné projekty</div>
          ) : (
            projects.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelect(p.id)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${activeProjectId === p.id ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'}`}
              >
                {p.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
