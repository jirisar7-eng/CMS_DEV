"use client";

import React, { useState, useEffect, useCallback } from "react";
import { CapabilityShell } from "../CapabilityShell";
import {
  History,
  FolderKanban,
  Loader2,
  RefreshCw,
  AlertCircle,
  FileText,
  RotateCcw,
  GitBranch,
  PlusCircle,
  MinusCircle,
  Edit3,
  CheckCircle2,
} from "lucide-react";

interface ContentBlock {
  id?: string;
  type: string;
  data?: Record<string, unknown>;
}

interface PageContent {
  blocks?: ContentBlock[];
  root?: Record<string, unknown>;
}

interface PageRevision {
  id: string;
  pageId: string;
  revisionNumber: number;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED";
  title: string;
  slug: string;
  locale: string;
  description: string | null;
  visibility: "PUBLIC" | "UNLISTED" | "PASSWORD_PROTECTED" | "INTERNAL";
  content: PageContent;
  seo: Record<string, unknown>;
  navigation: Record<string, unknown>;
  createdById: string | null;
  createdAt: string;
  publishedAt: string | null;
  derivedFromRevisionId: string | null;
}

interface BlockDiff {
  id: string;
  type: string;
  status: "ADDED" | "REMOVED" | "MODIFIED" | "UNCHANGED";
  summary: string;
}



export function computeRevisionDiff(
  current: {
    title: string;
    slug: string;
    description?: string | null;
    visibility?: string;
    content?: { blocks?: Array<{ id?: string; type: string; data?: Record<string, unknown> }> };
    revisionNumber?: number;
  },
  previous?: {
    title: string;
    slug: string;
    description?: string | null;
    visibility?: string;
    content?: { blocks?: Array<{ id?: string; type: string; data?: Record<string, unknown> }> };
    revisionNumber?: number;
  } | null
) {
  const titleChanged = previous ? current.title !== previous.title : false;
  const slugChanged = previous ? current.slug !== previous.slug : false;
  const descriptionChanged = previous ? current.description !== previous.description : false;
  const visibilityChanged = previous ? current.visibility !== previous.visibility : false;

  const currentBlocks = current.content?.blocks || [];
  const previousBlocks = previous?.content?.blocks || [];

  const prevBlockMap = new Map<string, { type: string; data?: Record<string, unknown> }>();
  previousBlocks.forEach((b, idx) => {
    const key = b.id || `block-${idx}`;
    prevBlockMap.set(key, b);
  });

  const blockDiffs: BlockDiff[] = [];
  const visitedPrevKeys = new Set<string>();

  currentBlocks.forEach((currBlock, idx) => {
    const key = currBlock.id || `block-${idx}`;
    const prevBlock = prevBlockMap.get(key);
    visitedPrevKeys.add(key);

    if (!prevBlock) {
      blockDiffs.push({
        id: key,
        type: currBlock.type,
        status: "ADDED",
        summary: `Přidán nový blok (${currBlock.type})`,
      });
    } else if (
      JSON.stringify(currBlock.data || {}) !== JSON.stringify(prevBlock.data || {}) ||
      currBlock.type !== prevBlock.type
    ) {
      blockDiffs.push({
        id: key,
        type: currBlock.type,
        status: "MODIFIED",
        summary: `Změna obsahu/typu bloku (${prevBlock.type} -> ${currBlock.type})`,
      });
    } else {
      blockDiffs.push({
        id: key,
        type: currBlock.type,
        status: "UNCHANGED",
        summary: `Bez beze změny (${currBlock.type})`,
      });
    }
  });

  previousBlocks.forEach((prevBlock, idx) => {
    const key = prevBlock.id || `block-${idx}`;
    if (!visitedPrevKeys.has(key)) {
      blockDiffs.push({
        id: key,
        type: prevBlock.type,
        status: "REMOVED",
        summary: `Odebrán blok (${prevBlock.type})`,
      });
    }
  });

  const hasChanges =
    titleChanged ||
    slugChanged ||
    descriptionChanged ||
    visibilityChanged ||
    blockDiffs.some((b) => b.status !== "UNCHANGED");

  return {
    titleChanged,
    slugChanged,
    descriptionChanged,
    visibilityChanged,
    blockDiffs,
    hasChanges,
    previousRevisionNumber: previous?.revisionNumber ?? null,
  };
}

