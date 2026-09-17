# SYN-NAV-001: Navigation Manager Foundation

## Overview
Replaced the mock in-memory navigation repository (`POUZE UI` capability) with a fully integrated, project-scoped Navigation Foundation backed by PostgreSQL and centralized Prisma models.

## Data Model Changes
- Added `NavigationSet` model to represent context-based navigation menus (e.g., HEADER, FOOTER) bound directly to a `Project` via `projectId`.
- Added `NavigationItem` model for hierarchical items, supporting `PAGE`, `EXTERNAL_LINK`, `ANCHOR`, and `GROUP` types.
- Strict isolation: `ON DELETE RESTRICT` for `pageId` references to prevent silent broken references when a page is hard-deleted.
- Hard cascade: `ON DELETE CASCADE` for item descendants to cleanly handle tree removals.

## Isolation & Validation
- **Project Boundary**: All `NavigationSet` reads and writes are strictly isolated to the active `projectId` from `syn_project_id` context.
- **Safe Destinations**: When adding or updating a `PAGE` destination in navigation, the API actively verifies the requested `pageId` belongs to the *same* `projectId`. Cross-project linking is structurally prevented.
- **Protocol Safety**: `EXTERNAL_LINK` URLs undergo server-side validation against harmful pseudo-protocols (`javascript:`, `data:`, `vbscript:`).

## Security & RBAC
- Added core navigation permissions: `navigation.view`, `navigation.create`, `navigation.edit`, `navigation.delete`, `navigation.publish`.
- Automatically injected into the `SUPER_ADMIN` system role during bootstrap.
- **Server Authority**: Access checks occur dynamically on the Next.js API route layer using `hasPermission`.

## UI & State
- Changed `navigationRepository` to a remote fetch-based API repository pointing to `/api/admin/navigation`.
- Navigation capability in the sidebar capability map updated to `ZÁKLAD`.
