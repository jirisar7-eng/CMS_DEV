import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import { isDatabaseConfigured } from '@/lib/runtime/database';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // 1. Database Configuration Pre-check (Fail-closed)
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' } },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  }

  // 2. Canonical Server-side Session & Authentication Check (Fail-closed)
  // Must verify actual session in database, no trusting unverified cookie or client identity
  const { session, user } = await getSession();

  if (!session || !user || user.status !== 'ACTIVE') {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } },
      {
        status: 401,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  }

  // 3. Authorization Check (Fail-closed admin access via RBAC)
  const hasAdminAccess = await hasPermission(user.id, 'admin.access');
  if (!hasAdminAccess) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Forbidden: insufficient permissions' } },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  }

  // 4. Project Context Validation & Project Permission Check
  const url = new URL(request.url);
  const requestedProject = url.searchParams.get('projectId');
  const normalizedProjectId =
    requestedProject && requestedProject.trim().length > 0 && !requestedProject.includes('..')
      ? requestedProject.trim()
      : null;

  if (normalizedProjectId) {
    // If project is specified, verify project permission/scope
    const hasProjectAccess = await hasPermission(user.id, 'admin.access', normalizedProjectId);
    if (!hasProjectAccess) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Forbidden: access to requested project denied' } },
        {
          status: 403,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          },
        }
      );
    }
  }

  // 5. Database Connection Check (with safe timeout, fail-closed, no leak of secrets or credentials)
  let dbStatus: 'connected' | 'disconnected' = 'disconnected';
  let dbLatencyMs: number | null = null;
  let dbMessage = 'Databáze není dostupná';

  try {
    const start = Date.now();
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout spojení s databází')), 2000)
      ),
    ]);
    dbLatencyMs = Date.now() - start;
    dbStatus = 'connected';
    dbMessage = 'Aktivní spojení (PostgreSQL)';
  } catch {
    dbStatus = 'disconnected';
    dbLatencyMs = null;
    dbMessage = 'Spojení selhalo nebo vypršel časový limit';
  }

  // 6. Storage Health Truthfulness: configured vs available/verified
  // Never mark configured as active without actual runtime verification.
  // Never expose credentials, endpoints, keys or secrets to the client.
  const hasS3Config = !!(
    process.env.CMS_STORAGE_ENDPOINT ||
    process.env.STORAGE_S3_ENDPOINT ||
    process.env.AWS_ENDPOINT_URL_S3 ||
    process.env.CMS_STORAGE_ACCESS_KEY ||
    process.env.AWS_ACCESS_KEY_ID
  );

  const storageDriver = hasS3Config ? 's3' : 'local';
  // Truthfulness invariant: configured != available/verified
  // Without live runtime S3 ping/head-bucket verified in this request, status is unverified or fallback
  const storageStatus = hasS3Config ? 'configured_unverified' : 'fallback';
  const storageMessage = hasS3Config
    ? 'S3 / Cloudové úložiště (nakonfigurováno, neověřeno)'
    : 'Místní úložiště / Fallback';

  return NextResponse.json(
    {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        message: dbMessage,
      },
      storage: {
        driver: storageDriver,
        status: storageStatus,
        message: storageMessage,
      },
      project: {
        id: normalizedProjectId,
        status: normalizedProjectId ? 'selected' : 'not_selected',
        message: normalizedProjectId ? `Projekt: ${normalizedProjectId}` : 'Projekt nevybrán',
      },
      auth: {
        status: 'authenticated',
        userId: user.id,
        message: 'Ověřeno',
      },
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
