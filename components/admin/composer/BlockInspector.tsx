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
  Sparkles,
  ShieldCheck,
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
          Klepnutím na blok na plátně otevřete jeho vlastnosti, nastavení a schéma.
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
      {/* Header */}
      <div className="p-3.5 sm:p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-foreground truncate">{def.czechLabel || def.label}</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground font-mono">
                {def.schemaVersion}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">{def.czechDescription || def.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <HelpTrigger helpKey="content.block.edit" size="sm" align="right" label="Nápověda k vlastnostem bloku" />
          <button
            type="button"
            onClick={onDeselect}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Zavřít panel"
            aria-label="Zavřít panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="px-4 py-2 border-b border-border/60 bg-muted/20 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          {capabilities['content.block.move'] && (
            <>
              <button
                type="button"
                onClick={() => onMoveUp(block.id)}
                disabled={isFirst}
                className="p-1.5 rounded-md border border-border bg-background hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground"
                title="Posunout nahoru"
                aria-label="Posunout nahoru"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onMoveDown(block.id)}
                disabled={isLast}
                className="p-1.5 rounded-md border border-border bg-background hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground"
                title="Posunout dolů"
                aria-label="Posunout dolů"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          {capabilities['content.block.duplicate'] && (
            <button
              type="button"
              onClick={() => onDuplicate(block.id)}
              className="p-1.5 rounded-md border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Duplikovat blok"
              aria-label="Duplikovat blok"
            >
              <Copy className="w-4 h-4" />
            </button>
          )}
          {capabilities['content.block.delete'] && (
            <button
              type="button"
              onClick={() => onDelete(block.id)}
              className="p-1.5 rounded-md border border-destructive/30 bg-destructive/5 hover:bg-destructive/15 text-destructive"
              title="Smazat blok"
              aria-label="Smazat blok"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Dynamic Fields Inspector */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {Object.entries(def.fields).map(([fieldName, config]) => {
          const rawVal = data[fieldName];

          if (config.type === 'text') {
            return (
              <div key={fieldName} className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>{config.label}</span>
                </label>
                <input
                  type="text"
                  value={typeof rawVal === 'string' ? rawVal : ''}
                  placeholder={config.placeholder}
                  onChange={(e) => updateField(fieldName, e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                />
              </div>
            );
          }

          if (config.type === 'textarea') {
            return (
              <div key={fieldName} className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">{config.label}</label>
                <textarea
                  rows={4}
                  value={typeof rawVal === 'string' ? rawVal : ''}
                  placeholder={config.placeholder}
                  onChange={(e) => updateField(fieldName, e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 resize-y"
                />
              </div>
            );
          }

          if (config.type === 'rich_text') {
            return (
              <div key={fieldName} className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>{config.label}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">WYSIWYG</span>
                </label>
                <textarea
                  rows={5}
                  value={typeof rawVal === 'string' ? rawVal : ''}
                  onChange={(e) => updateField(fieldName, e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground font-mono focus:outline-hidden focus:ring-2 focus:ring-primary/40 resize-y"
                />
              </div>
            );
          }

          if (config.type === 'select') {
            return (
              <div key={fieldName} className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">{config.label}</label>
                <select
                  value={rawVal !== undefined ? String(rawVal) : ''}
                  onChange={(e) => {
                    const found = config.options.find((o) => String(o.value) === e.target.value);
                    updateField(fieldName, found ? found.value : e.target.value);
                  }}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                >
                  {config.options.map((opt) => (
                    <option key={String(opt.value)} value={String(opt.value)}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          if (config.type === 'radio') {
            return (
              <div key={fieldName} className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">{config.label}</label>
                <div className="grid grid-cols-3 gap-1 bg-muted/40 p-1 rounded-lg border border-border">
                  {config.options.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateField(fieldName, opt.value)}
                      className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                        String(rawVal) === opt.value
                          ? 'bg-background text-foreground shadow-2xs font-semibold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* Inspector Footer with Entitlement & Governance info */}
      <div className="p-3 border-t border-border bg-muted/20 text-[11px] text-muted-foreground flex items-center justify-between">
        <span className="flex items-center gap-1 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          Kanonický blok
        </span>
        <span className="capitalize">{def.maturity.toLowerCase()}</span>
      </div>
    </div>
  );
};
