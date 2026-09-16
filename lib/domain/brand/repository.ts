import { prisma } from '@/lib/db';
import { BrandVersionData, SYNTHESIS_ORANGE_DEFAULT } from './contracts';
import { validateThemeAccessibility, ContrastFailure } from './accessibility';
import { logAudit } from '@/lib/auth/audit';

export class BrandRepository {
  /**
   * Retrieves the current published version data for a given brand scope/project.
   * If not found, falls back to SYNTHESIS_ORANGE_DEFAULT.
   */
  static async getActiveBrandData(scope: string, projectId?: string | null): Promise<BrandVersionData> {
    const brand = await prisma.brand.findFirst({
      where: {
        scope,
        projectId: projectId ?? null,
      },
      include: {
        activeVersion: true,
      },
    });

    if (!brand || !brand.activeVersion) {
      return SYNTHESIS_ORANGE_DEFAULT;
    }

    return {
      tokens: brand.activeVersion.tokens as any,
      typography: brand.activeVersion.typography as any,
      assets: brand.activeVersion.assets as any,
      themeModes: brand.activeVersion.themeModes as any,
    };
  }

  /**
   * Gets a specific brand by ID.
   */
  static async getBrandById(id: string) {
    return prisma.brand.findUnique({
      where: { id },
      include: {
        activeVersion: true,
        versions: {
          orderBy: { version: 'desc' }
        }
      }
    });
  }
}
