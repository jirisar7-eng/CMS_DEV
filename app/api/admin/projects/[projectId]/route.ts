import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/rbac";
import { validatePatchProjectInput, validateProjectId } from "@/lib/domain/projects/validation";
import { getProjectService } from "@/lib/domain/projects/service";
import { ProjectDomainError } from "@/lib/domain/projects/types";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { session, user } = await getSession();
    if (!user || user.status !== "ACTIVE") {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { projectId: rawProjectId } = await context.params;
    const projectId = validateProjectId(rawProjectId);

    // CRITICAL: Call only project-scoped check.
    // The canonical project-scoped check already evaluates applicable global grants and project-specific DENY precedence.
    const canManageProject = await hasPermission(user.id, "projects.manage", projectId);
    if (!canManageProject) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const validatedInput = validatePatchProjectInput(body);
    const service = getProjectService();

    if (validatedInput.type === "RENAME") {
      const updated = await service.renameProject(projectId, validatedInput.name, user.id);
      return NextResponse.json(updated, { status: 200 });
    } else if (validatedInput.type === "ARCHIVE") {
      const updated = await service.archiveProject(projectId, user.id);
      return NextResponse.json(updated, { status: 200 });
    }

    return NextResponse.json({ error: "Unsupported operation" }, { status: 400 });
  } catch (error) {
    if (error instanceof ProjectDomainError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("PATCH /api/admin/projects/[projectId] error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
