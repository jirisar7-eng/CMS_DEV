import React from 'react';
import { ContentBlock } from '@/lib/domain/pages';
import {
  HeadingBlockData,
  ParagraphBlockData,
  CalloutBlockData,
  QuoteBlockData,
  ButtonBlockData,
  DividerBlockData,
  ModuleEmbedBlockData,
} from '@/lib/composer/types';
import {
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
  ArrowRight,
  HelpCircle,
  Box,
} from 'lucide-react';

interface BlockRendererProps {
  block: ContentBlock;
  isPreview?: boolean;
}

export const BlockRenderer: React.FC<BlockRendererProps> = ({ block, isPreview = false }) => {
  const data = (block.data || {}) as Record<string, unknown>;

  switch (block.type) {
    case 'heading': {
      const hData = data as unknown as HeadingBlockData;
      const level = Number(hData.level) || 2;
      const text = hData.text || 'Bez názvu';
      const alignClass =
        hData.align === 'center'
          ? 'text-center'
          : hData.align === 'right'
          ? 'text-right'
          : 'text-left';

      switch (level) {
        case 1:
          return <h1 className={`text-3xl font-extrabold tracking-tight text-foreground ${alignClass}`}>{text}</h1>;
        case 2:
          return <h2 className={`text-2xl font-bold tracking-tight text-foreground ${alignClass}`}>{text}</h2>;
        case 3:
          return <h3 className={`text-xl font-semibold tracking-tight text-foreground ${alignClass}`}>{text}</h3>;
        case 4:
          return <h4 className={`text-lg font-semibold text-foreground ${alignClass}`}>{text}</h4>;
        case 5:
          return <h5 className={`text-base font-semibold text-foreground ${alignClass}`}>{text}</h5>;
        case 6:
        default:
          return <h6 className={`text-sm font-semibold uppercase tracking-wider text-muted-foreground ${alignClass}`}>{text}</h6>;
      }
    }

    case 'paragraph': {
      const pData = data as unknown as ParagraphBlockData;
      const text = pData.text || '';
      const sizeClass =
        pData.size === 'sm'
          ? 'text-sm'
          : pData.size === 'lg'
          ? 'text-lg leading-relaxed'
          : 'text-base leading-normal';
      const alignClass =
        pData.align === 'center'
          ? 'text-center'
          : pData.align === 'right'
          ? 'text-right'
          : 'text-left';

      return (
        <p className={`text-foreground/90 whitespace-pre-wrap ${sizeClass} ${alignClass}`}>
          {text || (
            <span className="text-muted-foreground/60 italic">
              {isPreview ? '' : 'Prázdný odstavec...'}
            </span>
          )}
        </p>
      );
    }

    case 'callout': {
      const cData = data as unknown as CalloutBlockData;
      const tone = cData.tone || 'info';
      const toneConfig = {
        info: {
          icon: Info,
          classes: 'bg-sky-500/10 border-sky-500/30 text-sky-950 dark:text-sky-200',
          iconColor: 'text-sky-600 dark:text-sky-400',
        },
        warning: {
          icon: AlertTriangle,
          classes: 'bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-200',
          iconColor: 'text-amber-600 dark:text-amber-400',
        },
        success: {
          icon: CheckCircle,
          classes: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200',
          iconColor: 'text-emerald-600 dark:text-emerald-400',
        },
        critical: {
          icon: AlertCircle,
          classes: 'bg-rose-500/10 border-rose-500/30 text-rose-950 dark:text-rose-200',
          iconColor: 'text-rose-600 dark:text-rose-400',
        },
      }[tone];

      const Icon = toneConfig.icon;

      return (
        <div className={`p-4 rounded-xl border flex items-start gap-3.5 my-2 ${toneConfig.classes}`}>
          <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${toneConfig.iconColor}`} />
          <div className="space-y-1 min-w-0">
            {cData.title && (
              <h5 className="font-semibold text-sm sm:text-base leading-tight">
                {cData.title}
              </h5>
            )}
            <p className="text-xs sm:text-sm whitespace-pre-wrap opacity-90 leading-relaxed">
              {cData.text || (
                <span className="italic opacity-60">{isPreview ? '' : 'Text upozornění...'}</span>
              )}
            </p>
          </div>
        </div>
      );
    }

    case 'quote': {
      const qData = data as unknown as QuoteBlockData;
      return (
        <figure className="border-l-4 border-primary/60 pl-4 py-1.5 my-2 space-y-1">
          <blockquote className="text-base sm:text-lg italic text-foreground leading-snug">
            {qData.quote || '„Vložte text citace...“'}
          </blockquote>
          {(qData.author || qData.citation) && (
            <figcaption className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5">
              {qData.author && <span className="font-medium text-foreground">{qData.author}</span>}
              {qData.author && qData.citation && <span>—</span>}
              {qData.citation && <span>{qData.citation}</span>}
            </figcaption>
          )}
        </figure>
      );
    }

    case 'button': {
      const bData = data as unknown as ButtonBlockData;
      const variantClasses = {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-border bg-background text-foreground hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
      }[bData.variant || 'primary'];

      return (
        <div className="py-2">
          <a
            href={isPreview ? bData.url || '#' : undefined}
            target={bData.target === '_blank' ? '_blank' : undefined}
            rel="noopener noreferrer"
            onClick={(e) => {
              if (!isPreview) e.preventDefault();
            }}
            className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg text-sm font-semibold transition-colors cursor-pointer select-none ${variantClasses}`}
          >
            <span>{bData.label || 'Tlačítko'}</span>
            <ArrowRight className="w-4 h-4 opacity-75" />
          </a>
        </div>
      );
    }

    case 'divider': {
      const dData = data as unknown as DividerBlockData;
      const borderClass =
        dData.style === 'dashed'
          ? 'border-dashed'
          : dData.style === 'dotted'
          ? 'border-dotted'
          : 'border-solid';
      const marginClass =
        dData.spacing === 'sm'
          ? 'my-2'
          : dData.spacing === 'lg'
          ? 'my-8'
          : 'my-4';

      return <hr className={`border-t border-border ${borderClass} ${marginClass}`} />;
    }

    case 'module_embed': {
      const mData = data as unknown as ModuleEmbedBlockData;
      return (
        <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-between gap-4 my-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-sm text-foreground">
                Vložený modul: <span className="font-mono">{mData.moduleKey}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Schéma verze: <span className="font-mono">{mData.schemaVersion}</span>
              </div>
            </div>
          </div>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
            Řízená komponenta
          </span>
        </div>
      );
    }

    default: {
      return (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-200 flex items-center gap-3 my-2">
          <HelpCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="text-xs sm:text-sm">
            <span className="font-semibold">Neznámý blok: </span>
            <span className="font-mono">{block.type}</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              Tento blok nemá registrovaný renderer a zobrazuje se v bezpečném nouzovém režimu.
            </span>
          </div>
        </div>
      );
    }
  }
};
