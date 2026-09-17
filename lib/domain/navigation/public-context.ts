import { prisma as defaultPrisma } from '@/lib/db';
import { normalizeAdminProjectId } from '@/lib/domain/pages-client/project-context';
import { cookies } from 'next/headers';

export interface PublicProjectResolverDb {
  project: {
    findFirst: (args: any) => Promise<{ id: string } | null>;
  };
}

/**
 * Extracts raw project identifier from query params, headers, or cookies.
 * Does NOT perform any database lookups.
 */
export async function extractPublicProjectIdentifier(req?: Request): Promise<string | null> {
  let rawProject: string | null = null;

  if (req) {
    try {
      const url = new URL(req.url);
      rawProject = normalizeAdminProjectId(
        url.searchParams.get('projectId') ||
        url.searchParams.get('project') ||
        url.searchParams.get('siteId')
      );
      if (!rawProject) {
        rawProject = normalizeAdminProjectId(req.headers.get('x-project-id'));
      }
    } catch {
      // safe fallback for malformed URLs
    }
  }

  if (!rawProject) {
    try {
      const cookieStore = await cookies();
      rawProject = normalizeAdminProjectId(cookieStore.get('syn_project_id')?.value);
    } catch {
      // outside Next.js request/cookie context
    }
  }

  return rawProject;
}

/**
 * Resolves a safe public project context without requiring admin session/RBAC.
 * Public navigation requires an explicit, validated public project/site context.
 * If no valid explicit context exists or project is not ACTIVE, fails closed (returns null).
 * NEVER falls back to any default project.
 */
export async function resolvePublicProjectContext(
  req?: Request,
  db: PublicProjectResolverDb = defaultPrisma
): Promise<string | null> {
  const requestedProject = await extractPublicProjectIdentifier(req);

  // FAIL CLOSED: missing project context must NOT select any project automatically
  if (!requestedProject) {
    return null;
  }

  const project = await db.project.findFirst({
    where: {
      OR: [
        { id: requestedProject },
        { key: requestedProject }
      ],
      status: 'ACTIVE'
    },
    select: { id: true }
  });

  return project?.id || null;
}
