import { ContentBlock, ContentBlockType, PageContent } from "@/lib/domain/pages";
import { validatePageContent } from "@/lib/domain/content/validation";
import { COMPONENT_REGISTRY, getBlockDefinition } from "./registry";
import { ProjectEntitlements } from "./types";
import { isEntitlementSatisfied } from "./entitlements";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

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
 * ProjectEntitlements is REQUIRED. No caller may silently omit entitlement enforcement.
 */
export function puckDataToCanonical(
  puckData: PuckData,
  schemaVersion: string = "syn-content-v1",
  entitlements: ProjectEntitlements
): PageContent {
  if (!entitlements) {
    throw new ApiError("INVALID_INPUT", "Oprávnění projektu jsou vyžadována pro konverzi obsahu editoru", 400);
  }

  const items = Array.isArray(puckData?.content) ? puckData.content : [];

  const mapItem = (item: PuckBlockItem, order: number): ContentBlock => {
    if (!item || typeof item !== "object" || typeof item.type !== "string") {
      throw new ApiError("INVALID_INPUT", "Neplatná položka v editoru", 400);
    }

    const blockType = item.type as ContentBlockType;

    // 1. Reject unknown component types
    if (!(blockType in COMPONENT_REGISTRY)) {
      throw new ApiError("INVALID_INPUT", `Neznámý nebo nepodporovaný typ komponenty: ${item.type}`, 400);
    }

    const def = COMPONENT_REGISTRY[blockType];

    // 2. Enforce requiredEntitlement using the required server-provided entitlement object
    const entCheck = isEntitlementSatisfied(def.requiredEntitlement, entitlements);
    if (!entCheck.allowed) {
      throw new ApiError(
        "INVALID_INPUT",
        entCheck.reason || `Komponenta '${blockType}' vyžaduje vyšší oprávnění.`,
        400
      );
    }

    // Filter properties to eliminate Puck internals
    const { id: rawId, ...restProps } = item.props || {};
    if (typeof rawId !== "string" || rawId.trim().length === 0) {
      throw new ApiError("INVALID_INPUT", "Chybí platné ID bloku v editoru", 400);
    }
    const id = rawId.trim();

    // 3. Reject validateData(valid=false)
    const validation = def.validateData(restProps);
    if (!validation.valid) {
      throw new ApiError(
        "INVALID_INPUT",
        `Neplatná data pro komponentu '${blockType}': ${validation.errors?.join(", ") || "chyba validace"}`,
        400
      );
    }

    const hasChildren = item.zones && Array.isArray(item.zones.default) && item.zones.default.length > 0;

    // 4. Reject nested children on components without supportsSlots
    if (hasChildren && !def.supportsSlots) {
      throw new ApiError(
        "INVALID_INPUT",
        `Komponenta '${blockType}' nepodporuje vnořené bloky (slots).`,
        400
      );
    }

    const block: ContentBlock = {
      id,
      type: blockType,
      order,
      data: validation.sanitized,
    };

    if (hasChildren && def.supportsSlots) {
      block.children = item.zones!.default.map((child, idx) => mapItem(child, idx));
    }

    return block;
  };

  const canonical: PageContent = {
    version: 1,
    schemaVersion,
    blocks: items.map((it, idx) => mapItem(it, idx)),
  };

  try {
    return validatePageContent(canonical);
  } catch (err: unknown) {
    throw new ApiError(
      "INVALID_INPUT",
      err instanceof Error ? err.message : "Chyba validace vytvořeného obsahu z editoru",
      400
    );
  }
}

/**
 * Recursively validates and sanitizes a canonical PageContent object against
 * Component Registry definitions and ProjectEntitlements.
 */
export function validateCanonicalContent(
  pageContent: unknown,
  entitlements: ProjectEntitlements
): PageContent {
  if (!entitlements) {
    throw new ApiError("INVALID_INPUT", "Oprávnění projektu jsou vyžadována pro validaci obsahu", 400);
  }

  // 1. First run existing validatePageContent from lib/domain/content/validation
  let validated: PageContent;
  try {
    validated = validatePageContent(pageContent);
  } catch (err: unknown) {
    throw new ApiError(
      "INVALID_INPUT",
      err instanceof Error ? err.message : "Chyba validace obsahu stránky",
      400
    );
  }

  // 2. Recursively apply registry sanitization + entitlement checks
  const validateBlock = (b: ContentBlock, order: number): ContentBlock => {
    if (typeof b.id !== "string" || b.id.trim().length === 0) {
      throw new ApiError("INVALID_INPUT", "Chybí platné ID bloku v obsahu stránky", 400);
    }

    const blockType = b.type as ContentBlockType;

    // Reject unknown component types
    if (!(blockType in COMPONENT_REGISTRY)) {
      throw new ApiError("INVALID_INPUT", `Neznámý nebo nepodporovaný typ komponenty: ${b.type}`, 400);
    }

    const def = COMPONENT_REGISTRY[blockType];

    // Enforce requiredEntitlement
    const entCheck = isEntitlementSatisfied(def.requiredEntitlement, entitlements);
    if (!entCheck.allowed) {
      throw new ApiError(
        "INVALID_INPUT",
        entCheck.reason || `Komponenta '${b.type}' vyžaduje vyšší oprávnění.`,
        400
      );
    }

    // Reject validateData(valid=false)
    const validation = def.validateData(b.data || {});
    if (!validation.valid) {
      throw new ApiError(
        "INVALID_INPUT",
        `Neplatná data pro komponentu '${b.type}': ${validation.errors?.join(", ") || "chyba validace"}`,
        400
      );
    }

    // Reject nested children on components without supportsSlots
    const hasChildren = Array.isArray(b.children) && b.children.length > 0;
    if (hasChildren && !def.supportsSlots) {
      throw new ApiError(
        "INVALID_INPUT",
        `Komponenta '${b.type}' nepodporuje vnořené bloky (slots).`,
        400
      );
    }

    const validatedBlock: ContentBlock = {
      id: b.id,
      type: blockType,
      order,
      data: validation.sanitized,
    };

    if (hasChildren && def.supportsSlots) {
      validatedBlock.children = b.children!.map((child, idx) => validateBlock(child, idx));
    }

    return validatedBlock;
  };

  const sanitizedContent: PageContent = {
    version: validated.version,
    schemaVersion: validated.schemaVersion,
    blocks: validated.blocks.map((block, idx) => validateBlock(block, idx)),
  };

  // 3. Run validatePageContent again before returning
  try {
    return validatePageContent(sanitizedContent);
  } catch (err: unknown) {
    throw new ApiError(
      "INVALID_INPUT",
      err instanceof Error ? err.message : "Chyba sekundární validace obsahu stránky",
      400
    );
  }
}
