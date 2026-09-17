import {
  Type,
  AlignLeft,
  AlertTriangle,
  Quote,
  MousePointerClick,
  Minus,
  Box,
  HelpCircle,
  FileText,
  Image as ImageIcon,
  Columns,
} from "lucide-react";
import { ContentBlockType } from "@/lib/domain/pages";
import {
  ComponentRegistryEntry,
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
  ProjectEntitlements,
} from "./types";
import { isEntitlementSatisfied } from "./entitlements";

/**
 * Text sanitization: removes dangerous control characters and script blocks.
 */
export function sanitizePlainText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]*>/g, "") // Strip remaining HTML tags
    .replace(/javascript:/gi, "")
    .trim();
}

/**
 * Rich text sanitization: allows safe formatting tags but removes harmful scripts/attributes.
 */
export function sanitizeRichText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\bon\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}

/**
 * URL sanitization: strictly prevents javascript:, data:, or vbscript: URIs.
 */
export function sanitizeUrl(input: unknown): string {
  if (typeof input !== "string") return "#";
  const trimmed = input.trim();
  if (/^(javascript:|data:|vbscript:)/i.test(trimmed)) {
    return "#";
  }
  return trimmed || "#";
}

/**
 * Canonical Component Registry for Synthesis CMS Editor
 */
