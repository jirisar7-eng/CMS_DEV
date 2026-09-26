export type UserStatus = "ACTIVE" | "DISABLED";

export interface SafeUserRecord {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
  globalRoles: string[];
  hasMfa: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  displayName?: string | null;
}

export interface PatchUserInput {
  email?: string;
  displayName?: string | null;
  status?: UserStatus;
}

export interface ListUsersOptions {
  page?: number;
  limit?: number;
  query?: string;
  status?: UserStatus;
}

export interface ListUsersResult {
  items: SafeUserRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

export type UserErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "EMAIL_EXISTS"
  | "INVALID_USER_STATE"
  | "CANNOT_DEACTIVATE_SELF"
  | "CANNOT_DEACTIVATE_LAST_ADMIN"
  | "DATABASE_ERROR";
