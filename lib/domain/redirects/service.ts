import { prisma } from '@/lib/db';
import { RedirectType } from '@prisma/client';
import path from 'path';

export interface RedirectResolution {
  targetPath: string | null;
  type: RedirectType | null;
}

export class RedirectService {
  private static readonly RESERVED_ROUTES = ['/admin', '/api', '/_next'];
  private static readonly MAX_HOPS = 5;

  static normalizePath(rawPath: string): string {
    if (typeof rawPath !== 'string' || !rawPath.trim()) {
      throw new Error('INVALID_PATH');
    }
    const trimmed = rawPath.trim();

    // Reject control characters (0x00 - 0x1F, 0x7F)
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
      throw new Error('INVALID_PATH');
    }

    // Reject backslashes
    if (trimmed.includes('\\')) {
      throw new Error('INVALID_PATH');
    }

    // Reject protocol-relative //host
    if (trimmed.startsWith('//')) {
      throw new Error('EXTERNAL_TARGET_NOT_ALLOWED');
    }

    // Reject any URI scheme (http:, https:, javascript:, data:, etc.)
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
      throw new Error('EXTERNAL_TARGET_NOT_ALLOWED');
    }

    // Must be internal path
    let p = trimmed;
    if (!p.startsWith('/')) {
      p = '/' + p;
    }

    // Normalize dot segments while preserving query / fragment
    const queryIndex = p.search(/[?#]/);
    const pathname = queryIndex !== -1 ? p.slice(0, queryIndex) : p;
    const suffix = queryIndex !== -1 ? p.slice(queryIndex) : '';

    let normalized = path.posix.normalize(pathname);
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized + suffix;
  }

  private static isReserved(normalizedPath: string): boolean {
    const pathOnly = normalizedPath.split(/[?#]/)[0];
    return this.RESERVED_ROUTES.some(r => pathOnly === r || pathOnly.startsWith(r + '/'));
  }

  static async validateRedirect(
    sourcePathOrProjectId: string,
    targetPathOrSourcePath: string,
    maybeTargetPath?: string
  ): Promise<{ src: string; tgt: string }> {
    let projectId = '';
    let sourcePath = '';
    let targetPath = '';

    if (maybeTargetPath !== undefined) {
      projectId = sourcePathOrProjectId;
      sourcePath = targetPathOrSourcePath;
      targetPath = maybeTargetPath;
    } else {
      sourcePath = sourcePathOrProjectId;
      targetPath = targetPathOrSourcePath;
    }

    const src = this.normalizePath(sourcePath);
    const tgt = this.normalizePath(targetPath);

    if (this.isReserved(src) || this.isReserved(tgt)) {
      throw new Error('RESERVED_ROUTE');
    }

    if (src === tgt) {
      throw new Error('SELF_REDIRECT');
    }

    if (projectId) {
      const isCycle = await this.detectCycle(projectId, src, tgt);
      if (isCycle) {
        throw new Error('CYCLE_DETECTED');
      }
    }

    return { src, tgt };
  }

  static async detectCycle(projectId: string, sourcePath: string, targetPath: string): Promise<boolean> {
    let current: string | null = targetPath;
    const visited = new Set<string>();
    visited.add(sourcePath);

    let hops = 0;
    while (current && hops < 50) {
      if (current === sourcePath || visited.has(current)) {
        return true;
      }
      visited.add(current);

      const nextRule: { targetPath: string } | null = await prisma.redirectRule.findFirst({
        where: {
          projectId,
          sourcePath: current,
          active: true
        },
        orderBy: { priority: 'desc' },
        select: { targetPath: true }
      });

      if (!nextRule) break;
      current = nextRule.targetPath;
      hops++;
    }

    return false;
  }

  static async createRedirect(
    projectId: string,
    sourcePath: string,
    targetPath: string,
    type: RedirectType,
    priority: number = 0,
    createdById?: string
  ) {
    if (type !== 'MOVED_PERMANENTLY' && type !== 'FOUND') {
      throw new Error('INVALID_REDIRECT_TYPE');
    }

    if (typeof priority !== 'number' || !Number.isInteger(priority)) {
      throw new Error('INVALID_PRIORITY');
    }

    const { src, tgt } = await this.validateRedirect(projectId, sourcePath, targetPath);

    return prisma.redirectRule.create({
      data: {
        projectId,
        sourcePath: src,
        targetPath: tgt,
        type,
        priority,
        createdById
      }
    });
  }

  static async resolveRedirect(projectId: string, path: string): Promise<RedirectResolution> {
    let currentPath = this.normalizePath(path);
    let hops = 0;
    let firstType: RedirectType | null = null;
    const visited = new Set<string>();

    while (hops < this.MAX_HOPS) {
      if (visited.has(currentPath)) {
        // Cycle detected
        return { targetPath: null, type: null };
      }
      visited.add(currentPath);

      const rule: { targetPath: string; type: RedirectType } | null = await prisma.redirectRule.findFirst({
        where: {
          projectId,
          sourcePath: currentPath,
          active: true
        },
        orderBy: { priority: 'desc' },
        select: { targetPath: true, type: true }
      });

      if (!rule) break;

      let normalizedTarget: string;
      try {
        normalizedTarget = this.normalizePath(rule.targetPath);
      } catch {
        return { targetPath: null, type: null };
      }

      if (this.isReserved(normalizedTarget)) {
        return { targetPath: null, type: null };
      }

      currentPath = normalizedTarget;
      if (firstType === null) {
        firstType = rule.type;
      }
      hops++;
    }

    if (hops >= this.MAX_HOPS) {
      const nextRule: { id: string } | null = await prisma.redirectRule.findFirst({
        where: {
          projectId,
          sourcePath: currentPath,
          active: true
        },
        select: { id: true }
      });
      if (nextRule) {
        return { targetPath: null, type: null };
      }
    }

    return hops > 0 ? { targetPath: currentPath, type: firstType } : { targetPath: null, type: null };
  }
}
