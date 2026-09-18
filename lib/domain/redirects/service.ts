import { prisma } from '@/lib/db';
import { RedirectType } from '@prisma/client';

export interface RedirectResolution {
  targetPath: string | null;
  type: RedirectType | null;
}

export class RedirectService {
  private static readonly RESERVED_ROUTES = ['/admin', '/api', '/_next'];
  private static readonly MAX_HOPS = 5;

  private static isExternal(path: string): boolean {
    return path.startsWith('http://') || path.startsWith('https://');
  }

  private static normalizePath(path: string): string {
    if (this.isExternal(path)) return path;
    if (!path.startsWith('/')) path = '/' + path;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return path;
  }

  private static isReserved(path: string): boolean {
    if (this.isExternal(path)) return false;
    const normalized = this.normalizePath(path);
    return this.RESERVED_ROUTES.some(r => normalized.startsWith(r));
  }

  static async validateRedirect(sourcePath: string, targetPath: string): Promise<void> {
    if (this.isExternal(sourcePath) || this.isExternal(targetPath)) {
      throw new Error('EXTERNAL_TARGET_NOT_ALLOWED');
    }

    const src = this.normalizePath(sourcePath);
    const tgt = this.normalizePath(targetPath);

    if (this.isReserved(src) || this.isReserved(tgt)) {
      throw new Error('RESERVED_ROUTE');
    }
    
    if (src === tgt) {
      throw new Error('SELF_REDIRECT');
    }
  }

  static async createRedirect(projectId: string, sourcePath: string, targetPath: string, type: RedirectType, priority: number = 0, createdById?: string) {
    await this.validateRedirect(sourcePath, targetPath);
    
    return prisma.redirectRule.create({
      data: {
        projectId,
        sourcePath: this.normalizePath(sourcePath),
        targetPath: this.normalizePath(targetPath),
        type,
        priority,
        createdById
      }
    });
  }

  static async resolveRedirect(projectId: string, path: string): Promise<RedirectResolution> {
    let currentPath = this.normalizePath(path);
    let hops = 0;
    let finalType: RedirectType | null = null;
    const visited = new Set<string>();

    while (hops < this.MAX_HOPS) {
      if (visited.has(currentPath)) {
        // Cycle detected
        return { targetPath: null, type: null };
      }
      visited.add(currentPath);

      const rule = await prisma.redirectRule.findFirst({
        where: {
          projectId,
          sourcePath: currentPath,
          active: true
        },
        orderBy: { priority: 'desc' }
      });

      if (!rule) break;

      currentPath = rule.targetPath;
      finalType = rule.type;
      hops++;
    }

    if (hops === this.MAX_HOPS) {
      // Exceeded max hops, return null to avoid infinite loops
      return { targetPath: null, type: null };
    }

    return hops > 0 ? { targetPath: currentPath, type: finalType } : { targetPath: null, type: null };
  }
}
