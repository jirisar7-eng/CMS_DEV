import { ContentBlock, ContentBlockType, PageContent } from "@/lib/domain/pages";
import { COMPONENT_REGISTRY, getBlockDefinition } from "./registry";
import { ProjectEntitlements } from "./types";
import { isEntitlementSatisfied } from "./entitlements";

/**
 * Puck Data format representation
 */
export interface PuckBlockItem {
  type: string;
  props: {
    id: string;
    [key: string]: unknown;
  };
  zones?: Record<string, PuckBlockItem[]>;
}

export interface PuckData {
  content: PuckBlockItem[];
  root: {
    props?: Record<string, unknown>;
  };
  zones?: Record<string, PuckBlockItem[]>;
}

/**
 * Transforms Canonical PageContent into Puck adapter format.
 * Guarantees read-only stability even if downgrade occurred.
 */
export function canonicalToPuckData(pageContent: PageContent): PuckData {
  const blocks = Array.isArray(pageContent?.blocks) ? pageContent.blocks : [];

  const mapBlock = (b: ContentBlock): PuckBlockItem => {
    const data = b.data || {};
    const item: PuckBlockItem = {
      type: b.type,
      props: {
        id: b.id,
        ...data,
      },
    };

    if (Array.isArray(b.children) && b.children.length > 0) {
      item.zones = {
        default: b.children.map(mapBlock),
      };
    }

    return item;
  };

  return {
    content: blocks.map(mapBlock),
    root: {
      props: {
        title: "",
      },
    },
  };
}

/**
 * Transforms Puck editor data back into Canonical PageContent.
 * Validates against Component Registry schemas and strips unapproved JS/HTML.
 */
export function puckDataToCanonical(
  puckData: PuckData,
  schemaVersion: string = "syn-content-v1",
  entitlements?: ProjectEntitlements
): PageContent {
  const items = Array.isArray(puckData?.content) ? puckData.content : [];

  const mapItem = (item: PuckBlockItem, order: number): ContentBlock => {
    const blockType = item.type as ContentBlockType;
    const def = getBlockDefinition(blockType);

    // Filter properties to eliminate Puck internals
    const { id: rawId, ...restProps } = item.props || {};
    const id = typeof rawId === "string" && rawId.length > 0 ? rawId : `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Validate and sanitize using canonical definition
    const { sanitized } = def.validateData(restProps);

    const block: ContentBlock = {
      id,
      type: blockType,
      order,
      data: sanitized,
    };

    if (item.zones && Array.isArray(item.zones.default) && item.zones.default.length > 0) {
      block.children = item.zones.default.map((child, idx) => mapItem(child, idx));
    }

    return block;
  };

  return {
    version: 1,
    schemaVersion,
    blocks: items.map((it, idx) => mapItem(it, idx)),
  };
}
