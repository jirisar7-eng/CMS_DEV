"use client";

import React, { useState } from 'react';
import { X, FolderPlus, Check, AlertCircle } from 'lucide-react';
import {
  NavigationContext,
  CreateNavigationSetInput,
  NavigationSet,
} from '@/lib/domain/navigation/types';
import { sanitizeLabel } from '@/lib/domain/navigation/validation';

interface NavigationSetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateNavigationSetInput) => Promise<void>;
  existingSet?: NavigationSet | null;
}

export const NavigationSetModal: React.FC<NavigationSetModalProps> = ({
  isOpen,
  onClose,
  onSave,
  existingSet,
}) => {
  const isEditing = !!existingSet;

  const [name, setName] = useState<string>(existingSet?.name || '');
  const [key, setKey] = useState<string>(existingSet?.key || '');
  const [context, setContext] = useState<NavigationContext>(existingSet?.context || 'CUSTOM');
  const [description, setDescription] = useState<string>(existingSet?.description || '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = sanitizeLabel(name);
    if (!cleanName) {
      setError('Zadejte prosím název navigační sady.');
      return;
    }

    const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (!cleanKey) {
      setError('Zadejte platný technický klíč (pouze malá písmena, číslice a pomlčky).');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSave({
        key: cleanKey,
        name: cleanName,
        context,
        description: description.trim(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Při ukládání sady došlo k chybě.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nav-set-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 id="nav-set-modal-title" className="font-bold text-foreground text-sm sm:text-base">
                {isEditing ? 'Upravit navigační sadu' : 'Vytvořit novou navigační sadu'}
              </h3>
              <p className="text-xs text-muted-foreground">
                Konfigurace kontextu a identifikátoru navigační nabídky.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            aria-label="Zavřít"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs sm:text-sm">
          <div>
            <label htmlFor="nav-set-name" className="block font-semibold text-foreground mb-1 text-xs">
              Název sady <span className="text-destructive">*</span>
            </label>
            <input
              id="nav-set-name"
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!isEditing && !key) {
                  setKey(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
                }
              }}
              placeholder="např. Sekundární patička, Portálové menu..."
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="nav-set-key" className="block font-semibold text-foreground mb-1 text-xs">
              Technický klíč sady <span className="text-destructive">*</span>
            </label>
            <input
              id="nav-set-key"
              type="text"
              required
              disabled={isEditing}
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))}
              placeholder="např. secondary-footer, member-portal"
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs font-mono disabled:opacity-60 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="nav-set-context" className="block font-semibold text-foreground mb-1 text-xs">
              Kontext použití (Target Zone)
            </label>
            <select
              id="nav-set-context"
              value={context}
              onChange={(e) => setContext(e.target.value as NavigationContext)}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary outline-hidden"
            >
              <option value="HEADER">Záhlaví (HEADER) – Hlavní webová lišta</option>
              <option value="FOOTER">Patička (FOOTER) – Sloupcové bloky odkazů</option>
              <option value="MOBILE">Mobilní nabídka (MOBILE) – Výsuvný panel</option>
              <option value="PORTAL">Portál (PORTAL) – Klientská a partnerská zóna</option>
              <option value="CUSTOM">Vlastní kontext (CUSTOM) – Speciální šablony</option>
            </select>
          </div>

          <div>
            <label htmlFor="nav-set-desc" className="block font-semibold text-foreground mb-1 text-xs">
              Popis / Účel
            </label>
            <textarea
              id="nav-set-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Volitelný popis určení této navigační sady..."
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary outline-hidden resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-border bg-card text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isEditing ? 'Uložit sadu' : 'Vytvořit sadu'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
