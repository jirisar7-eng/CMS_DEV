import React from "react";
import { ContentBlock } from "@/lib/domain/pages";
import {
  HeadingBlockData,
  ParagraphBlockData,
  RichTextBlockData,
  ImageBlockData,
  ColumnsBlockData,
  CalloutBlockData,
  QuoteBlockData,
  ButtonBlockData,
  DividerBlockData,
  ModuleEmbedBlockData,
} from "@/lib/composer/types";
import { sanitizeRichText } from "@/lib/composer/registry";
import {
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
  ArrowRight,
  HelpCircle,
  Box,
} from "lucide-react";

export interface ColumnsLayoutInfo {
  gapClass: string;
  gridClass: string;
  getColumnSpanClass: (index: number) => string;
}

export function getColumnsLayoutInfo(layout?: string, gap?: string): ColumnsLayoutInfo {
  const gapClass = gap === "sm" ? "gap-3" : gap === "lg" ? "gap-8" : "gap-5";
  const gridClass =
    layout === "1-2"
      ? "grid-cols-1 md:grid-cols-3"
      : layout === "2-1"
      ? "grid-cols-1 md:grid-cols-3"
      : layout === "1-1-1"
      ? "grid-cols-1 md:grid-cols-3"
      : "grid-cols-1 md:grid-cols-2";

  const getColumnSpanClass = (index: number): string => {
    if (layout === "1-2") {
      return index === 1 ? "md:col-span-2" : "md:col-span-1";
    }
    if (layout === "2-1") {
      return index === 0 ? "md:col-span-2" : "md:col-span-1";
    }
    return "md:col-span-1";
  };

  return { gapClass, gridClass, getColumnSpanClass };
}

interface BlockRendererProps {
  block: ContentBlock;
  isPreview?: boolean;
}

