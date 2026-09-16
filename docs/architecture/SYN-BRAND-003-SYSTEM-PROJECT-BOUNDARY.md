# SYSTEM vs PROJECT Brand Boundary

This document outlines the architectural boundaries between the built-in Synthesis SYSTEM identity and user-authored PROJECT identities.

## Terminology

**SYSTEM BRAND**
The built-in Synthesis CMS identity.

**PROJECT BRAND**
Future, project-specific identity configurations.

**Examples:**
- **SYSTEM:** Synthesis CMS
- **PROJECT:** Táta má právo (or another future Synthesis project)

## Boundary Rules

1. **Mutation:** A PROJECT must not mutate the SYSTEM brand.
2. **Inheritance:** The SYSTEM does not inherit PROJECT identity.
3. **Scope Invariants:**
   - `projectId` is **forbidden** for SYSTEM scope.
   - `projectId` is **required** for PROJECT scope.
4. **Resolution:** The Theme/Brand runtime resolves the scope explicitly based on context.
5. **Admin Identity:** Project branding must not replace the Synthesis admin/system identity unless an explicit App Profile contract later allows a branded project surface (FUTURE/DEFERRED).
6. **Fallback:** The built-in Synthesis SVG asset pack serves as the SYSTEM fallback.
7. **Media Assets:**
   - No fake MediaAsset IDs may be used.
   - Future authorized Media assets may replace fallback imagery via the explicit Brand lifecycle (FUTURE/DEFERRED).
8. **Isolation:** SYSTEM and PROJECT histories remain strictly isolated. Rollback operates exclusively inside the same scope.
9. **Authorization:** RBAC must authorize the resource scope. Cross-project access remains strictly forbidden.
