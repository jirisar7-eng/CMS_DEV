import type { PermissionKey } from "@/lib/auth/rbac";
import type { MediaPermission } from "@/lib/domain/media/types";

type CanonicalMediaPermission = Extract<PermissionKey, `media.${string}`>;

type Equal<A, B> =
  [A] extends [B]
    ? ([B] extends [A] ? true : false)
    : false;

type Assert<T extends true> = T;

// Compile-time assertion: fails if MediaPermission does not exactly match canonical RBAC media permissions
export type MediaPermissionContractMatchesCanonicalRbac =
  Assert<Equal<MediaPermission, CanonicalMediaPermission>>;
