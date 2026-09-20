export type AuditScopeType = "PROJECT" | "SYSTEM" | "ALL";

export interface AuditLogQueryOptions {
  projectId?: string | null;
  scopeType?: AuditScopeType;
  action?: string;
  resourceType?: string;
  from?: Date | string;
  to?: Date | string;
  page?: number;
  limit?: number;
  search?: string;
}

export interface SafeAuditActor {
  id: string;
  email?: string | null;
  name?: string | null;
}

export interface SafeAuditRecord {
  id: string;
  action: string;
  scopeType: string;
  scopeId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  createdAt: string;
  actorId: string | null;
  actor: SafeAuditActor | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditLogsQueryResult {
  items: SafeAuditRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

export class AuditServiceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number = 500) {
    super(message);
    this.name = "AuditServiceError";
    this.code = code;
    this.status = status;
  }
}
