"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { puckConfig } from "@/lib/composer/puck.config";
import { puckDataToCanonical, canonicalToPuckData, PuckData } from "@/lib/composer/adapter";
import { PageDetail, PageContent } from "@/lib/domain/pages";
import { AdminPageLifecycleState } from "@/lib/domain/pages-client/types";
import { ProjectEntitlements } from "@/lib/composer/types";
import { createAdminPagesClient } from "@/lib/domain/pages-client/client";
import { normalizeAdminProjectId, withAdminProjectContext } from "@/lib/domain/pages-client/project-context";
import { resolveProjectEntitlements } from "@/lib/composer/entitlements";
import { AlertCircle, CheckCircle } from "lucide-react";

interface PageComposerWorkspaceProps {
  pageId: string;
  projectId?: string;
}

export const PageComposerWorkspace: React.FC<PageComposerWorkspaceProps> = ({ pageId, projectId: rawProjectId }) => {
  const router = useRouter();
  const projectId = normalizeAdminProjectId(rawProjectId || "default");
  const client = React.useMemo(() => createAdminPagesClient(projectId || "default"), [projectId]);
  
  const [initialData, setInitialData] = useState<PuckData | null>(null);
  const [page, setPage] = useState<PageDetail | null>(null);
  const [lifecycle, setLifecycle] = useState<AdminPageLifecycleState | null>(null);
  const [entitlements, setEntitlements] = useState<ProjectEntitlements | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lockConflict, setLockConflict] = useState(false);
  const [refetchCounter, setRefetchCounter] = useState(0);

  useEffect(() => {
    let active = true;
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

        const ent = resolveProjectEntitlements("COMMUNITY", { "labs.access": true });
        setEntitlements(ent);
      } catch (e) {
        if (!active) return;
        setErrorMessage(e instanceof Error ? e.message : "Chyba načítání");
      }
    };
    // Need to avoid set-state-in-effect warning if using some versions of lint.
    // However, it's inside an async function so it's not synchronous.
    fetchAll();
    return () => { active = false; };
  }, [pageId, client, refetchCounter]);

  const handleSave = async (data: PuckData) => {
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setLockConflict(false);

    try {
      const canonicalContent = puckDataToCanonical(data, "syn-content-v1", entitlements || undefined);
      
      const lockVersion = lifecycle?.lockVersion || 1;
      const mutationResult = await client.updateDraft(page!.id, lockVersion, {
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

  if (!initialData || !page) {
    return <div className="p-8 text-center text-muted-foreground">Načítám editor...</div>;
  }

  const isDraft = page.status === "Koncept";

  return (
    <div className="h-screen flex flex-col bg-background">
      {!isDraft && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-sm font-medium text-amber-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span>Stránka není ve stavu Koncept. Úpravy se neuloží.</span>
          </div>
          <button onClick={() => router.push(withAdminProjectContext(`/admin/pages/${pageId}`, projectId))} className="underline text-amber-800">
            Zpět
          </button>
        </div>
      )}
      {lockConflict && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-sm font-medium text-destructive flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>Konflikt verzí: Jiný uživatel uložil novější verzi.</span>
          </div>
          <button onClick={() => setRefetchCounter(c => c + 1)} className="px-3 py-1 bg-destructive text-destructive-foreground rounded text-xs font-semibold">
            Načíst aktuální data
          </button>
        </div>
      )}
      {successMessage && (
        <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-sm font-medium text-emerald-800 flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && !lockConflict && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-sm font-medium text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{errorMessage}</span>
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <Puck
          config={puckConfig}
          data={initialData}
          onPublish={handleSave}
          headerPath={page.title}
          overrides={{
            headerActions: ({ children }) => (
              <div className="flex items-center gap-2">
                {children}
                {isSaving && <span className="text-xs text-muted-foreground mr-2">Ukládám...</span>}
              </div>
            )
          }}
        />
      </div>
    </div>
  );
};
