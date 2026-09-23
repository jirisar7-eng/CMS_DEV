"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Puck, type Viewports } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { puckConfig } from "@/lib/composer/puck.config";
import { puckDataToCanonical, canonicalToPuckData, PuckData } from "@/lib/composer/adapter";
import { PageDetail } from "@/lib/domain/pages";
import { AdminPageLifecycleState } from "@/lib/domain/pages-client/types";
import { ProjectEntitlements } from "@/lib/composer/types";
import { createAdminPagesClient } from "@/lib/domain/pages-client/client";
import { normalizeAdminProjectId, withAdminProjectContext } from "@/lib/domain/pages-client/project-context";
import { AlertCircle, CheckCircle } from "lucide-react";

export const EDITOR_VIEWPORTS: Viewports = [
  { width: 360, height: "auto", icon: "Smartphone", label: "Mobil (360px)" },
  { width: 390, height: "auto", icon: "Smartphone", label: "Mobil (390px)" },
  { width: 768, height: "auto", icon: "Tablet", label: "Tablet (768px)" },
  { width: 1280, height: "auto", icon: "Monitor", label: "Desktop (1280px)" },
  { width: "100%", height: "auto", label: "Plná šířka" },
];

export interface PageComposerWorkspaceProps {
  pageId: string;
  projectId: string;
  initialEntitlements: ProjectEntitlements;
}

export const PageComposerWorkspace: React.FC<PageComposerWorkspaceProps> = ({ pageId, projectId: rawProjectId, initialEntitlements }) => {
  const router = useRouter();
  const projectId = normalizeAdminProjectId(rawProjectId);
  const client = React.useMemo(() => (projectId ? createAdminPagesClient(projectId) : null), [projectId]);
  
  const [initialData, setInitialData] = useState<PuckData | null>(null);
  const [page, setPage] = useState<PageDetail | null>(null);
  const [lifecycle, setLifecycle] = useState<AdminPageLifecycleState | null>(null);
  const entitlements = initialEntitlements;

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lockConflict, setLockConflict] = useState(false);
  const [refetchCounter, setRefetchCounter] = useState(0);

  useEffect(() => {
    let active = true;
    if (!projectId || !client) return;

    const fetchAll = async () => {
      try {
        const { page: pageData, lifecycle: lc } = await client.getPageById(pageId);
        if (!active) return;
        if (!pageData) throw new Error("Nelze načíst stránku");

        setPage(pageData);
        setLifecycle(lc);
        
        const content = pageData.content;
        if (content) {
          setInitialData(canonicalToPuckData(content));
        } else {
          setInitialData({ content: [], root: {} });
        }
      } catch (e) {
        if (!active) return;
        setErrorMessage(e instanceof Error ? e.message : "Chyba načítání");
      }
    };

    fetchAll();
    return () => { active = false; };
  }, [pageId, client, refetchCounter]);

  const handleSave = async (data: PuckData) => {
    if (!client || !page) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setLockConflict(false);

    try {
      const canonicalContent = puckDataToCanonical(data, "syn-content-v1", entitlements || initialEntitlements);
      
      const lockVersion = lifecycle?.lockVersion || 1;
      const mutationResult = await client.updateDraft(page.id, lockVersion, {
        content: canonicalContent,
      });

      setLifecycle((prev) =>
        prev
          ? {
              ...prev,
              hasDraft: true,
              lockVersion: mutationResult.lockVersion,
            }
          : null
      );
      
      setSuccessMessage("Koncept byl bezpečně uložen.");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (e: any) {
      if (e.message?.includes("Zámek") || e.message?.includes("lock") || e.message?.includes("konflikt")) {
        setLockConflict(true);
      } else {
        setErrorMessage(e.message || "Chyba ukládání");
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!projectId || !client) {
    return (
      <div data-testid="fail-closed-project-context" className="p-4 sm:p-8 text-center text-destructive flex flex-col items-center justify-center gap-2 w-full max-w-full min-w-0">
        <AlertCircle className="w-6 h-6 shrink-0" />
        <span className="font-semibold break-words">Chybí platný kontext projektu</span>
        <span className="text-sm text-muted-foreground break-words">Úpravy obsahu v editoru vyžadují vybraný a aktivní projekt.</span>
      </div>
    );
  }

  if (!initialData || !page) {
    return <div className="p-4 sm:p-8 text-center text-muted-foreground w-full max-w-full min-w-0">Načítám editor...</div>;
  }

  const isDraft = page.status === "Koncept";

  return (
    <div className="h-screen w-full max-w-full flex flex-col bg-background overflow-x-hidden min-w-0">
      {!isDraft && (
        <div
          data-testid="banner-not-draft"
          className="px-3 sm:px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs sm:text-sm font-medium text-amber-900 flex flex-col sm:flex-row sm:items-center sm:justify-between items-start gap-2 w-full max-w-full min-w-0"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1 break-words">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="min-w-0 flex-1 break-words">Stránka není ve stavu Koncept. Úpravy se neuloží.</span>
          </div>
          <button
            onClick={() => router.push(withAdminProjectContext(`/admin/pages/${pageId}`, projectId))}
            className="underline text-amber-800 text-xs sm:text-sm shrink-0 self-end sm:self-auto hover:text-amber-900 cursor-pointer"
          >
            Zpět
          </button>
        </div>
      )}

      {lockConflict && (
        <div
          data-testid="banner-lock-conflict"
          className="px-3 sm:px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-xs sm:text-sm font-medium text-destructive flex flex-col sm:flex-row sm:items-center sm:justify-between items-start gap-2 w-full max-w-full min-w-0"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1 break-words">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="min-w-0 flex-1 break-words">Konflikt verzí: Jiný uživatel uložil novější verzi.</span>
          </div>
          <button
            onClick={() => setRefetchCounter(c => c + 1)}
            data-testid="btn-reload-conflict"
            className="px-2.5 sm:px-3 py-1 bg-destructive text-destructive-foreground rounded text-xs font-semibold shrink-0 self-end sm:self-auto cursor-pointer"
          >
            Načíst aktuální data
          </button>
        </div>
      )}

      {successMessage && (
        <div
          data-testid="banner-success"
          className="px-3 sm:px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-xs sm:text-sm font-medium text-emerald-800 flex items-center gap-2 w-full max-w-full min-w-0"
        >
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
          <span className="min-w-0 flex-1 break-words">{successMessage}</span>
        </div>
      )}

      {errorMessage && !lockConflict && (
        <div
          data-testid="banner-error"
          className="px-3 sm:px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-xs sm:text-sm font-medium text-destructive flex items-center gap-2 w-full max-w-full min-w-0"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{errorMessage}</span>
        </div>
      )}

      <div className="flex-1 w-full max-w-full min-w-0 overflow-hidden relative">
        <Puck
          config={puckConfig}
          data={initialData}
          onPublish={handleSave}
          headerPath={page.title}
          viewports={EDITOR_VIEWPORTS}
          overrides={{
            headerActions: ({ children }) => (
              <div data-testid="puck-header-actions" className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0">
                {children}
                {isSaving && <span className="text-xs text-muted-foreground mr-1 sm:mr-2 shrink-0">Ukládám...</span>}
              </div>
            )
          }}
        />
      </div>
    </div>
  );
};
