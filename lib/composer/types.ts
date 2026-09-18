import React from "react";
import { ContentBlock, ContentBlockType, PageContent } from "@/lib/domain/pages";

/**
 * Entitlement editions for Synthesis CMS Page Editor
 */
export type EditorEdition = "COMMUNITY" | "COMMERCIAL" | "GRANTED";

/**
 * Feature maturity levels for registered components
 */
export type ComponentMaturity = "STABLE" | "BETA" | "EXPERIMENTAL" | "DEPRECATED";

/**
 * Required entitlement tier to use or configure a component
 */
export type RequiredEntitlement = "community" | "commercial" | "labs";

/**
 * Labs capability feature flags (Labs is an explicit opt-in overlay, NOT a separate codebase)
 */
export interface LabsFeatureFlags {
  "labs.access": boolean;
  "labs.puck_ai": boolean;
  "labs.ai_design": boolean;
  "labs.virtualization": boolean;
  "labs.new_components": boolean;
  "labs.beta_plugins": boolean;
}

export const DEFAULT_LABS_FLAGS: LabsFeatureFlags = {
  "labs.access": false,
  "labs.puck_ai": false,
  "labs.ai_design": false,
  "labs.virtualization": false,
  "labs.new_components": false,
  "labs.beta_plugins": false,
};

/**
 * Active entitlements context resolved per project / organization
 */
export interface ProjectEntitlements {
  edition: EditorEdition;
  features: {
    advancedEditor: boolean;
    permissions: boolean;
    dynamicExternalFields: boolean;
    advancedPlugins: boolean;
    customSlots: boolean;
    puckAi: boolean;
  };
  labs: LabsFeatureFlags;
}

/**
 * Capability model for content composer actions.
 * Enforces server-side and client-side access control.
 */
export interface ContentCapabilities {
  "content.block.create": boolean;
  "content.block.edit": boolean;
  "content.block.move": boolean;
  "content.block.duplicate": boolean;
  "content.block.delete": boolean;
  "content.draft.save": boolean;
  "content.preview": boolean;
  "content.undo_redo": boolean;
  "content.outline": boolean;
  "content.rich_text": boolean;
  "content.plugins": boolean;
}

export const DEFAULT_CONTENT_CAPABILITIES: ContentCapabilities = {
  "content.block.create": true,
  "content.block.edit": true,
  "content.block.move": true,
  "content.block.duplicate": true,
  "content.block.delete": true,
  "content.draft.save": true,
  "content.preview": true,
  "content.undo_redo": true,
  "content.outline": true,
  "content.rich_text": true,
  "content.plugins": true,
};

/**
 * Viewport preview mode
 */
export type ViewportMode = "desktop" | "tablet" | "mobile";

/**
 * Typed block data interfaces adhering strictly to canonical PageContent schema
 */
export interface HeadingBlockData {
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  align?: "left" | "center" | "right";
}

export interface ParagraphBlockData {
  text: string;
  size?: "sm" | "base" | "lg";
  align?: "left" | "center" | "right";
}

export interface RichTextBlockData {
  html: string;
  align?: "left" | "center" | "right";
}

export interface ImageBlockData {
  url: string;
  alt: string;
  caption?: string;
  aspectRatio?: "16:9" | "4:3" | "1:1" | "auto";
  objectFit?: "cover" | "contain" | "fill";
}

export interface ColumnsBlockData {
  layout: "1-1" | "1-2" | "2-1" | "1-1-1" | "1-1-1-1";
  gap?: "sm" | "md" | "lg";
}

export interface CalloutBlockData {
  title?: string;
  text: string;
  tone: "info" | "warning" | "success" | "critical";
}

export interface QuoteBlockData {
  quote: string;
  author?: string;
  citation?: string;
}

export interface ButtonBlockData {
  label: string;
  url: string;
  variant: "primary" | "secondary" | "outline" | "ghost";
  target?: "_self" | "_blank";
}

export interface DividerBlockData {
  style: "solid" | "dashed" | "dotted";
  spacing: "sm" | "md" | "lg";
}

export interface ModuleEmbedBlockData {
  moduleId: string;
  schemaVersion: string;
  parameters: Record<string, string | number | boolean | null>;
  fallbackText?: string;
}

export interface CustomSlotBlockData {
  slotName: string;
  columns?: number;
}

/**
 * Field configuration types for component inspector & dynamic/external data
 */
export type FieldConfig =
  | { type: "text"; label: string; placeholder?: string; dynamicSource?: string }
  | { type: "textarea"; label: string; placeholder?: string }
  | { type: "rich_text"; label: string; placeholder?: string }
  | { type: "select"; label: string; options: { label: string; value: string | number }[]; dynamicSource?: string }
  | { type: "number"; label: string; min?: number; max?: number }
  | { type: "radio"; label: string; options: { label: string; value: string }[] }
  | { type: "custom"; label: string; renderCustom: (props: { value: unknown; onChange: (v: unknown) => void }) => React.ReactNode };

export interface ComponentPermissionConfig {
  canInsert?: string; // Permission key (e.g. content.edit)
  canEdit?: string;
  canDelete?: string;
  canMove?: string;
}

/**
 * Synthesis Component Registry Contract
 */
export interface ComponentRegistryEntry<T = Record<string, unknown>> {
  featureKey: string;
  type: ContentBlockType;
  schemaVersion: string;
  label: string;
  czechLabel: string;
  description: string;
  czechDescription: string;
  category: "text" | "structural" | "media" | "interactive" | "modules" | "labs";
  maturity: ComponentMaturity;
  requiredEntitlement: RequiredEntitlement;
  permissions?: ComponentPermissionConfig;
  icon: React.ComponentType<{ className?: string }>;
  fields: Record<string, FieldConfig>;
  supportsSlots?: boolean;
  createDefaultData: () => T;
  validateData: (data: unknown) => { valid: boolean; errors?: string[]; sanitized: T };
  migrateData?: (data: Record<string, unknown>, fromVersion: string) => T;
}

/**
 * Legacy alias for backwards compatibility
 */
export type BlockDefinition<T = Record<string, unknown>> = ComponentRegistryEntry<T>;
