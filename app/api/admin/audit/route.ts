import "server-only";
import { NextRequest } from "next/server";
import {
  handleApiError,
  jsonSuccess,
  requireAuthenticatedUser,
} from "@/lib/domain/pages-api";
import { getAuditService, AuditScopeType } from "@/lib/domain/audit";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") || undefined;
    const scopeType = (searchParams.get("scopeType") as AuditScopeType) || (projectId ? "PROJECT" : "SYSTEM");
    const action = searchParams.get("action") || undefined;
    const resourceType = searchParams.get("resourceType") || undefined;
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;
    const page = searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : 1;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 20;

    const service = getAuditService();
    const result = await service.listAuditLogs(
      {
        projectId,
        scopeType,
        action,
        resourceType,
        from,
        to,
        page,
        limit,
      },
      user.id
    );

    return jsonSuccess(result, 200);
  } catch (err: unknown) {
    return handleApiError(err);
  }
}
