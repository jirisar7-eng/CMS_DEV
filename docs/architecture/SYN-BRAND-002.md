# SYN-BRAND-002: Brand Studio

## Architecture Overview
Brand Studio provides a persistent, editable brand management system with draft, publish, and rollback workflows. It enforces isolation between SYSTEM and PROJECT scopes.

## Data Model
- **Brand**: The root entity representing a brand (either SYSTEM or scoped to a PROJECT).
- **BrandVersion**: Immutable snapshots of brand configuration (tokens, typography, assets). Supports `DRAFT` and `PUBLISHED` states.

## Security & RBAC
- Built on `SYN-SEC-001` auth foundation.
- Uses `brand.view`, `brand.edit`, `brand.publish`, `brand.rollback` permissions.
- Server actions enforce permissions and check project scope.
- Audit logs track all lifecycle events (`BRAND_DRAFT_CREATED`, `BRAND_PUBLISHED`, `BRAND_ROLLED_BACK`, etc.).

## Accessibility
- Contrast ratio calculation implemented (`validateThemeAccessibility`).
- Fails closed on publish if WCAG AA standards are not met for critical foreground/background pairs.

## Assets
- Media upload deferred pending secure authorized media write API. Asset fields currently accept valid string references or null.
