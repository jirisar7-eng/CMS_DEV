'use server';

import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/auth/audit';
import { getSession } from '@/lib/auth/session';
import { BrandVersionSchema, BrandVersionData, SYNTHESIS_ORANGE_DEFAULT, getDerivedPermissionScope, validateScopeInvariant } from '@/lib/domain/brand/contracts';
import { validateAllThemesAccessibility } from '@/lib/domain/brand/accessibility';
import { validateBrandForPublication } from '@/lib/domain/brand/validator';
import { revalidatePath } from 'next/cache';

export async function getOrCreateBrand(scope: string, projectId?: string | null) {
  validateScopeInvariant(scope, projectId);
  const permissionScope = getDerivedPermissionScope(scope, projectId);
  await requirePermission('brand.view', permissionScope);

  let brand = await prisma.brand.findFirst({
    where: { scope, projectId: projectId ?? null },
    include: {
      activeVersion: true,
      versions: { orderBy: { version: 'desc' } }
    }
  });

  if (!brand) {
    await requirePermission('brand.edit', permissionScope);
    const key = scope === 'SYSTEM' ? 'system-brand' : `project-${projectId}-brand`;
    brand = await prisma.brand.create({
      data: {
        scope,
        projectId: projectId ?? null,
        name: scope === 'SYSTEM' ? 'Synthesis System Brand' : 'Project Brand',
        key,
      },
      include: {
        activeVersion: true,
        versions: { orderBy: { version: 'desc' } }
      }
    });
  }
  return brand;
}

export async function createBrandDraft(brandId: string) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
  });
  if (!brand) throw new Error("Brand not found");

  const permissionScope = getDerivedPermissionScope(brand.scope, brand.projectId);
  await requirePermission('brand.edit', permissionScope);
  
  const { user } = await getSession();
  const latestVersion = brand.versions[0];
  const newVersionNumber = latestVersion ? latestVersion.version + 1 : 1;

  let baseData = SYNTHESIS_ORANGE_DEFAULT;
  if (latestVersion) {
    baseData = {
      tokens: latestVersion.tokens as any,
      typography: latestVersion.typography as any,
      assets: latestVersion.assets as any,
      themeModes: latestVersion.themeModes as any,
    };
  }

  const draft = await prisma.brandVersion.create({
    data: {
      brandId,
      version: newVersionNumber,
      status: 'DRAFT',
      tokens: baseData.tokens as any,
      typography: baseData.typography as any,
      assets: baseData.assets as any,
      themeModes: baseData.themeModes as any,
      createdById: user?.id,
      derivedFromVersionId: latestVersion?.id || null,
    }
  });

  await logAudit({
    action: 'BRAND_DRAFT_CREATED',
    scopeType: brand.scope as 'SYSTEM' | 'PROJECT',
    scopeId: brand.projectId,
    resourceType: 'BRAND',
    resourceId: brandId,
    metadata: { version: newVersionNumber }
  });

  revalidatePath('/admin/brands');
  return draft;
}

export async function updateBrandDraft(draftId: string, data: Partial<BrandVersionData>) {
  const draft = await prisma.brandVersion.findUnique({ where: { id: draftId }, include: { brand: true } });
  if (!draft || draft.status !== 'DRAFT') throw new Error("Draft not found or not in DRAFT status");

  const permissionScope = getDerivedPermissionScope(draft.brand.scope, draft.brand.projectId);
  await requirePermission('brand.edit', permissionScope);

  const updated = await prisma.brandVersion.update({
    where: { id: draftId },
    data: {
      tokens: data.tokens ? (data.tokens as any) : undefined,
      typography: data.typography ? (data.typography as any) : undefined,
      assets: data.assets ? (data.assets as any) : undefined,
      themeModes: data.themeModes ? (data.themeModes as any) : undefined,
    }
  });

  await logAudit({
    action: 'BRAND_DRAFT_UPDATED',
    scopeType: draft.brand.scope as 'SYSTEM' | 'PROJECT',
    scopeId: draft.brand.projectId,
    resourceType: 'BRAND',
    resourceId: draft.brand.id,
    metadata: { version: draft.version }
  });

  revalidatePath('/admin/brands');
  return updated;
}

