# SYN-SEC-001: Identity, Authentication & Access Foundation

## Architecture Overview
This document outlines the foundation for Identity, Session management, and Role-Based Access Control (RBAC) in the Synthesis CMS environment. 

## Auth Implementation
- **Strategy**: Database sessions using explicit server-side cookies.
- **Hashing**: `bcryptjs` for secure password hashing.
- **Why**: Mature, framework-independent, directly meets the requirement for secure session revocation, fail-closed disabling of accounts without relying on heavy abstractions like Auth.js which forces JWTs for credentials auth.

## Models
1. **User**: Represents physical users. Tracks status (`ACTIVE`, `SUSPENDED`, `DISABLED`).
2. **Session**: Tracks active browser sessions with expiration. Direct row deletion allows immediate revocation.
3. **Role**: Represents named bundles of permissions.
4. **Permission**: Hardcoded capabilities (`brand.edit`, `media.view`).
5. **RolePermission / UserRole**: Map roles to permissions and roles to users.
6. **UserPermissionOverride**: Explicitly allow or deny specific permissions at the user level.
7. **AuditLog**: Comprehensive tracking of administrative actions (login, logout, project actions).

## Scopes
The RBAC design accounts for global (`SYSTEM`) operations versus isolated (`PROJECT`) operations by making `projectId` an optional column in `UserRole` and `UserPermissionOverride`.

## Core API
- `createSession(userId)`
- `getSession()`
- `invalidateSession(sessionId)`
- `requireAuthenticatedUser()`
- `requirePermission(permissionKey, projectId?)`
- `hasPermission(userId, permissionKey, projectId?)`

## Next Steps
Brand Studio (`SYN-BRAND-002`) will use `requirePermission('brand.edit')` and server actions will be protected from unauthorized actors using `requireAuthenticatedUser()`.