export const BlockRenderer: React.FC<BlockRendererProps> = ({ block, isPreview = false }) => {
  const data = (block.data || {}) as Record<string, unknown>;

  switch (block.type) {
    case "heading": {
      const hData = data as unknown as HeadingBlockData;
      const level = Number(hData.level) || 2;
      const text = hData.text || "Bez názvu";
      const alignClass =
        hData.align === "center"
          ? "text-center"
          : hData.align === "right"
          ? "text-right"
          : "text-left";

      switch (level) {
        case 1:
          return <h1 className={`text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground ${alignClass}`}>{text}</h1>;
        case 2:
          return <h2 className={`text-2xl sm:text-3xl font-bold tracking-tight text-foreground ${alignClass}`}>{text}</h2>;
        case 3:
          return <h3 className={`text-xl sm:text-2xl font-semibold tracking-tight text-foreground ${alignClass}`}>{text}</h3>;
        case 4:
          return <h4 className={`text-lg sm:text-xl font-semibold text-foreground ${alignClass}`}>{text}</h4>;
        case 5:
          return <h5 className={`text-base font-semibold text-foreground ${alignClass}`}>{text}</h5>;
        case 6:
          return <h6 className={`text-sm font-semibold text-muted-foreground uppercase tracking-wider ${alignClass}`}>{text}</h6>;
        default:
          return <h2 className={`text-2xl font-bold text-foreground ${alignClass}`}>{text}</h2>;
      }
    }

    case "paragraph": {
      const pData = data as unknown as ParagraphBlockData;
      const sizeClass =
        pData.size === "sm"
          ? "text-sm text-muted-foreground"
          : pData.size === "lg"
          ? "text-lg text-foreground leading-relaxed"
          : "text-base text-foreground/90 leading-relaxed";
      const alignClass =
        pData.align === "center"
          ? "text-center"
          : pData.align === "right"
          ? "text-right"
          : "text-left";

      return (
        <p className={`${sizeClass} ${alignClass} break-words whitespace-pre-line`}>
          {pData.text || (isPreview ? <span className="italic text-muted-foreground/60">Prázdný odstavec</span> : "")}
        </p>
      );
    }

    case "rich_text": {
      const rData = data as unknown as RichTextBlockData;
      const alignClass =
        rData.align === "center"
          ? "text-center"
          : rData.align === "right"
          ? "text-right"
          : "text-left";

      return (
        <div
          className={`prose dark:prose-invert max-w-none text-foreground ${alignClass}`}
          dangerouslySetInnerHTML={{ __html: sanitizeRichText(rData.html || "<p></p>") }}
        />
      );
    }

    case "image": {
      const imgData = data as unknown as ImageBlockData;
      const aspectRatioClass =
        imgData.aspectRatio === "16:9"
          ? "aspect-video"
          : imgData.aspectRatio === "4:3"
          ? "aspect-4/3"
          : imgData.aspectRatio === "1:1"
          ? "aspect-square"
          : "auto";

      if (!imgData.url) {
        return (
          <div className="w-full rounded-xl border border-dashed border-border bg-muted/30 p-8 flex flex-col items-center justify-center text-center">
            <span className="text-sm font-medium text-muted-foreground">Obrázek bez zadaného zdroje</span>
          </div>
        );
      }

      return (
        <figure className="w-full flex flex-col items-center my-2">
          <div className={`w-full overflow-hidden rounded-xl border border-border bg-muted/20 ${aspectRatioClass}`}>
            <img
              src={imgData.url}
              alt={imgData.alt || "Obrázek"}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
          {imgData.caption && (
            <figcaption className="text-xs text-muted-foreground mt-2 text-center">
              {imgData.caption}
            </figcaption>
          )}
        </figure>
      );
    }

    case "columns": {
      const cData = data as unknown as ColumnsBlockData;
      const { gapClass, gridClass, getColumnSpanClass } = getColumnsLayoutInfo(cData.layout, cData.gap);

      return (
        <div className={`grid ${gridClass} ${gapClass} w-full my-2`}>
          {Array.isArray(block.children) && block.children.length > 0 ? (
            block.children.map((child, idx) => (
              <div key={child.id} className={`w-full ${getColumnSpanClass(idx)}`}>
                <BlockRenderer block={child} isPreview={isPreview} />
              </div>
            ))
          ) : (
            <div className="col-span-full border border-dashed border-border rounded-lg p-4 text-center text-xs text-muted-foreground">
              Sloty sloupců jsou připraveny pro vnořené bloky.
            </div>
          )}
        </div>
      );
    }

    case "callout": {
      const cData = data as unknown as CalloutBlockData;
      const tone = cData.tone || "info";
      const toneStyles = {
        info: {
          container: "bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200",
          icon: <Info className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />,
        },
        warning: {
          container: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200",
          icon: <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />,
        },
        success: {
          container: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200",
          icon: <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />,
        },
        critical: {
          container: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200",
          icon: <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />,
        },
      };
      const style = toneStyles[tone] || toneStyles.info;

      return (
        <div className={`flex gap-3.5 p-4 rounded-xl border ${style.container} text-sm leading-relaxed`}>
          {style.icon}
          <div className="space-y-1 min-w-0">
            {cData.title && <div className="font-bold text-foreground">{cData.title}</div>}
            <div className="break-words whitespace-pre-line">{cData.text}</div>
          </div>
        </div>
      );
    }

    case "quote": {
      const qData = data as unknown as QuoteBlockData;
      return (
        <blockquote className="border-l-4 border-primary/40 pl-4 py-1 italic my-2 space-y-1">
          <p className="text-base text-foreground font-serif leading-relaxed">
            {qData.quote || "„Citát“"}
          </p>
          {(qData.author || qData.citation) && (
            <footer className="text-xs text-muted-foreground not-italic flex items-center gap-1.5 pt-1">
              {qData.author && <span className="font-semibold text-foreground">{qData.author}</span>}
              {qData.author && qData.citation && <span>•</span>}
              {qData.citation && <span>{qData.citation}</span>}
            </footer>
          )}
        </blockquote>
      );
    }

    case "button": {
      const bData = data as unknown as ButtonBlockData;
      const variantStyles = {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-border bg-background hover:bg-muted text-foreground",
        ghost: "hover:bg-muted text-foreground",
      };
      const style = variantStyles[bData.variant] || variantStyles.primary;

      return (
        <div className="my-2">
          <a
            href={bData.url || "#"}
            target={bData.target || "_self"}
            rel={bData.target === "_blank" ? "noopener noreferrer" : undefined}
            onClick={(e) => {
              if (isPreview) e.preventDefault(); // In editor preview mode, prevent navigation
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${style}`}
          >
            <span>{bData.label || "Tlačítko"}</span>
            <ArrowRight className="w-4 h-4 opacity-70" />
          </a>
        </div>
      );
    }

    case "divider": {
      const dData = data as unknown as DividerBlockData;
      const styleClass =
        dData.style === "dashed"
          ? "border-dashed"
          : dData.style === "dotted"
          ? "border-dotted"
          : "border-solid";
      const spacingClass =
        dData.spacing === "sm" ? "my-3" : dData.spacing === "lg" ? "my-8" : "my-5";

      return <hr className={`border-t border-border ${styleClass} ${spacingClass} w-full`} />;
    }

    case "module_embed": {
      const mData = data as unknown as ModuleEmbedBlockData;
      return (
        <div className="rounded-xl border border-border bg-card p-4 my-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground">
                Systémový modul: <span className="font-mono text-primary">{mData.moduleId || "Neznámý"}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Verze rozhraní: {mData.schemaVersion || "v1"}
              </div>
            </div>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-mono">
            Řízená komponenta
          </span>
        </div>
      );
    }

    default: {
      return (
        <div className="p-3 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
          <HelpCircle className="w-4 h-4 shrink-0" />
          <span>Neznámý typ bloku ({block.type}). Zobrazen v bezpečném režimu bezpečně bez skriptů.</span>
        </div>
      );
    }
  }
};
