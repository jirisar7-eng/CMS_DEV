import 'server-only';
import { prisma } from '@/lib/db';
import { ProjectEntitlements } from './types';
import { resolveProjectEntitlements } from './entitlements';

/**
 * Server-only entitlement resolver for Synthesis CMS Page Editor.
 * Verifies the referenced project exists and is ACTIVE in DB.
 * Fails closed to COMMUNITY edition and all Labs flags disabled.
 */
export async function resolveProjectEntitlementsServer(
  projectId: string | null | undefined
): Promise<ProjectEntitlements> {
  if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
    return resolveProjectEntitlements('COMMUNITY', { 'labs.access': false });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId.trim() },
      select: { id: true, status: true },
    });

    if (!project || project.status !== 'ACTIVE') {
      return resolveProjectEntitlements('COMMUNITY', { 'labs.access': false });
    }

    // Fail closed to COMMUNITY edition and all Labs flags = false
    return resolveProjectEntitlements('COMMUNITY', { 'labs.access': false });
  } catch (error) {
    return resolveProjectEntitlements('COMMUNITY', { 'labs.access': false });
  }
}
