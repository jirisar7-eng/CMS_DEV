import { EditorEdition, LabsFeatureFlags, ProjectEntitlements, RequiredEntitlement, DEFAULT_LABS_FLAGS } from "./types";

/**
 * Local/Development Entitlement Provider for CMS_DEV.
 * Strict contracts and server-side evaluation with NO remote license spoofing.
 */
export function resolveProjectEntitlements(
  editionParam?: EditorEdition,
  labsFlagsParam?: Partial<LabsFeatureFlags>
): ProjectEntitlements {
  const edition: EditorEdition = editionParam || "COMMUNITY";
  const isCommercialOrPartner = edition === "COMMERCIAL" || edition === "GRANTED";

  const labs: LabsFeatureFlags = {
    ...DEFAULT_LABS_FLAGS,
    ...(labsFlagsParam || {}),
  };

  // If labs.access is disabled, all sub-labs flags fail-closed
  if (!labs["labs.access"]) {
    Object.keys(labs).forEach((k) => {
      labs[k as keyof LabsFeatureFlags] = false;
    });
  }

  return {
    edition,
    features: {
      advancedEditor: isCommercialOrPartner,
      permissions: isCommercialOrPartner,
      dynamicExternalFields: isCommercialOrPartner,
      advancedPlugins: isCommercialOrPartner,
      customSlots: true, // Slots supported in both
      puckAi: isCommercialOrPartner && labs["labs.puck_ai"],
    },
    labs,
  };
}

/**
 * Validates whether a component with a required entitlement can be placed / edited
 */
export function isEntitlementSatisfied(
  required: RequiredEntitlement,
  entitlements: ProjectEntitlements
): { allowed: boolean; reason?: string } {
  if (required === "community") {
    return { allowed: true };
  }

  if (required === "commercial") {
    if (entitlements.edition === "COMMUNITY") {
      return {
        allowed: false,
        reason: "Tato komponenta vyžaduje komerční licenci (Synthesis Commercial).",
      };
    }
    return { allowed: true };
  }

  if (required === "labs") {
    if (!entitlements.labs["labs.access"] || !entitlements.labs["labs.new_components"]) {
      return {
        allowed: false,
        reason: "Tato experimentální komponenta vyžaduje aktivní opt-in v Synthesis Labs.",
      };
    }
    return { allowed: true };
  }

  return { allowed: true };
}

/**
 * Verifies if an AI Design proposal can run in isolated Component Lab
 */
export interface ComponentLabProposal {
  componentName: string;
  schemaVersion: string;
  fields: Record<string, unknown>;
  defaultData: Record<string, unknown>;
  previewMarkup: string;
  isHumanApproved: boolean;
  passedSecurityGate: boolean;
}

export function validateComponentLabProposal(
  proposal: ComponentLabProposal,
  entitlements: ProjectEntitlements
): { approved: boolean; error?: string } {
  if (!entitlements.labs["labs.access"] || !entitlements.labs["labs.ai_design"]) {
    return {
      approved: false,
      error: "AI Design Mode vyžaduje aktivovaný modul Synthesis Labs (labs.ai_design).",
    };
  }

  if (!proposal.passedSecurityGate) {
    return {
      approved: false,
      error: "Návrh komponenty neprošel bezpečnostním filtrem (Diff Firewall / AST kontrola).",
    };
  }

  if (!proposal.isHumanApproved) {
    return {
      approved: false,
      error: "Návrh komponenty nebyl schválen operátorem (Human Approval required).",
    };
  }

  return { approved: true };
}
