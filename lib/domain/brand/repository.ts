import { prisma } from '@/lib/db';
import { BrandVersionData, SYNTHESIS_ORANGE_DEFAULT, BrandVersionSchema } from './contracts';

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
    
    if (brand.activeVersion.status !== 'PUBLISHED') {
      return SYNTHESIS_ORANGE_DEFAULT;
    }

    const candidate = {
      tokens: brand.activeVersion.tokens,
      typography: brand.activeVersion.typography,
      assets: brand.activeVersion.assets,
      themeModes: brand.activeVersion.themeModes,
    };
    
    const parsed = BrandVersionSchema.safeParse(candidate);
    
    if (!parsed.success) {
      return SYNTHESIS_ORANGE_DEFAULT;
    }

    return parsed.data;
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
