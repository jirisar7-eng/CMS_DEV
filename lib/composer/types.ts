import React from 'react';
import { ContentBlock, ContentBlockType } from '@/lib/domain/pages';

/**
 * Capability model for content composer actions.
 * Prevents direct hardcoded role checks in UI components.
 */
export interface ContentCapabilities {
  'content.block.create': boolean;
  'content.block.edit': boolean;
  'content.block.move': boolean;
  'content.block.duplicate': boolean;
  'content.block.delete': boolean;
  'content.draft.save': boolean;
  'content.preview': boolean;
}

export const DEFAULT_CONTENT_CAPABILITIES: ContentCapabilities = {
  'content.block.create': true,
  'content.block.edit': true,
  'content.block.move': true,
  'content.block.duplicate': true,
  'content.block.delete': true,
  'content.draft.save': true,
  'content.preview': true,
};

/**
 * Viewport preview mode
 */
export type ViewportMode = 'desktop' | 'tablet' | 'mobile';

/**
 * Typed block data interfaces adhering strictly to canonical PageContent schema
 */
export interface HeadingBlockData {
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  align?: 'left' | 'center' | 'right';
}

export interface ParagraphBlockData {
  text: string;
  size?: 'sm' | 'base' | 'lg';
  align?: 'left' | 'center' | 'right';
}

export interface CalloutBlockData {
  title?: string;
  text: string;
  tone: 'info' | 'warning' | 'success' | 'critical';
}

export interface QuoteBlockData {
  quote: string;
  author?: string;
  citation?: string;
}

export interface ButtonBlockData {
  label: string;
  url: string;
  variant: 'primary' | 'secondary' | 'outline' | 'ghost';
  target?: '_self' | '_blank';
}

export interface DividerBlockData {
  style: 'solid' | 'dashed' | 'dotted';
  spacing: 'sm' | 'md' | 'lg';
}

export interface ModuleEmbedBlockData {
  moduleKey: string;
  schemaVersion: string;
  payload: Record<string, unknown>;
}

/**
 * Registry block definition metadata and lifecycle handlers
 */
export interface BlockDefinition<T = Record<string, unknown>> {
  type: ContentBlockType;
  schemaVersion: string;
  label: string;
  description: string;
  category: 'text' | 'structural' | 'interactive' | 'modules';
  icon: React.ComponentType<{ className?: string }>;
  createDefaultData: () => T;
  validateData: (data: unknown) => { valid: boolean; errors?: string[]; sanitized: T };
}
