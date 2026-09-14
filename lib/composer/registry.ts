import {
  Type,
  AlignLeft,
  AlertTriangle,
  Quote,
  MousePointerClick,
  Minus,
  Box,
  HelpCircle,
} from 'lucide-react';
import { ContentBlockType } from '@/lib/domain/pages';
import {
  BlockDefinition,
  HeadingBlockData,
  ParagraphBlockData,
  CalloutBlockData,
  QuoteBlockData,
  ButtonBlockData,
  DividerBlockData,
  ModuleEmbedBlockData,
} from './types';

/**
 * Text sanitization: removes dangerous control characters or HTML tags.
 * Ensures no arbitrary HTML/JS can be injected.
 */
export function sanitizePlainText(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, '') // Strip HTML tags
    .replace(/javascript:/gi, '')
    .trim();
}

/**
 * URL sanitization: prevents javascript: or data: URIs.
 */
export function sanitizeUrl(input: unknown): string {
  if (typeof input !== 'string') return '#';
  const trimmed = input.trim();
  if (/^(javascript:|data:|vbscript:)/i.test(trimmed)) {
    return '#';
  }
  return trimmed || '#';
}

export const BLOCK_REGISTRY: Record<string, BlockDefinition<any>> = {
  heading: {
    type: 'heading',
    schemaVersion: 'syn-heading-v1',
    label: 'Nadpis',
    description: 'Strukturovaný nadpis úrovně H1 až H6 pro členění textu.',
    category: 'text',
    icon: Type,
    createDefaultData: (): HeadingBlockData => ({
      text: 'Nový nadpis',
      level: 2,
      align: 'left',
    }),
    validateData: (data: unknown) => {
      const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      const text = sanitizePlainText(d.text) || 'Nadpis';
      const rawLevel = Number(d.level);
      const level = ([1, 2, 3, 4, 5, 6].includes(rawLevel) ? rawLevel : 2) as HeadingBlockData['level'];
      const align = (['left', 'center', 'right'].includes(String(d.align)) ? d.align : 'left') as HeadingBlockData['align'];
      return {
        valid: true,
        sanitized: { text, level, align },
      };
    },
  },

  paragraph: {
    type: 'paragraph',
    schemaVersion: 'syn-paragraph-v1',
    label: 'Odstavec',
    description: 'Běžný odstavec formátovaného textu se zalamováním.',
    category: 'text',
    icon: AlignLeft,
    createDefaultData: (): ParagraphBlockData => ({
      text: 'Zde napište text odstavce...',
      size: 'base',
      align: 'left',
    }),
    validateData: (data: unknown) => {
      const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      const text = sanitizePlainText(d.text);
      const size = (['sm', 'base', 'lg'].includes(String(d.size)) ? d.size : 'base') as ParagraphBlockData['size'];
      const align = (['left', 'center', 'right'].includes(String(d.align)) ? d.align : 'left') as ParagraphBlockData['align'];
      return {
        valid: true,
        sanitized: { text, size, align },
      };
    },
  },

  callout: {
    type: 'callout',
    schemaVersion: 'syn-callout-v1',
    label: 'Zvýraznění / Upozornění',
    description: 'Rámeček s informačním nebo varovným sdělením.',
    category: 'text',
    icon: AlertTriangle,
    createDefaultData: (): CalloutBlockData => ({
      title: 'Důležitá informace',
      text: 'Text zvýrazněného sdělení pro čtenáře.',
      tone: 'info',
    }),
    validateData: (data: unknown) => {
      const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      const title = sanitizePlainText(d.title);
      const text = sanitizePlainText(d.text);
      const tone = (['info', 'warning', 'success', 'critical'].includes(String(d.tone))
        ? d.tone
        : 'info') as CalloutBlockData['tone'];
      return {
        valid: true,
        sanitized: { title, text, tone },
      };
    },
  },

  quote: {
    type: 'quote',
    schemaVersion: 'syn-quote-v1',
    label: 'Citace',
    description: 'Bloková citace s možností uvedení autora a zdroje.',
    category: 'text',
    icon: Quote,
    createDefaultData: (): QuoteBlockData => ({
      quote: '„Moudrý citát, myšlenka nebo reference.“',
      author: 'Jméno autora',
      citation: 'Zdroj nebo instituce',
    }),
    validateData: (data: unknown) => {
      const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
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
    type: 'button',
    schemaVersion: 'syn-button-v1',
    label: 'Tlačítko',
    description: 'Interaktivní odkaz nebo výzva k akci (CTA).',
    category: 'interactive',
    icon: MousePointerClick,
    createDefaultData: (): ButtonBlockData => ({
      label: 'Klikněte zde',
      url: '/',
      variant: 'primary',
      target: '_self',
    }),
    validateData: (data: unknown) => {
      const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      const label = sanitizePlainText(d.label) || 'Tlačítko';
      const url = sanitizeUrl(d.url);
      const variant = (['primary', 'secondary', 'outline', 'ghost'].includes(String(d.variant))
        ? d.variant
        : 'primary') as ButtonBlockData['variant'];
      const target = (d.target === '_blank' ? '_blank' : '_self') as ButtonBlockData['target'];
      return {
        valid: true,
        sanitized: { label, url, variant, target },
      };
    },
  },

  divider: {
    type: 'divider',
    schemaVersion: 'syn-divider-v1',
    label: 'Oddělovač',
    description: 'Vodorovná linka pro vizuální oddělení sekcí stránky.',
    category: 'structural',
    icon: Minus,
    createDefaultData: (): DividerBlockData => ({
      style: 'solid',
      spacing: 'md',
    }),
    validateData: (data: unknown) => {
      const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      const style = (['solid', 'dashed', 'dotted'].includes(String(d.style))
        ? d.style
        : 'solid') as DividerBlockData['style'];
      const spacing = (['sm', 'md', 'lg'].includes(String(d.spacing))
        ? d.spacing
        : 'md') as DividerBlockData['spacing'];
      return {
        valid: true,
        sanitized: { style, spacing },
      };
    },
  },

  module_embed: {
    type: 'module_embed',
    schemaVersion: 'syn-module-embed-v1',
    label: 'Vložený modul',
    description: 'Řízená systémová komponenta registrovaná v platformě Synthesis.',
    category: 'modules',
    icon: Box,
    createDefaultData: (): ModuleEmbedBlockData => ({
      moduleKey: 'contact_form',
      schemaVersion: 'v1',
      payload: {},
    }),
    validateData: (data: unknown) => {
      const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      const moduleKey = sanitizePlainText(d.moduleKey) || 'unknown_module';
      const schemaVersion = sanitizePlainText(d.schemaVersion) || 'v1';
      const payload = (d.payload && typeof d.payload === 'object' ? d.payload : {}) as Record<string, unknown>;
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
export const UNKNOWN_BLOCK_FALLBACK: BlockDefinition<Record<string, unknown>> = {
  type: 'module_embed',
  schemaVersion: 'syn-unknown-v1',
  label: 'Neznámý blok',
  description: 'Tento typ bloku není registrován v tomto prostředí.',
  category: 'structural',
  icon: HelpCircle,
  createDefaultData: () => ({}),
  validateData: (data: unknown) => ({
    valid: false,
    errors: ['Neznámý nebo nepodporovaný typ bloku'],
    sanitized: typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {},
  }),
};

export function getBlockDefinition(type: string): BlockDefinition<any> {
  if (Object.prototype.hasOwnProperty.call(BLOCK_REGISTRY, type)) {
    return BLOCK_REGISTRY[type];
  }
  return {
    ...UNKNOWN_BLOCK_FALLBACK,
    label: `Neznámý blok (${type})`,
  };
}

export const FIRST_SLICE_BLOCK_TYPES: ContentBlockType[] = [
  'heading',
  'paragraph',
  'callout',
  'quote',
  'button',
  'divider',
];
