# SYN-PLATFORM-001: Project Context Foundation

## Overview
Replaced the loosely coupled raw `projectId` strings with a canonical `Project` model in Prisma, establishing referential integrity across the system. Project context propagation is now centralized using HTTP cookies (`syn_project_id`), removing the need for manual `?projectId` URL parameter propagation. Server-side validation has been hardened.

## Data Model Changes
- Added `Project` model (`id`, `key`, `name`, `status`, `createdAt`, `updatedAt`).
- Converted `projectId` fields in `UserRole`, `UserPermissionOverride`, `MediaAsset`, `Brand`, `Page`, and `ContentRelease` to foreign keys referencing `Project.id`.
- **Delete Semantics (Hardened)**: `UserRole` and `UserPermissionOverride` use `ON DELETE RESTRICT` to ensure authorization scopes are not inadvertently cascaded away.
- **Migration**: Implemented a preflight DO block in the migration script that `RAISE EXCEPTION` if orphaned `projectId` records exist, blocking the migration safely instead of fabricating stub projects.

## UI & State
- **ProjectSelector**: A mobile-first UI component integrated into `AdminShell` (just below the brand header) for selecting the active project.
- **Context Storage**: Selected project ID is stored in a cookie `syn_project_id`. 
- **Admin Dashboard UI**: `/admin/projects/page.tsx` was rewritten to a Server Component strictly listing DB projects governed by RBAC, completely removing static UI stub data.

## Security & RBAC
- Added new RBAC permissions: `projects.view` and `projects.manage`.
- **Server Authority**: The `syn_project_id` cookie is purely a selection hint. The `getActiveProjectContext()` explicitly re-evaluates the DB and RBAC. 
- `GET /api/admin/projects` lists projects using a canonical iteration over `hasPermission(userId, 'admin.access', projectId) || hasPermission(userId, 'projects.view', projectId)`, failing closed safely without parallel algorithms.
