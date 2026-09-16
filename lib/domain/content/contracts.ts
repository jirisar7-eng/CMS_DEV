/**
 * Canonical Content Block Model (SYN-DESIGN-010)
 * Editor-independent, structured block tree.
 * Canonical content storage is strictly block-based; Markdown is never canonical storage.
 */
export type ContentBlockType =
  | 'heading'
  | 'paragraph'
  | 'rich_text'
  | 'image'
  | 'columns'
  | 'callout'
  | 'quote'
  | 'button'
  | 'divider'
  | 'module_embed';

/**
 * Validated payload for module_embed blocks.
 * Arbitrary HTML/JS or unvalidated scripts are strictly forbidden.
 */
export interface ModuleEmbedPayload {
  moduleId: string; // Registered identifier in Synthesis Module Registry
  schemaVersion: string; // Registered module schema version
  parameters: Record<string, string | number | boolean | null>;
  fallbackText?: string; // Safe textual fallback if module is unknown/unrendered
}

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  order: number;
  data: Record<string, unknown>;
  children?: ContentBlock[];
}

export interface PageContent {
  version: number;
  schemaVersion: string;
  blocks: ContentBlock[];
}
