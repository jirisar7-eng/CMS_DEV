"use client";

import React, { useState } from "react";
import { CapabilityShell } from "@/components/admin/CapabilityShell";
import {
  Plus,
  CheckCircle2,
  FolderOpen,
  Pencil,
  Archive,
  ArrowRight,
  AlertTriangle,
  X,
  Loader2,
} from "lucide-react";

interface ProjectData {
  id: string;
  name: string;
  key: string;
  status: string;
  createdAt: Date | string;
}

interface Props {
  projects: ProjectData[];
  activeProjectId: string | null;
}

function mapProjectError(status: number): string {
  switch (status) {
    case 400:
      return "Neplatné údaje projektu.";
    case 401:
      return "Přihlášení vypršelo nebo uživatel není aktivní.";
    case 403:
      return "Nemáte oprávnění spravovat projekty.";
    case 409:
      return "Projekt s tímto klíčem již existuje.";
    default:
      return "Projekt se nepodařilo uložit.";
  }
}

export function ClientProjectList({ projects, activeProjectId }: Props) {
  // Dialog visibility and form states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createKey, setCreateKey] = useState("");

  const [editingProject, setEditingProject] = useState<ProjectData | null>(null);
  const [editName, setEditName] = useState("");

  const [archivingProject, setArchivingProject] = useState<ProjectData | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- Handlers ---

  const handleOpenCreate = () => {
    setErrorMessage(null);
    setCreateName("");
    setCreateKey("");
    setIsCreateOpen(true);
  };

  const handleCloseCreate = () => {
    if (isSubmitting) return;
    setIsCreateOpen(false);
    setErrorMessage(null);
    setCreateName("");
    setCreateKey("");
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedName = createName.trim();
    if (!trimmedName) {
      setErrorMessage("Neplatné údaje projektu.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload: { name: string; key?: string } = {
        name: trimmedName,
      };
      const trimmedKey = createKey.trim();
      if (trimmedKey) {
        payload.key = trimmedKey;
      }

      const response = await fetch("/api/admin/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setErrorMessage(mapProjectError(response.status));
        setIsSubmitting(false);
        return;
      }

      setIsCreateOpen(false);
      setCreateName("");
      setCreateKey("");
      window.location.reload();
    } catch {
      setErrorMessage("Projekt se nepodařilo uložit.");
      setIsSubmitting(false);
    }
  };

  const handleOpenRename = (project: ProjectData) => {
    setErrorMessage(null);
    setEditingProject(project);
    setEditName(project.name);
  };

  const handleCloseRename = () => {
    if (isSubmitting) return;
    setEditingProject(null);
    setErrorMessage(null);
    setEditName("");
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject || isSubmitting) return;

    const trimmedName = editName.trim();
    if (!trimmedName) {
      setErrorMessage("Neplatné údaje projektu.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/admin/projects/${encodeURIComponent(editingProject.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: trimmedName,
          }),
        }
      );

      if (!response.ok) {
        setErrorMessage(mapProjectError(response.status));
        setIsSubmitting(false);
        return;
      }

      setEditingProject(null);
      setEditName("");
      window.location.reload();
    } catch {
      setErrorMessage("Projekt se nepodařilo uložit.");
      setIsSubmitting(false);
    }
  };

  const handleOpenArchive = (project: ProjectData) => {
    setErrorMessage(null);
    setArchivingProject(project);
  };

  const handleCloseArchive = () => {
    if (isSubmitting) return;
    setArchivingProject(null);
    setErrorMessage(null);
  };

  const handleArchiveConfirm = async () => {
    if (!archivingProject || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/admin/projects/${encodeURIComponent(archivingProject.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "ARCHIVED",
          }),
        }
      );

      if (!response.ok) {
        setErrorMessage(mapProjectError(response.status));
        setIsSubmitting(false);
        return;
      }

      if (archivingProject.id === activeProjectId) {
        document.cookie = "syn_project_id=; path=/; max-age=0";
      }

      setArchivingProject(null);
      window.location.reload();
    } catch {
      setErrorMessage("Projekt se nepodařilo uložit.");
      setIsSubmitting(false);
    }
  };

  const handleSwitchProject = (projectId: string) => {
    document.cookie = `syn_project_id=${projectId}; path=/; max-age=31536000`;
    window.location.reload();
  };

  return (
    <>
      <CapabilityShell
        group="PLATFORMA"
        title="Správa projektů a prostředí"
        description="Přepínání mezi webovými projekty, izolace prostředí a správa projektových tenantů."
        status="FUNKČNÍ"
        helpKey="platform.projects.view"
        emptyTitle="Zatím nebyl založen žádný projekt"
        emptyDescription="Vytvořte nový nezávislý webový projekt v rámci Synthesis ekosystému."
        emptyActionLabel="Založit nový projekt"
        onEmptyAction={handleOpenCreate}
      >
        {() => (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">
                Dostupné projekty ({projects.length})
              </h3>
              <button
                type="button"
                onClick={handleOpenCreate}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nový projekt</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.length === 0 ? (
                <div className="col-span-full py-8 text-center bg-muted/30 border border-dashed rounded-xl">
                  <FolderOpen className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
                  <p className="text-sm font-medium text-foreground">Žádné projekty</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Nemáte přístup k žádným projektům.
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenCreate}
                    className="mt-4 px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Založit první projekt</span>
                  </button>
                </div>
              ) : (
                projects.map((p) => {
                  const isCurrent = p.id === activeProjectId;
                  const isActive = p.status === "ACTIVE";

                  return (
                    <div
                      key={p.id}
                      className={`p-5 rounded-2xl border bg-card shadow-xs flex flex-col justify-between space-y-4 transition-all ${
                        isCurrent
                          ? "border-primary ring-2 ring-primary/20"
                          : "border-border hover:border-border/80"
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                              isActive
                                ? "bg-muted text-muted-foreground"
                                : p.status === "ARCHIVED"
                                ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                                : "bg-muted text-muted-foreground/60"
                            }`}
                          >
                            {p.status}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Aktuální
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-foreground">{p.name}</h4>
                        <p className="font-mono text-[10px] text-muted-foreground">ID: {p.id}</p>
                        <p className="font-mono text-xs text-muted-foreground">{p.key}</p>
                      </div>

                      <div className="pt-3 border-t border-border mt-auto space-y-2.5">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>
                            {new Date(p.createdAt).toLocaleDateString("cs-CZ")}
                          </span>
                          {isActive ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenRename(p)}
                                className="text-xs font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>Přejmenovat</span>
                              </button>
                              <span className="text-border">•</span>
                              <button
                                type="button"
                                onClick={() => handleOpenArchive(p)}
                                className="text-xs font-semibold text-amber-600 dark:text-amber-500 hover:text-amber-700 inline-flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <Archive className="w-3 h-3" />
                                <span>Archivovat</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] font-medium text-muted-foreground italic">
                              Pouze pro čtení
                            </span>
                          )}
                        </div>

                        {isActive && (
                          <div className="pt-1 flex items-center justify-end">
                            {!isCurrent ? (
                              <button
                                type="button"
                                onClick={() => handleSwitchProject(p.id)}
                                className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                              >
                                <span>Přepnout sem</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            ) : (
                              <span className="text-xs font-semibold text-muted-foreground">
                                Otevřeno
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </CapabilityShell>

      {/* Dialog: Vytvořit projekt */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-project-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="create-project-title"
                    className="font-bold text-foreground text-sm sm:text-base"
                  >
                    Založit nový projekt
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Vytvoří nový nezávislý webový projekt.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseCreate}
                disabled={isSubmitting}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
                aria-label="Zavřít"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {errorMessage && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="project-create-name"
                  className="block text-xs font-bold text-foreground"
                >
                  Název projektu <span className="text-destructive">*</span>
                </label>
                <input
                  id="project-create-name"
                  type="text"
                  required
                  disabled={isSubmitting}
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="např. Web Hlavní"
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="project-create-key"
                  className="block text-xs font-bold text-foreground"
                >
                  Klíč projektu{" "}
                  <span className="text-muted-foreground font-normal">
                    (volitelné, např. web-hlavni)
                  </span>
                </label>
                <input
                  id="project-create-key"
                  type="text"
                  disabled={isSubmitting}
                  value={createKey}
                  onChange={(e) => setCreateKey(e.target.value)}
                  placeholder="Automaticky vygenerován, pokud nevyplněno"
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono disabled:opacity-50"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={handleCloseCreate}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-border bg-card text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Ukládám...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Vytvořit projekt</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dialog: Přejmenovat projekt */}
      {editingProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-project-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="rename-project-title"
                    className="font-bold text-foreground text-sm sm:text-base"
                  >
                    Přejmenovat projekt
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Změna zobrazovaného názvu projektu.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseRename}
                disabled={isSubmitting}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
                aria-label="Zavřít"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRenameSubmit} className="space-y-4">
              {errorMessage && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="project-rename-name"
                  className="block text-xs font-bold text-foreground"
                >
                  Nový název projektu <span className="text-destructive">*</span>
                </label>
                <input
                  id="project-rename-name"
                  type="text"
                  required
                  disabled={isSubmitting}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={handleCloseRename}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-border bg-card text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Ukládám...</span>
                    </>
                  ) : (
                    <span>Uložit změny</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dialog: Archivovat projekt */}
      {archivingProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="archive-project-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-500">
                  <Archive className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="archive-project-title"
                    className="font-bold text-foreground text-sm sm:text-base"
                  >
                    Archivovat projekt
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Potvrzení přechodu do archivního stavu.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseArchive}
                disabled={isSubmitting}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
                aria-label="Zavřít"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {errorMessage && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <p className="text-xs sm:text-sm text-foreground">
                Opravdu si přejete archivovat projekt{" "}
                <strong className="text-foreground">„{archivingProject.name}“</strong>?
              </p>

              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs space-y-1.5 leading-relaxed">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Důsledky archivace projektu:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-[11px] opacity-90 pl-1">
                  <li>Projekt bude přepnut do archivního stavu (ARCHIVED).</li>
                  <li>Veškerá data a obsah projektu zůstávají plně zachována.</li>
                  <li>Archivovaný projekt již nelze vybrat jako aktivní pracovní kontext.</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={handleCloseArchive}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-border bg-card text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleArchiveConfirm}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition-colors shadow-xs cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Archivuji...</span>
                  </>
                ) : (
                  <>
                    <Archive className="w-3.5 h-3.5" />
                    <span>Potvrdit archivaci</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
