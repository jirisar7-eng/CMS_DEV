import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const requestedProject = url.searchParams.get('projectId');

  // 1. Check Database connection with safe timeout (fail-closed, no secret leakage)
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

  // 2. Storage driver detection
  const hasS3Config = !!(
    process.env.STORAGE_S3_ENDPOINT ||
    process.env.AWS_ENDPOINT_URL_S3 ||
    process.env.AWS_ACCESS_KEY_ID
  );
  const storageDriver = hasS3Config ? 's3' : 'local';
  const storageStatus = hasS3Config ? 'active' : 'fallback';
  const storageMessage = hasS3Config ? 'S3 / Cloudové úložiště' : 'Místní úložiště / Fallback';

  // 3. Project context validation
  const normalizedProjectId =
    requestedProject && requestedProject.trim().length > 0 && !requestedProject.includes('..')
      ? requestedProject.trim()
      : null;

  // 4. Session check from cookie
  const sessionCookie = request.cookies.get('syn_admin_session');
  const isAuthenticated = !!sessionCookie?.value;

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
        status: isAuthenticated ? 'authenticated' : 'anonymous',
        message: isAuthenticated ? 'Přihlášen' : 'Neověřeno',
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