export async function publishBrandDraft(draftId: string) {
  const draft = await prisma.brandVersion.findUnique({ where: { id: draftId }, include: { brand: true } });
  if (!draft || draft.status !== 'DRAFT') throw new Error("Draft not found or not in DRAFT status");

  const permissionScope = getDerivedPermissionScope(draft.brand.scope, draft.brand.projectId);
  await requirePermission('brand.publish', permissionScope);

  const data: BrandVersionData = {
    tokens: draft.tokens as any,
    typography: draft.typography as any,
    assets: draft.assets as any,
    themeModes: draft.themeModes as any,
  };

  const validationResult = validateBrandForPublication(data);
  if (!validationResult.success) {
    if (validationResult.accessibilityFailures) {
      throw new Error("ACCESSIBILITY_FAILED");
    }
    throw new Error("Invalid brand data structure");
  }

  await logAudit({
    action: 'BRAND_VALIDATED',
    scopeType: draft.brand.scope as 'SYSTEM' | 'PROJECT',
    scopeId: draft.brand.projectId,
    resourceType: 'BRAND',
    resourceId: draft.brand.id,
    metadata: { version: draft.version }
  });

  await prisma.$transaction(async (tx) => {
    await tx.brandVersion.update({
      where: { id: draftId },
      data: { status: 'PUBLISHED', publishedAt: new Date() }
    });

    await tx.brand.update({
      where: { id: draft.brandId },
      data: { activeVersionId: draftId }
    });
  });

  await logAudit({
    action: 'BRAND_PUBLISHED',
    scopeType: draft.brand.scope as 'SYSTEM' | 'PROJECT',
    scopeId: draft.brand.projectId,
    resourceType: 'BRAND',
    resourceId: draft.brand.id,
    metadata: { version: draft.version }
  });

  revalidatePath('/admin/brands');
}

export async function rollbackBrand(brandId: string, targetVersionId: string) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
  });
  if (!brand) throw new Error("Brand not found");

  const permissionScope = getDerivedPermissionScope(brand.scope, brand.projectId);
  await requirePermission('brand.rollback', permissionScope);

  const targetVersion = await prisma.brandVersion.findUnique({ where: { id: targetVersionId } });
  if (!targetVersion || targetVersion.brandId !== brandId || targetVersion.status !== 'PUBLISHED') {
    throw new Error("Invalid target version for rollback");
  }

  const { user } = await getSession();
  const latestVersion = brand.versions[0];
  const newVersionNumber = latestVersion ? latestVersion.version + 1 : 1;
  
  const data: BrandVersionData = {
    tokens: targetVersion.tokens as any,
    typography: targetVersion.typography as any,
    assets: targetVersion.assets as any,
    themeModes: targetVersion.themeModes as any,
  };

  const validationResult = validateBrandForPublication(data);
  if (!validationResult.success) {
    if (validationResult.accessibilityFailures) {
      throw new Error("ACCESSIBILITY_FAILED: Target version fails current accessibility checks.");
    }
    throw new Error("Invalid target version data structure");
  }

  await prisma.$transaction(async (tx) => {
    const rollbackVersion = await tx.brandVersion.create({
      data: {
        brandId,
        version: newVersionNumber,
        status: 'PUBLISHED',
        tokens: targetVersion.tokens as any,
        typography: targetVersion.typography as any,
        assets: targetVersion.assets as any,
        themeModes: targetVersion.themeModes as any,
        createdById: user?.id,
        publishedAt: new Date(),
        derivedFromVersionId: targetVersion.id,
      }
    });

    await tx.brand.update({
      where: { id: brandId },
      data: { activeVersionId: rollbackVersion.id }
    });
  });

  await logAudit({
    action: 'BRAND_ROLLED_BACK',
    scopeType: brand.scope as 'SYSTEM' | 'PROJECT',
    scopeId: brand.projectId,
    resourceType: 'BRAND',
    resourceId: brand.id,
    metadata: { 
      newVersion: newVersionNumber, 
      rolledBackFromVersionId: targetVersionId 
    }
  });

  revalidatePath('/admin/brands');
}

export async function discardBrandDraft(draftId: string) {
  const draft = await prisma.brandVersion.findUnique({ where: { id: draftId }, include: { brand: true } });
  if (!draft || draft.status !== 'DRAFT') throw new Error("Only drafts can be discarded");

  const permissionScope = getDerivedPermissionScope(draft.brand.scope, draft.brand.projectId);
  await requirePermission('brand.edit', permissionScope);

  await prisma.brandVersion.delete({ where: { id: draftId } });

  await logAudit({
    action: 'BRAND_DRAFT_DISCARDED',
    scopeType: draft.brand.scope as 'SYSTEM' | 'PROJECT',
    scopeId: draft.brand.projectId,
    resourceType: 'BRAND',
    resourceId: draft.brand.id,
    metadata: { version: draft.version }
  });

  revalidatePath('/admin/brands');
}
