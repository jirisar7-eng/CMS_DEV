import React from 'react';
import { ContentBlock } from '@/lib/domain/pages';
import { getBlockDefinition } from '@/lib/composer/registry';
import { ContentCapabilities } from '@/lib/composer/types';
import { HelpTrigger } from '@/components/help/HelpTrigger';
import {
  ChevronUp,
  ChevronDown,
  Copy,
  Trash2,
  Sliders,
  X,
  AlertCircle,
} from 'lucide-react';

interface BlockInspectorProps {
  block: ContentBlock | null;
  onUpdateBlockData: (id: string, data: Record<string, unknown>) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onDeselect: () => void;
  capabilities: ContentCapabilities;
  isFirst: boolean;
  isLast: boolean;
}

export const BlockInspector: React.FC<BlockInspectorProps> = ({
  block,
  onUpdateBlockData,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  onDeselect,
  capabilities,
  isFirst,
  isLast,
}) => {
  if (!block) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 text-center border-l border-border bg-card/40 select-none">
        <div className="w-12 h-12 rounded-xl bg-muted text-muted-foreground flex items-center justify-center mb-3">
          <Sliders className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-bold text-foreground">Žádný vybraný blok</h4>
        <p className="text-xs text-muted-foreground mt-1 max-w-[200px] leading-relaxed">
          Klepnutím na blok na plátně otevřete jeho vlastnosti a nastavení.
        </p>
      </div>
    );
  }

  const def = getBlockDefinition(block.type);
  const Icon = def.icon;
  const data = (block.data || {}) as Record<string, unknown>;

  const updateField = (key: string, value: unknown) => {
    const next = { ...data, [key]: value };
    const { sanitized } = def.validateData(next);
    onUpdateBlockData(block.id, sanitized);
  };

  return (
    <div className="flex flex-col h-full border-l border-border bg-card/60 backdrop-blur-xs select-none">
      {/* Inspector Header */}
      <div className="p-3 sm:p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-foreground truncate">{def.label}</h3>
              <p className="text-[11px] font-mono text-muted-foreground truncate">
                ID: {block.id}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <HelpTrigger helpKey="content.block.edit" size="sm" align="right" label="Nápověda k editaci bloku" />
            <button
              type="button"
              onClick={onDeselect}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Zavřít panel vlastností"
              aria-label="Zavřít panel vlastností"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Structural Move & Action Controls */}
        <div className="grid grid-cols-4 gap-1 pt-1">
          {/* Mandatory Accessible Move Up Button */}
          <button
            type="button"
            id="btn-inspector-move-up"
            disabled={isFirst || !capabilities['content.block.move']}
            onClick={() => onMoveUp(block.id)}
            title="Posunout blok nahoru"
            aria-label="Posunout blok nahoru"
            className="p-2 min-h-[44px] flex flex-col items-center justify-center rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronUp className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Nahoru</span>
          </button>

          {/* Mandatory Accessible Move Down Button */}
          <button
            type="button"
            id="btn-inspector-move-down"
            disabled={isLast || !capabilities['content.block.move']}
            onClick={() => onMoveDown(block.id)}
            title="Posunout blok dolů"
            aria-label="Posunout blok dolů"
            className="p-2 min-h-[44px] flex flex-col items-center justify-center rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronDown className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Dolů</span>
          </button>

          {/* Duplicate Button */}
          <button
            type="button"
            id="btn-inspector-duplicate"
            disabled={!capabilities['content.block.duplicate']}
            onClick={() => onDuplicate(block.id)}
            title="Duplikovat blok"
            aria-label="Duplikovat blok"
            className="p-2 min-h-[44px] flex flex-col items-center justify-center rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <Copy className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Klon</span>
          </button>

          {/* Delete Button */}
          <button
            type="button"
            id="btn-inspector-delete"
            disabled={!capabilities['content.block.delete']}
            onClick={() => onDelete(block.id)}
            title="Smazat blok"
            aria-label="Smazat blok"
            className="p-2 min-h-[44px] flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 text-destructive disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Smazat</span>
          </button>
        </div>
      </div>

      {/* Property Forms based on Block Type */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
        {/* HEADING FORM */}
        {block.type === 'heading' && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="field-heading-text" className="text-xs font-semibold text-foreground">
                Text nadpisu
              </label>
              <input
                id="field-heading-text"
                type="text"
                value={(data.text as string) || ''}
                onChange={(e) => updateField('text', e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[40px]"
                placeholder="Zadejte text..."
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="field-heading-level" className="text-xs font-semibold text-foreground">
                Úroveň nadpisu
              </label>
              <div className="grid grid-cols-6 gap-1">
                {[1, 2, 3, 4, 5, 6].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => updateField('level', lvl)}
                    className={`py-1.5 rounded-lg text-xs font-bold border transition-colors min-h-[38px] ${
                      Number(data.level) === lvl
                        ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                        : 'bg-background hover:bg-muted text-foreground border-border'
                    }`}
                  >
                    H{lvl}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Zarovnání</label>
              <div className="grid grid-cols-3 gap-1">
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => updateField('align', a)}
                    className={`py-1.5 rounded-lg text-xs font-medium border capitalize transition-colors min-h-[38px] ${
                      (data.align || 'left') === a
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted text-foreground border-border'
                    }`}
                  >
                    {a === 'left' ? 'Vlevo' : a === 'center' ? 'Na střed' : 'Vpravo'}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* PARAGRAPH FORM */}
        {block.type === 'paragraph' && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="field-paragraph-text" className="text-xs font-semibold text-foreground">
                Text odstavce
              </label>
              <textarea
                id="field-paragraph-text"
                rows={5}
                value={(data.text as string) || ''}
                onChange={(e) => updateField('text', e.target.value)}
                className="w-full p-3 text-xs sm:text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                placeholder="Zadejte text odstavce..."
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Velikost písma</label>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { key: 'sm', label: 'Menší' },
                  { key: 'base', label: 'Základní' },
                  { key: 'lg', label: 'Větší' },
                ].map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => updateField('size', s.key)}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition-colors min-h-[38px] ${
                      (data.size || 'base') === s.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted text-foreground border-border'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Zarovnání</label>
              <div className="grid grid-cols-3 gap-1">
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => updateField('align', a)}
                    className={`py-1.5 rounded-lg text-xs font-medium border capitalize transition-colors min-h-[38px] ${
                      (data.align || 'left') === a
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted text-foreground border-border'
                    }`}
                  >
                    {a === 'left' ? 'Vlevo' : a === 'center' ? 'Na střed' : 'Vpravo'}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* CALLOUT FORM */}
        {block.type === 'callout' && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="field-callout-title" className="text-xs font-semibold text-foreground">
                Titulek upozornění (volitelný)
              </label>
              <input
                id="field-callout-title"
                type="text"
                value={(data.title as string) || ''}
                onChange={(e) => updateField('title', e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[40px]"
                placeholder="Např. Důležité sdělení..."
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="field-callout-text" className="text-xs font-semibold text-foreground">
                Obsah upozornění
              </label>
              <textarea
                id="field-callout-text"
                rows={3}
                value={(data.text as string) || ''}
                onChange={(e) => updateField('text', e.target.value)}
                className="w-full p-3 text-xs sm:text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                placeholder="Zadejte text upozornění..."
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Druh sdělení</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { key: 'info', label: 'Informace', color: 'border-sky-500/40 text-sky-700 dark:text-sky-300' },
                  { key: 'warning', label: 'Varování', color: 'border-amber-500/40 text-amber-700 dark:text-amber-300' },
                  { key: 'success', label: 'Úspěch', color: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300' },
                  { key: 'critical', label: 'Kritické', color: 'border-rose-500/40 text-rose-700 dark:text-rose-300' },
                ].map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => updateField('tone', t.key)}
                    className={`p-2 rounded-lg text-xs font-medium border text-left flex items-center justify-between min-h-[40px] transition-colors ${
                      (data.tone || 'info') === t.key
                        ? 'bg-muted/90 font-bold border-foreground shadow-2xs'
                        : 'bg-background hover:bg-muted text-muted-foreground border-border'
                    }`}
                  >
                    <span>{t.label}</span>
                    <span className={`w-2 h-2 rounded-full ${t.color.replace('text-', 'bg-').split(' ')[0]}`} />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* QUOTE FORM */}
        {block.type === 'quote' && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="field-quote-text" className="text-xs font-semibold text-foreground">
                Citace
              </label>
              <textarea
                id="field-quote-text"
                rows={3}
                value={(data.quote as string) || ''}
                onChange={(e) => updateField('quote', e.target.value)}
                className="w-full p-3 text-xs sm:text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                placeholder="Zadejte text citace..."
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="field-quote-author" className="text-xs font-semibold text-foreground">
                Autor
              </label>
              <input
                id="field-quote-author"
                type="text"
                value={(data.author as string) || ''}
                onChange={(e) => updateField('author', e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[40px]"
                placeholder="Jméno autora..."
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="field-quote-citation" className="text-xs font-semibold text-foreground">
                Zdroj / Instituce
              </label>
              <input
                id="field-quote-citation"
                type="text"
                value={(data.citation as string) || ''}
                onChange={(e) => updateField('citation', e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[40px]"
                placeholder="Název knihy, rozsudku nebo publikace..."
              />
            </div>
          </>
        )}

        {/* BUTTON FORM */}
        {block.type === 'button' && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="field-button-label" className="text-xs font-semibold text-foreground">
                Text tlačítka
              </label>
              <input
                id="field-button-label"
                type="text"
                value={(data.label as string) || ''}
                onChange={(e) => updateField('label', e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[40px]"
                placeholder="Např. Zjistit více..."
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="field-button-url" className="text-xs font-semibold text-foreground">
                Cílová URL adresa
              </label>
              <input
                id="field-button-url"
                type="text"
                value={(data.url as string) || ''}
                onChange={(e) => updateField('url', e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm font-mono rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[40px]"
                placeholder="https://... nebo /kontakt"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Vzhled (Varianta)</label>
              <div className="grid grid-cols-2 gap-1">
                {[
                  { key: 'primary', label: 'Primární' },
                  { key: 'secondary', label: 'Sekundární' },
                  { key: 'outline', label: 'Obrys' },
                  { key: 'ghost', label: 'Nenápadné' },
                ].map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => updateField('variant', v.key)}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition-colors min-h-[38px] ${
                      (data.variant || 'primary') === v.key
                        ? 'bg-primary text-primary-foreground border-primary font-bold'
                        : 'bg-background hover:bg-muted text-foreground border-border'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Otevřít v okně</label>
              <div className="grid grid-cols-2 gap-1">
                {[
                  { key: '_self', label: 'Ve stejném okně' },
                  { key: '_blank', label: 'V novém okně' },
                ].map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => updateField('target', t.key)}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition-colors min-h-[38px] ${
                      (data.target || '_self') === t.key
                        ? 'bg-primary text-primary-foreground border-primary font-bold'
                        : 'bg-background hover:bg-muted text-foreground border-border'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* DIVIDER FORM */}
        {block.type === 'divider' && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Styl linky</label>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { key: 'solid', label: 'Plná' },
                  { key: 'dashed', label: 'Čárkovaná' },
                  { key: 'dotted', label: 'Tečkovaná' },
                ].map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => updateField('style', s.key)}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition-colors min-h-[38px] ${
                      (data.style || 'solid') === s.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted text-foreground border-border'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Vnější odsazení</label>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { key: 'sm', label: 'Malé' },
                  { key: 'md', label: 'Střední' },
                  { key: 'lg', label: 'Velké' },
                ].map((sp) => (
                  <button
                    key={sp.key}
                    type="button"
                    onClick={() => updateField('spacing', sp.key)}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition-colors min-h-[38px] ${
                      (data.spacing || 'md') === sp.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted text-foreground border-border'
                    }`}
                  >
                    {sp.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* MODULE EMBED / FALLBACK */}
        {block.type === 'module_embed' && (
          <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-2">
            <div className="text-xs font-semibold">Nastavení modulu</div>
            <div className="text-xs text-muted-foreground">
              Parametry modulu <span className="font-mono">{(data.moduleKey as string) || ''}</span> jsou spravovány v centrálním registru modulů Synthesis.
            </div>
          </div>
        )}

        {/* FALLBACK FOR UNKNOWN BLOCKS */}
        {!['heading', 'paragraph', 'callout', 'quote', 'button', 'divider', 'module_embed'].includes(block.type) && (
          <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-200 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span>Neregistrovaný blok</span>
            </div>
            <p className="text-muted-foreground">
              Data tohoto bloku nelze přímo editovat, aby byla zaručena bezpečnost a integrita schématu.
            </p>
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="p-3 border-t border-border bg-muted/20 text-[11px] text-muted-foreground flex items-center justify-between">
        <span>Schéma: <span className="font-mono">{def.schemaVersion}</span></span>
        <span>Pořadí: #{block.order}</span>
      </div>
    </div>
  );
};
