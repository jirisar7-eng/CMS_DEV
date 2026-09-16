'use client';

import { useState } from 'react';
import { createBrandDraft, updateBrandDraft, publishBrandDraft, discardBrandDraft, rollbackBrand } from '@/app/admin/brands/actions';
import { validateThemeAccessibility } from '@/lib/domain/brand/accessibility';
import { BrandEditor } from './BrandEditor';
import { BrandPreview } from './BrandPreview';
import { BrandHistory } from './BrandHistory';
import { LucidePen, LucideSave, LucideUndo, LucideAlertCircle, LucideCheckCircle2, LucideHistory } from 'lucide-react';

export function BrandStudioClient({ initialBrand }: { initialBrand: any }) {
  const activeVersion = initialBrand.activeVersion;
  const draftVersion = initialBrand.versions.find((v: any) => v.status === 'DRAFT');
  
  const [currentDraft, setCurrentDraft] = useState<any>(draftVersion);
  const [view, setView] = useState<'editor' | 'preview' | 'history'>('editor');
  
  const handleCreateDraft = async () => {
    const draft = await createBrandDraft(initialBrand.id, initialBrand.projectId);
    setCurrentDraft(draft);
  };
  
  const handleDiscardDraft = async () => {
    if (!currentDraft) return;
    await discardBrandDraft(currentDraft.id, initialBrand.projectId);
    setCurrentDraft(null);
  };
  
  const handlePublish = async () => {
    if (!currentDraft) return;
    try {
      await publishBrandDraft(currentDraft.id, initialBrand.projectId);
      alert("Brand published successfully!");
      window.location.reload();
    } catch (e: any) {
      if (e.message.includes('ACCESSIBILITY_FAILED')) {
        alert("Cannot publish: Accessibility contrast checks failed.");
      } else {
        alert("Error publishing brand: " + e.message);
      }
    }
  };

  const handleRollback = async (versionId: string) => {
    if (confirm("Are you sure you want to rollback to this version? This will create a new published version.")) {
      await rollbackBrand(initialBrand.id, versionId, initialBrand.projectId);
      window.location.reload();
    }
  };

  const handleSaveDraft = async (data: any) => {
    if (!currentDraft) return;
    const updated = await updateBrandDraft(currentDraft.id, data, initialBrand.projectId);
    setCurrentDraft(updated);
  };

  // Contrast validation checking
  const accessErrors = currentDraft ? validateThemeAccessibility(currentDraft.tokens, 'light') : [];

  return (
    <div className="flex h-full">
      {/* Sidebar Controls */}
      <div className="w-80 border-r flex flex-col bg-card/50 shrink-0">
        <div className="p-4 border-b">
          <h2 className="font-semibold">{initialBrand.name}</h2>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              {initialBrand.scope}
            </span>
            {currentDraft ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium flex items-center gap-1">
                <LucidePen className="w-3 h-3" /> Draft
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-medium flex items-center gap-1">
                <LucideCheckCircle2 className="w-3 h-3" /> Published
              </span>
            )}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="flex flex-col gap-2">
            <button 
              onClick={() => setView('editor')}
              className={`p-2 text-left rounded-md text-sm font-medium transition-colors ${view === 'editor' ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
            >
              Design Editor
            </button>
            <button 
              onClick={() => setView('preview')}
              className={`p-2 text-left rounded-md text-sm font-medium transition-colors ${view === 'preview' ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
            >
              Live Preview
            </button>
            <button 
              onClick={() => setView('history')}
              className={`p-2 text-left rounded-md text-sm font-medium transition-colors ${view === 'history' ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
            >
              Version History
            </button>
          </div>
          
          <div className="border-t pt-4">
            {!currentDraft ? (
              <button 
                onClick={handleCreateDraft}
                className="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Create Draft
              </button>
            ) : (
              <div className="space-y-3">
                {accessErrors.length > 0 && (
                  <div className="p-3 bg-destructive/10 text-destructive rounded-md text-xs border border-destructive/20">
                    <div className="flex items-center gap-1 font-semibold mb-1">
                      <LucideAlertCircle className="w-4 h-4" />
                      Accessibility Warnings
                    </div>
                    <ul className="list-disc pl-4 space-y-1">
                      {accessErrors.map((e, i) => (
                        <li key={i}>{e.pair}: {e.ratio} (min {e.expected})</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex gap-2">
                  <button 
                    onClick={handlePublish}
                    disabled={accessErrors.length > 0}
                    className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    Publish
                  </button>
                  <button 
                    onClick={handleDiscardDraft}
                    className="flex-1 py-2 bg-muted text-foreground rounded-md text-sm font-medium hover:bg-muted/80 transition-colors"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Main Workspace */}
      <div className="flex-1 bg-muted/20 relative overflow-hidden flex flex-col">
        {view === 'editor' && (
          <BrandEditor 
            brandData={currentDraft || activeVersion} 
            onChange={currentDraft ? handleSaveDraft : undefined} 
            readonly={!currentDraft}
          />
        )}
        {view === 'preview' && (
          <BrandPreview brandData={currentDraft || activeVersion} />
        )}
        {view === 'history' && (
          <BrandHistory versions={initialBrand.versions} onRollback={handleRollback} />
        )}
      </div>
    </div>
  );
}
