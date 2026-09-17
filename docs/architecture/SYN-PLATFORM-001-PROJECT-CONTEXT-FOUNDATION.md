# SYN-PLATFORM-001: Project Context Foundation

## Overview
Replaced the loosely coupled raw `projectId` strings with a canonical `Project` model in Prisma, establishing referential integrity across the system. Project context propagation was centralized using HTTP cookies (`syn_project_id`), removing the need for manual `?projectId` URL parameter propagation.

## Data Model Changes
- Added `Project` model (`id`, `key`, `name`, `status`, `createdAt`, `updatedAt`).
- Converted `projectId` fields in `UserRole`, `UserPermissionOverride`, `MediaAsset`, `Brand`, `Page`, and `ContentRelease` to foreign keys referencing `Project.id`.
- Handled data migration via SQL migration script that safely inserts stub `Project` records for any pre-existing `projectId` strings before enabling foreign key constraints.

## UI & State
- **ProjectSelector**: A mobile-first UI component integrated into `AdminShell` (just below the brand header) for selecting the active project.
- **Context Storage**: Selected project ID is stored in a cookie `syn_project_id`.
- Client components fetch the active project via the `useActiveProject` hook.
- Server components and API routes extract the project via `getActiveProjectId()` (using `next/headers` cookies).

## Security
- Added new RBAC permissions: `projects.view` and `projects.manage`.
- `GET /api/admin/projects` only returns projects the user explicitly has access to, unless they possess the global `projects.view` permission (e.g. `SUPER_ADMIN`), in which case it returns all projects.
