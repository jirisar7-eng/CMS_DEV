"use client";

import React, { useState, useEffect } from "react";
import { CapabilityShell } from "@/components/admin/CapabilityShell";
import {
  History,
  RotateCcw,
  FileText,
  User,
  Clock,
  Loader2,
  RefreshCw,
  FolderKanban,
  CheckCircle,
  AlertCircle,
  FileEdit
} from "lucide-react";

interface PageRevision {
  id: string;
  pageId: string;
  revisionNumber: number;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED";
  title: string;
  slug: string;
  locale: string;
  description: string | null;
  visibility: string;
  content: {
    blocks?: Array<{ id: string; type: string; data?: Record<string, unknown> }>;
  };
  createdById: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  pageTitle?: string;
  pageSlug?: string;
  lockVersion: number;
}

export function RevisionsWorkspace({ projectId }: { projectId: string | null }) {
  const [revisions, setRevisions] = useState<PageRevision[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);

  const fetchRevisions = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/revisions`);
      if (!res.ok) {
        if (res.status === 403) throw new Error("Nemáte oprávnění k zobrazení revizí (content.view).");
        if (res.status === 401) throw new Error("Relace vypršela. Přihlaste se prosím znovu.");
        throw new Error("Nepodařilo se načíst revize.");
      }
      const data = await res.json();
      const list = data.revisions || [];
      setRevisions(list);
      if (list.length > 0 && !selectedRevisionId) {
        setSelectedRevisionId(list[0].id);
      }
    } catch (err: any) {
      setError(err.message || "Chyba při načítání revizí.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRevisions();
  }, [projectId]);

  const selectedRevision = revisions.find((r) => r.id === selectedRevisionId) || revisions[0] || null;

  const handleReopenDraft = async () => {
    if (!projectId || !selectedRevision) return;
    setProcessing(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/pages/${selectedRevision.pageId}/actions/reopen-draft`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CMS-Origin-Check": "1",
        },
        body: JSON.stringify({ expectedPublishedRevisionId: selectedRevision.id }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Otevření nového konceptu selhalo.");
      }
      setActionMessage("Nový koncept z publikované revize byl úspěšně otevřen přes Content Lifecycle.");
      await fetchRevisions();
    } catch (err: any) {
      setActionMessage(`Chyba při otvírání konceptu: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleRollback = async () => {
    if (!projectId || !selectedRevision) return;
    setProcessing(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/pages/${selectedRevision.pageId}/actions/rollback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CMS-Origin-Check": "1",
        },
        body: JSON.stringify({ expectedPublishedRevisionId: selectedRevision.id }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Rollback selhal.");
      }
      setActionMessage("Rollback stránky na vybranou revizi byl úspěšně proveden přes Content Lifecycle.");
      await fetchRevisions();
    } catch (err: any) {
      setActionMessage(`Chyba při rollbacku: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  if (!projectId) {
    return (
      <CapabilityShell
        group="OBSAH"
        title="Revize a historie změn"
        description="Porovnání verzí obsahu (diff) a sledování kompletní redakční historie úprav stránek."
        status="FUNKČNÍ"
        helpKey="content.revisions.view"
        emptyTitle="Vyberte aktivní projekt"
        emptyDescription="Pro zobrazení historie revizí stránek prosím zvolte projekt v přepínači projektů."
        emptyActionLabel="Přejít do správy projektů"
      >
        {() => (
          <div className="p-8 rounded-2xl border border-dashed border-border bg-card shadow-xs text-center space-y-3">
            <FolderKanban className="w-8 h-8 text-muted-foreground mx-auto" />
            <h3 className="text-base font-bold text-foreground">Aktivní projekt není vybrán</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Revize a historie změn vyžadují aktivní projektový kontext.
            </p>
          </div>
        )}
      </CapabilityShell>
    );
  }

  return (
    <CapabilityShell
      group="OBSAH"
      title="Revize a historie změn"
      description="Porovnání verzí obsahu (diff) a sledování kompletní redakční historie úprav stránek."
      status="FUNKČNÍ"
      helpKey="content.revisions.view"
      emptyTitle="Zatím nebyly zaznamenány žádné revize"
      emptyDescription="Při každém uložení konceptu nebo publikaci se zde automaticky vytvoří nová revize."
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
              <h3 className="text-sm font-bold text-foreground">Reálný registr revizí</h3>
              <p className="text-xs text-muted-foreground">Persistentní revize stránek v projektech</p>
            </div>
            <button
              type="button"
              onClick={fetchRevisions}
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
              <p className="text-xs text-muted-foreground">Načítání revizí stránek...</p>
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
              <h4 className="text-sm font-bold text-foreground">Žádné revize nenalezeny</h4>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Pro tento projekt zatím nebyly uloženy žádné revize stránek.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Revisions List */}
              <div className="lg:col-span-1 rounded-2xl border border-border bg-card shadow-xs divide-y divide-border overflow-hidden h-fit">
                <div className="p-3 bg-muted/40 text-xs font-bold text-muted-foreground flex justify-between items-center">
                  <span>Revize stránek</span>
                  <span>{revisions.length} záznamů</span>
                </div>
                {revisions.map((rev) => (
                  <div
                    key={rev.id}
                    onClick={() => setSelectedRevisionId(rev.id)}
                    className={`p-3.5 space-y-1 cursor-pointer transition-colors ${
                      selectedRevision?.id === rev.id
                        ? "bg-primary/10 border-l-4 border-l-primary"
                        : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-foreground truncate max-w-[180px]">
                        {rev.title || rev.pageTitle || "Stránka"}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        rev.status === "PUBLISHED"
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          : rev.status === "APPROVED"
                          ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                          : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                      }`}>
                        v{rev.revisionNumber} • {rev.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      /{rev.slug || rev.pageSlug || ""}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                      <span>{rev.createdById || "Autor"}</span>
                      <span>{new Date(rev.createdAt).toLocaleDateString("cs-CZ")}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Inspector */}
              {selectedRevision && (
                <div className="lg:col-span-2 p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm sm:text-base font-bold text-foreground">
                          {selectedRevision.title}
                        </h3>
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-muted text-foreground border border-border">
                          Verze #{selectedRevision.revisionNumber}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Cesta: /{selectedRevision.slug} • Vytvořeno: {new Date(selectedRevision.createdAt).toLocaleString("cs-CZ")}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {selectedRevision.status === "PUBLISHED" && (
                        <>
                          <button
                            type="button"
                            disabled={processing}
                            onClick={handleReopenDraft}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileEdit className="w-3.5 h-3.5" />}
                            <span>Otevřít nový koncept</span>
                          </button>
                          <button
                            type="button"
                            disabled={processing}
                            onClick={handleRollback}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                            <span>Rollback</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/30 border border-border">
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Lokalizace</span>
                        <span className="font-semibold text-foreground">{selectedRevision.locale}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Viditelnost</span>
                        <span className="font-semibold text-foreground">{selectedRevision.visibility}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground block text-[11px]">Popis</span>
                        <span className="font-semibold text-foreground">{selectedRevision.description || "(bez popisu)"}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="font-bold text-foreground block">
                        Bloky obsahu ({selectedRevision.content?.blocks?.length || 0}):
                      </span>
                      {selectedRevision.content?.blocks && selectedRevision.content.blocks.length > 0 ? (
                        <div className="space-y-2">
                          {selectedRevision.content.blocks.map((block, idx) => (
                            <div key={block.id || idx} className="p-3 rounded-xl border border-border bg-background space-y-1">
                              <div className="flex items-center justify-between font-bold text-foreground">
                                <span>Typ bloku: {block.type}</span>
                                <span className="text-[11px] text-muted-foreground">Pozice #{idx + 1}</span>
                              </div>
                              <pre className="text-[11px] font-mono text-muted-foreground overflow-x-auto p-2 bg-muted/30 rounded-lg">
                                {JSON.stringify(block.data || {}, null, 2)}
                              </pre>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground italic">Revize neobsahuje žádné bloky obsahu.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </CapabilityShell>
  );
}
