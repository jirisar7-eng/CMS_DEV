import React, { useState, useMemo } from 'react';
import { ContentBlockType } from '@/lib/domain/pages';
import { COMPONENT_REGISTRY } from '@/lib/composer/registry';
import { ProjectEntitlements } from '@/lib/composer/types';
import { isEntitlementSatisfied } from '@/lib/composer/entitlements';
import { HelpTrigger } from '@/components/help/HelpTrigger';
import { Search, Plus, Layers, Lock, Sparkles } from 'lucide-react';

interface BlockPaletteProps {
  onAddBlock: (type: ContentBlockType) => void;
  canCreate: boolean;
  entitlements: ProjectEntitlements;
  onCloseMobile?: () => void;
}

export const BlockPalette: React.FC<BlockPaletteProps> = ({
  onAddBlock,
  canCreate,
  entitlements,
  onCloseMobile,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = [
    { id: 'all', label: 'Vše' },
    { id: 'text', label: 'Text' },
    { id: 'media', label: 'Média' },
    { id: 'structural', label: 'Rozvržení' },
    { id: 'interactive', label: 'Interaktivní' },
    { id: 'modules', label: 'Moduly' },
  ];

  const registryEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Object.values(COMPONENT_REGISTRY).filter((def) => {
      if (!def) return false;
      if (selectedCategory !== 'all' && def.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        def.label.toLowerCase().includes(q) ||
        def.czechLabel.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q) ||
        def.czechDescription.toLowerCase().includes(q) ||
        def.type.toLowerCase().includes(q)
      );
    });
  }, [search, selectedCategory]);

  return (
    <div className="flex flex-col h-full border-r border-border bg-card/60 backdrop-blur-xs select-none">
      {/* Palette Header */}
      <div className="p-3 sm:p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Katalog komponent</h3>
              <p className="text-[11px] text-muted-foreground">Kanonický Puck registr</p>
            </div>
          </div>
          <HelpTrigger helpKey="content.block.create" size="sm" align="right" label="Nápověda ke katalogu bloků" />
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Hledat blok nebo modul..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background placeholder:text-muted-foreground/60 text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 transition-all"
          />
        </div>

        {/* Category filter pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-full whitespace-nowrap transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Palette Items List */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2">
        {registryEntries.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Žádné bloky neodpovídají hledání.
          </div>
        ) : (
          registryEntries.map((def) => {
            const Icon = def.icon;
            const entitlementCheck = isEntitlementSatisfied(def.requiredEntitlement, entitlements);
            const isLocked = !entitlementCheck.allowed;

            return (
              <button
                key={def.type}
                type="button"
                id={`btn-add-block-${def.type}`}
                disabled={!canCreate || isLocked}
                onClick={() => {
                  if (canCreate && !isLocked) {
                    onAddBlock(def.type);
                    if (onCloseMobile) onCloseMobile();
                  }
                }}
                className={`w-full group text-left p-2.5 rounded-xl border transition-all flex items-start gap-3 relative ${
                  isLocked
                    ? 'border-border/40 bg-muted/20 opacity-60 cursor-not-allowed'
                    : 'border-border/60 bg-background hover:bg-muted/50 hover:border-primary/40 hover:shadow-2xs active:scale-[0.99] cursor-pointer'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    isLocked
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-muted/80 text-foreground group-hover:bg-primary/10 group-hover:text-primary'
                  }`}
                >
                  {isLocked ? <Lock className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>

                <div className="flex-1 min-w-0 pr-6">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground truncate">
                      {def.czechLabel || def.label}
                    </span>
                    {def.requiredEntitlement === 'commercial' && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                        PRO
                      </span>
                    )}
                    {def.requiredEntitlement === 'labs' && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 font-medium flex items-center gap-0.5">
                        <Sparkles className="w-2.5 h-2.5" /> LABS
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                    {def.czechDescription || def.description}
                  </p>
                </div>

                {!isLocked && canCreate && (
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-primary/10 text-primary">
                    <Plus className="w-3.5 h-3.5" />
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Palette Footer */}
      <div className="p-3 border-t border-border bg-muted/20 text-[11px] text-muted-foreground flex items-center justify-between">
        <span>Edice: <strong>{entitlements.edition}</strong></span>
        <span>SYN-DESIGN-010</span>
      </div>
    </div>
  );
};