export const COMPONENT_REGISTRY: Record<string, ComponentRegistryEntry<any>> = {
  heading: {
    featureKey: "core.heading",
    type: "heading",
    schemaVersion: "syn-heading-v1",
    label: "Heading",
    czechLabel: "Nadpis",
    description: "Structured heading levels H1-H6.",
    czechDescription: "Strukturovaný nadpis úrovně H1 až H6 pro členění textu.",
    category: "text",
    maturity: "STABLE",
    requiredEntitlement: "community",
    icon: Type,
    fields: {
      text: { type: "text", label: "Text nadpisu", placeholder: "Zadejte nadpis..." },
      level: {
        type: "select",
        label: "Úroveň nadpisu",
        options: [
          { label: "H1 - Hlavní nadpis", value: 1 },
          { label: "H2 - Sekční nadpis", value: 2 },
          { label: "H3 - Podnadpis", value: 3 },
          { label: "H4 - Malý nadpis", value: 4 },
        ],
      },
      align: {
        type: "radio",
        label: "Zarovnání",
        options: [
          { label: "Vlevo", value: "left" },
          { label: "Na střed", value: "center" },
          { label: "Vpravo", value: "right" },
        ],
      },
    },
    createDefaultData: (): HeadingBlockData => ({
      text: "Nový nadpis",
      level: 2,
      align: "left",
    }),
    validateData: (data: unknown) => {
      const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
      const text = sanitizePlainText(d.text) || "Nadpis";
      const rawLevel = Number(d.level);
      const level = ([1, 2, 3, 4, 5, 6].includes(rawLevel) ? rawLevel : 2) as HeadingBlockData["level"];
      const align = (["left", "center", "right"].includes(String(d.align)) ? d.align : "left") as HeadingBlockData["align"];
      return {
        valid: true,
        sanitized: { text, level, align },
      };
    },
    migrateData: (data: Record<string, unknown>) => {
      return {
        text: sanitizePlainText(data.text || data.title) || "Nadpis",
        level: Number(data.level) === 1 ? 1 : 2,
        align: data.align === "center" ? "center" : "left",
      };
    },
  },

  paragraph: {
    featureKey: "core.paragraph",
    type: "paragraph",
    schemaVersion: "syn-paragraph-v1",
    label: "Paragraph",
    czechLabel: "Odstavec",
    description: "Standard text paragraph with size and alignment options.",
    czechDescription: "Běžný odstavec formátovaného textu se zalamováním.",
    category: "text",
    maturity: "STABLE",
    requiredEntitlement: "community",
    icon: AlignLeft,
    fields: {
      text: { type: "textarea", label: "Text odstavce", placeholder: "Zde napište text..." },
      size: {
        type: "select",
        label: "Velikost písma",
        options: [
          { label: "Standardní (Base)", value: "base" },
          { label: "Drobný (Small)", value: "sm" },
          { label: "Zvětšený (Large)", value: "lg" },
        ],
      },
      align: {
        type: "radio",
        label: "Zarovnání",
        options: [
          { label: "Vlevo", value: "left" },
          { label: "Na střed", value: "center" },
          { label: "Vpravo", value: "right" },
        ],
      },
    },
    createDefaultData: (): ParagraphBlockData => ({
      text: "Zde napište text odstavce...",
      size: "base",
      align: "left",
    }),
    validateData: (data: unknown) => {
      const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
      const text = sanitizePlainText(d.text);
      const size = (["sm", "base", "lg"].includes(String(d.size)) ? d.size : "base") as ParagraphBlockData["size"];
      const align = (["left", "center", "right"].includes(String(d.align)) ? d.align : "left") as ParagraphBlockData["align"];
      return {
        valid: true,
        sanitized: { text, size, align },
      };
    },
  },

  rich_text: {
    featureKey: "core.rich_text",
    type: "rich_text",
    schemaVersion: "syn-rich-text-v1",
    label: "Rich Text",
    czechLabel: "Formátovaný text",
    description: "Rich WYSIWYG text block supporting inline styling and lists.",
    czechDescription: "Formátovaný textový blok s podporou odrážek, odkazů a zvýraznění.",
    category: "text",
    maturity: "STABLE",
    requiredEntitlement: "commercial",
    icon: FileText,
    fields: {
      html: { type: "rich_text", label: "Formátovaný obsah" },
      align: {
        type: "radio",
        label: "Zarovnání",
        options: [
          { label: "Vlevo", value: "left" },
          { label: "Na střed", value: "center" },
          { label: "Vpravo", value: "right" },
        ],
      },
    },
    createDefaultData: (): RichTextBlockData => ({
      html: "<p>Formátovaný obsah s <strong>tučným</strong> a <em>kurzivním</em> písmem.</p>",
      align: "left",
    }),
    validateData: (data: unknown) => {
      const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
      const html = sanitizeRichText(d.html);
      const align = (["left", "center", "right"].includes(String(d.align)) ? d.align : "left") as RichTextBlockData["align"];
      return {
        valid: true,
        sanitized: { html, align },
      };
    },
  },

  image: {
    featureKey: "core.image",
    type: "image",
    schemaVersion: "syn-image-v1",
    label: "Image",
    czechLabel: "Obrázek",
    description: "Responsive image with aspect ratio and media manager support.",
    czechDescription: "Responzivní obrázek s volbou poměru stran a popisku.",
    category: "media",
    maturity: "STABLE",
    requiredEntitlement: "community",
    icon: ImageIcon,
    fields: {
      url: { type: "text", label: "URL obrázku / Mediální asset", placeholder: "/assets/..." },
      alt: { type: "text", label: "Alternativní popis (Alt)", placeholder: "Popis pro přístupnost..." },
      caption: { type: "text", label: "Popisek pod obrázkem", placeholder: "Volitelný popisek..." },
      aspectRatio: {
        type: "select",
        label: "Poměr stran",
        options: [
          { label: "Automatický (Původní)", value: "auto" },
          { label: "Širokoúhlý (16:9)", value: "16:9" },
          { label: "Standardní (4:3)", value: "4:3" },
          { label: "Čtverec (1:1)", value: "1:1" },
        ],
      },
    },
    createDefaultData: (): ImageBlockData => ({
      url: "",
      alt: "Obrázek",
      caption: "",
      aspectRatio: "auto",
      objectFit: "cover",
    }),
    validateData: (data: unknown) => {
      const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
      const url = sanitizeUrl(d.url);
      const alt = sanitizePlainText(d.alt) || "Obrázek";
      const caption = sanitizePlainText(d.caption);
      const aspectRatio = (["16:9", "4:3", "1:1", "auto"].includes(String(d.aspectRatio))
        ? d.aspectRatio
        : "auto") as ImageBlockData["aspectRatio"];
      return {
        valid: true,
        sanitized: { url, alt, caption, aspectRatio, objectFit: "cover" },
      };
    },
  },

  columns: {
    featureKey: "core.columns",
    type: "columns",
    schemaVersion: "syn-columns-v1",
    label: "Columns (Slots)",
    czechLabel: "Sloupce / Rozvržení",
    description: "Multi-column structural layout supporting nested block slots.",
    czechDescription: "Vícesloupcové rozvržení pro vnořené bloky a sloty.",
    category: "structural",
    maturity: "STABLE",
    requiredEntitlement: "community",
    supportsSlots: true,
    icon: Columns,
    fields: {
      layout: {
        type: "select",
        label: "Rozdělení sloupců",
        options: [
          { label: "50% / 50% (Dva stejné sloupce)", value: "1-1" },
          { label: "33% / 66% (Levý úzký, pravý široký)", value: "1-2" },
          { label: "66% / 33% (Levý široký, pravý úzký)", value: "2-1" },
          { label: "33% / 33% / 33% (Tři stejné sloupce)", value: "1-1-1" },
        ],
      },
      gap: {
        type: "select",
        label: "Mezera mezi sloupci",
        options: [
          { label: "Malá", value: "sm" },
          { label: "Střední", value: "md" },
          { label: "Velká", value: "lg" },
        ],
      },
    },
    createDefaultData: (): ColumnsBlockData => ({
      layout: "1-1",
      gap: "md",
    }),
    validateData: (data: unknown) => {
      const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
      const layout = (["1-1", "1-2", "2-1", "1-1-1", "1-1-1-1"].includes(String(d.layout))
        ? d.layout
        : "1-1") as ColumnsBlockData["layout"];
      const gap = (["sm", "md", "lg"].includes(String(d.gap)) ? d.gap : "md") as ColumnsBlockData["gap"];
      return {
        valid: true,
        sanitized: { layout, gap },
      };
    },
  },

  callout: {
    featureKey: "core.callout",
    type: "callout",
    schemaVersion: "syn-callout-v1",
    label: "Callout",
    czechLabel: "Zvýraznění / Upozornění",
    description: "Highlighted callout box for important notices.",
    czechDescription: "Rámeček s informačním nebo varovným sdělením.",
    category: "text",
    maturity: "STABLE",
    requiredEntitlement: "community",
    icon: AlertTriangle,
    fields: {
      title: { type: "text", label: "Nadpis boxu", placeholder: "Důležité..." },
      text: { type: "textarea", label: "Text sdělení", placeholder: "Text upozornění..." },
      tone: {
        type: "select",
        label: "Typ upozornění",
        options: [
          { label: "Informační (Modrá)", value: "info" },
          { label: "Varování (Jantarová)", value: "warning" },
          { label: "Úspěch (Zelená)", value: "success" },
          { label: "Kritické (Červená)", value: "critical" },
        ],
      },
    },
    createDefaultData: (): CalloutBlockData => ({
      title: "Důležitá informace",
      text: "Text zvýrazněného sdělení pro čtenáře.",
      tone: "info",
    }),
    validateData: (data: unknown) => {
      const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
      const title = sanitizePlainText(d.title);
      const text = sanitizePlainText(d.text);
      const tone = (["info", "warning", "success", "critical"].includes(String(d.tone))
        ? d.tone
        : "info") as CalloutBlockData["tone"];
      return {
        valid: true,
        sanitized: { title, text, tone },
      };
    },
  },

  quote: {
    featureKey: "core.quote",
    type: "quote",
    schemaVersion: "syn-quote-v1",
    label: "Quote",
    czechLabel: "Citace",
    description: "Blockquote with author and citation source.",
    czechDescription: "Bloková citace s možností uvedení autora a zdroje.",
    category: "text",
    maturity: "STABLE",
    requiredEntitlement: "community",
    icon: Quote,
    fields: {
      quote: { type: "textarea", label: "Citovaný text" },
      author: { type: "text", label: "Autor citace" },
      citation: { type: "text", label: "Zdroj / Instituce" },
    },
    createDefaultData: (): QuoteBlockData => ({
      quote: "„Moudrý citát, myšlenka nebo reference.“",
      author: "Jméno autora",
      citation: "Zdroj nebo instituce",
    }),
    validateData: (data: unknown) => {
      const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
      const quote = sanitizePlainText(d.quote);
      const author = sanitizePlainText(d.author);
      const citation = sanitizePlainText(d.citation);
      return {
        valid: true,
        sanitized: { quote, author, citation },
      };
    },
  },

  button: {
    featureKey: "core.button",
    type: "button",
    schemaVersion: "syn-button-v1",
    label: "Button",
    czechLabel: "Tlačítko",
    description: "Interactive button or call-to-action link.",
    czechDescription: "Interaktivní odkaz nebo výzva k akci (CTA).",
    category: "interactive",
    maturity: "STABLE",
    requiredEntitlement: "community",
    icon: MousePointerClick,
    fields: {
      label: { type: "text", label: "Popisek tlačítka" },
      url: { type: "text", label: "Cílová URL adresa" },
      variant: {
        type: "select",
        label: "Vzhled tlačítka",
        options: [
          { label: "Primární (Plné)", value: "primary" },
          { label: "Sekundární", value: "secondary" },
          { label: "Obrysové (Outline)", value: "outline" },
          { label: "Textové (Ghost)", value: "ghost" },
        ],
      },
      target: {
        type: "radio",
        label: "Otevřít v",
        options: [
          { label: "Stejné záložce", value: "_self" },
          { label: "Nové záložce", value: "_blank" },
        ],
      },
    },
    createDefaultData: (): ButtonBlockData => ({
      label: "Klikněte zde",
      url: "/",
      variant: "primary",
      target: "_self",
    }),
    validateData: (data: unknown) => {
      const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
      const label = sanitizePlainText(d.label) || "Tlačítko";
      const url = sanitizeUrl(d.url);
      const variant = (["primary", "secondary", "outline", "ghost"].includes(String(d.variant))
        ? d.variant
        : "primary") as ButtonBlockData["variant"];
      const target = (d.target === "_blank" ? "_blank" : "_self") as ButtonBlockData["target"];
      return {
        valid: true,
        sanitized: { label, url, variant, target },
      };
    },
  },

  divider: {
    featureKey: "core.divider",
    type: "divider",
    schemaVersion: "syn-divider-v1",
    label: "Divider",
    czechLabel: "Oddělovač",
    description: "Horizontal divider separating page sections.",
    czechDescription: "Vodorovná linka pro vizuální oddělení sekcí stránky.",
    category: "structural",
    maturity: "STABLE",
    requiredEntitlement: "community",
    icon: Minus,
    fields: {
      style: {
        type: "select",
        label: "Styl čáry",
        options: [
          { label: "Plná čára", value: "solid" },
          { label: "Čárkovaná", value: "dashed" },
          { label: "Tečkovaná", value: "dotted" },
        ],
      },
      spacing: {
        type: "select",
        label: "Odsazení",
        options: [
          { label: "Kompaktní", value: "sm" },
          { label: "Standardní", value: "md" },
          { label: "Velké", value: "lg" },
        ],
      },
    },
    createDefaultData: (): DividerBlockData => ({
      style: "solid",
      spacing: "md",
    }),
    validateData: (data: unknown) => {
      const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
      const style = (["solid", "dashed", "dotted"].includes(String(d.style))
        ? d.style
        : "solid") as DividerBlockData["style"];
      const spacing = (["sm", "md", "lg"].includes(String(d.spacing))
        ? d.spacing
        : "md") as DividerBlockData["spacing"];
      return {
        valid: true,
        sanitized: { style, spacing },
      };
    },
  },

  module_embed: {
    featureKey: "core.module_embed",
    type: "module_embed",
    schemaVersion: "syn-module-embed-v1",
    label: "Module Embed",
    czechLabel: "Vložený modul",
    description: "Governed system component from Synthesis Module Registry.",
    czechDescription: "Řízená systémová komponenta registrovaná v platformě Synthesis.",
    category: "modules",
    maturity: "STABLE",
    requiredEntitlement: "commercial",
    icon: Box,
    fields: {
      moduleKey: {
        type: "select",
        label: "Systémový modul",
        options: [
          { label: "Kontaktní formulář", value: "contact_form" },
          { label: "Navigační menu (Header)", value: "nav_header" },
          { label: "Navigační patička (Footer)", value: "nav_footer" },
          { label: "Seznam novinek", value: "news_feed" },
        ],
      },
    },
    createDefaultData: (): ModuleEmbedBlockData => ({
      moduleKey: "contact_form",
      schemaVersion: "v1",
      payload: {},
    }),
    validateData: (data: unknown) => {
      const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
      const moduleKey = sanitizePlainText(d.moduleKey) || "contact_form";
      const schemaVersion = sanitizePlainText(d.schemaVersion) || "v1";
      const payload = (d.payload && typeof d.payload === "object" ? d.payload : {}) as Record<string, unknown>;
      return {
        valid: true,
        sanitized: { moduleKey, schemaVersion, payload },
      };
    },
  },
};