export function RevisionsWorkspace({ projectId }: { projectId: string | null }) {
  const [revisions, setRevisions] = useState<PageRevision[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  const [reloadToken, setReloadToken] = useState<number>(0);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setReloadToken((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!projectId) return;

    let isMounted = true;

    async function loadRevisions() {
      try {
        const res = await fetch(`/api/admin/projects/${projectId}/revisions`);
        if (!res.ok) {
          if (res.status === 403) throw new Error("Nemáte oprávnění k zobrazení revizí (content.view).");
          if (res.status === 401) throw new Error("Relace vypršela. Přihlaste se prosím znovu.");
          throw new Error("Nepodařilo se načíst revize.");
        }
        const body = await res.json();
        if (isMounted) {
          const list: PageRevision[] = body.data?.revisions || body.revisions || [];
          setRevisions(list);
          setError(null);
          setSelectedRevisionId((curr) => {
            if (curr && list.some((r) => r.id === curr)) return curr;
            return list.length > 0 ? list[0].id : null;
          });
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : "Chyba při načítání revizí.";
          setError(msg);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadRevisions();

    return () => {
      isMounted = false;
    };
  }, [projectId, reloadToken]);

  const selectedRevision = revisions.find((r) => r.id === selectedRevisionId) || null;

  const previousRevision = selectedRevision
    ? revisions
        .filter((r) => r.pageId === selectedRevision.pageId && r.revisionNumber < selectedRevision.revisionNumber)
        .sort((a, b) => b.revisionNumber - a.revisionNumber)[0] || null
    : null;

  const diffResult = selectedRevision ? computeRevisionDiff(selectedRevision, previousRevision) : null;

  const handleReopenDraft = async () => {
    if (!selectedRevision || !projectId) return;
    setProcessing(true);
    setActionMessage(null);
    try {
      const res = await fetch(
        `/api/admin/projects/${projectId}/pages/${selectedRevision.pageId}/actions/reopen-draft`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CMS-Origin-Check": "1",
          },
          body: JSON.stringify({
            expectedPublishedRevisionId: selectedRevision.id,
          }),
        }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || errData.message || "Otevření konceptu selhalo.");
      }
      setActionMessage("Koncept byl úspěšně otevřen z publikované revize.");
      handleRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Chyba při otevírání konceptu";
      setActionMessage(`Chyba: ${msg}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleRollback = async () => {
    if (!selectedRevision || !projectId) return;
    setProcessing(true);
    setActionMessage(null);
    try {
      const res = await fetch(
        `/api/admin/projects/${projectId}/pages/${selectedRevision.pageId}/actions/rollback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CMS-Origin-Check": "1",
          },
          body: JSON.stringify({
            expectedPublishedRevisionId: selectedRevision.id,
          }),
        }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || errData.message || "Rollback selhal.");
      }
      setActionMessage("Rollback byl úspěšně proveden.");
      handleRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Chyba při rollbacku";
      setActionMessage(`Chyba: ${msg}`);
    } finally {
      setProcessing(false);
    }
  };

  if (!projectId) {
    return (
      <CapabilityShell
        group="OBSAH"
        title="Revize a audit"
        description="Auditní stopa, verzování stránek a deterministické porovnávání rozdílů (Diff)."
        status="ZÁKLAD"
        helpKey="content.revisions.view"
        emptyTitle="Vyberte aktivní projekt"
        emptyDescription="Pro zobrazení historie revizí a porovnávání verzí zvolte projekt."
        emptyActionLabel="Přejít do správy projektů"
      >
        {() => (
          <div className="p-8 rounded-2xl border border-dashed border-border bg-card shadow-xs text-center space-y-3">
            <FolderKanban className="w-8 h-8 text-muted-foreground mx-auto" />
            <h3 className="text-base font-bold text-foreground">Aktivní projekt není vybrán</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Zobrazování historie revizí vyžaduje aktivní projektový kontext.
            </p>
          </div>
        )}
      </CapabilityShell>
    );
  }

  return (
    <CapabilityShell
      group="OBSAH"
      title="Revize a audit"
      description="Auditní stopa, verzování stránek a deterministické porovnávání rozdílů (Diff)."
      status="ZÁKLAD"
      helpKey="content.revisions.view"
      emptyTitle="Zatím nebyly vytvořeny žádné revize"
      emptyDescription="Při úpravě a ukládání stránek se v systému automaticky vytvářejí revize."
      emptyActionLabel="Přejít do správy stránek"
    >
      {() => (
        <div className="space-y-6">
          {actionMessage && (
            <div className="p-3.5 rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-900 dark:text-sky-200 text-xs flex items-center justify-between">
              <span>{actionMessage}</span>
              <button
                type="button"
                onClick={() => setActionMessage(null)}
                className="text-xs font-semibold underline hover:opacity-80"
              >
                Zavřít
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-foreground">Přehled revizí obsahu</h3>
              <p className="text-xs text-muted-foreground">Historie změn stránek a deterministický diff</p>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Obnovit</span>
            </button>
          </div>

          {loading ? (
            <div className="p-8 rounded-2xl border border-border bg-card shadow-xs text-center space-y-3">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
              <p className="text-xs text-muted-foreground">Načítání historie revizí...</p>
            </div>
          ) : error ? (
            <div className="p-6 rounded-2xl border border-destructive/20 bg-destructive/5 text-destructive text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle className="w-4 h-4" />
                <span>Chyba načítání: {error}</span>
              </div>
            </div>
          ) : revisions.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-border bg-card/50 text-center space-y-3">
              <History className="w-8 h-8 text-muted-foreground mx-auto" />
              <h4 className="text-sm font-bold text-foreground">Žádné revize v projektu</h4>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                V databázi tohoto projektu dosud nebyly nalezeny žádné revize stránek.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Levé okno: Seznam revizí */}
              <div className="lg:col-span-5 space-y-2">
                <span className="text-xs font-semibold text-muted-foreground block px-1">
                  Seznam revizí ({revisions.length})
                </span>
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                  {revisions.map((rev) => {
                    const isSelected = rev.id === selectedRevisionId;
                    return (
                      <div
                        key={rev.id}
                        onClick={() => setSelectedRevisionId(rev.id)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-1.5 ${
                          isSelected
                            ? "border-primary bg-primary/5 shadow-xs"
                            : "border-border bg-card hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-xs text-foreground truncate">
                            {rev.title} (v{rev.revisionNumber})
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${
                            rev.status === "PUBLISHED"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              : rev.status === "DRAFT"
                              ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                              : "bg-blue-500/10 text-blue-600 border-blue-500/20"
                          }`}>
                            {rev.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Slug: /{rev.slug}</span>
                          <span>{new Date(rev.createdAt).toLocaleDateString("cs-CZ")}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pravé okno: Inspektor revize & Deterministický Diff */}
              <div className="lg:col-span-7">
                {selectedRevision && diffResult ? (
                  <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-primary" />
                          <h4 className="text-sm font-bold text-foreground">
                            {selectedRevision.title} (v{selectedRevision.revisionNumber})
                          </h4>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          ID: <span className="font-mono">{selectedRevision.id}</span> • Vytvořil: {selectedRevision.createdById || "Neznámý"}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedRevision.status === "PUBLISHED" && (
                          <>
                            <button
                              type="button"
                              disabled={processing}
                              onClick={handleReopenDraft}
                              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <GitBranch className="w-3.5 h-3.5" />
                              <span>Otevřít koncept</span>
                            </button>

                            <button
                              type="button"
                              disabled={processing}
                              onClick={handleRollback}
                              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Rollback</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Sekce deterministického diffu */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <GitBranch className="w-3.5 h-3.5 text-primary" />
                          <span>Deterministický rozdíl (Diff)</span>
                        </h5>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {previousRevision
                            ? `Porovnání s v${previousRevision.revisionNumber}`
                            : "První revize stránky"}
                        </span>
                      </div>

                      {/* Změny v hlavičce */}
                      {(diffResult.titleChanged || diffResult.slugChanged || diffResult.descriptionChanged || diffResult.visibilityChanged) && (
                        <div className="p-3 rounded-xl border border-border bg-muted/30 space-y-2 text-xs">
                          <span className="font-semibold text-foreground block">Změny v metadatech:</span>
                          {diffResult.titleChanged && previousRevision && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Edit3 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span>Titulok: &quot;{previousRevision.title}&quot; ➔ &quot;{selectedRevision.title}&quot;</span>
                            </div>
                          )}
                          {diffResult.slugChanged && previousRevision && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Edit3 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span>Slug: &quot;/{previousRevision.slug}&quot; ➔ &quot;/{selectedRevision.slug}&quot;</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Změny v blocích */}
                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-muted-foreground block">
                          Změny v blocích obsahu ({diffResult.blockDiffs.length}):
                        </span>

                        {diffResult.blockDiffs.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic p-3 border border-border rounded-xl">
                            Žádné bloky v obsahu revize.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {diffResult.blockDiffs.map((bd) => (
                              <div
                                key={bd.id}
                                className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                                  bd.status === "ADDED"
                                    ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-900 dark:text-emerald-200"
                                    : bd.status === "REMOVED"
                                    ? "border-rose-500/20 bg-rose-500/5 text-rose-900 dark:text-rose-200"
                                    : bd.status === "MODIFIED"
                                    ? "border-amber-500/20 bg-amber-500/5 text-amber-900 dark:text-amber-200"
                                    : "border-border bg-background text-muted-foreground"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  {bd.status === "ADDED" && <PlusCircle className="w-4 h-4 text-emerald-500 shrink-0" />}
                                  {bd.status === "REMOVED" && <MinusCircle className="w-4 h-4 text-rose-500 shrink-0" />}
                                  {bd.status === "MODIFIED" && <Edit3 className="w-4 h-4 text-amber-500 shrink-0" />}
                                  {bd.status === "UNCHANGED" && <CheckCircle2 className="w-4 h-4 text-muted-foreground/50 shrink-0" />}
                                  <span className="font-semibold">{bd.summary}</span>
                                </div>
                                <span className="font-mono text-[10px] opacity-70">{bd.id}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 rounded-2xl border border-dashed border-border bg-card/50 text-center space-y-2">
                    <p className="text-xs text-muted-foreground">Vyberte revizi ze seznamu vlevo pro její detail.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </CapabilityShell>
  );
}