/**
 * Safe fallback definition for unknown block types or unvalidated payloads.
 * Strictly guarantees no arbitrary HTML/JS execution.
 */
export const UNKNOWN_BLOCK_FALLBACK: ComponentRegistryEntry<Record<string, unknown>> = {
  featureKey: "core.unknown",
  type: "module_embed",
  schemaVersion: "syn-unknown-v1",
  label: "Unknown Block",
  czechLabel: "Neznámý blok",
  description: "This block type is not registered or supported in this environment.",
  czechDescription: "Tento typ bloku není registrován v tomto prostředí.",
  category: "structural",
  maturity: "DEPRECATED",
  requiredEntitlement: "community",
  icon: HelpCircle,
  fields: {},
  createDefaultData: () => ({}),
  validateData: (data: unknown) => ({
    valid: false,
    errors: ["Neznámý nebo nepodporovaný typ bloku"],
    sanitized: typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {},
  }),
};

export function getBlockDefinition(type: string): ComponentRegistryEntry<any> {
  if (Object.prototype.hasOwnProperty.call(COMPONENT_REGISTRY, type)) {
    return COMPONENT_REGISTRY[type];
  }
  return {
    ...UNKNOWN_BLOCK_FALLBACK,
    label: `Unknown (${type})`,
    czechLabel: `Neznámý blok (${type})`,
  };
}

/**
 * Filter available palette blocks based on active project entitlements
 */
export function getAvailableComponentTypes(entitlements: ProjectEntitlements): ContentBlockType[] {
  return Object.values(COMPONENT_REGISTRY)
    .filter((entry) => isEntitlementSatisfied(entry.requiredEntitlement, entitlements).allowed)
    .map((entry) => entry.type);
}

export const FIRST_SLICE_BLOCK_TYPES: ContentBlockType[] = [
  "heading",
  "paragraph",
  "rich_text",
  "image",
  "columns",
  "callout",
  "quote",
  "button",
  "divider",
  "module_embed",
];
