import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isDatabaseConfigured } from '@/lib/runtime/database';

export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'no-store, no-cache, must-revalidate';
const DATABASE_TIMEOUT_MS = 2000;

function readinessResponse(ready: boolean) {
  return NextResponse.json(
    { status: ready ? 'ready' : 'not_ready' },
    {
      status: ready ? 200 : 503,
      headers: {
        'Cache-Control': CACHE_CONTROL,
      },
    }
  );
}

async function probeDatabase() {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('DATABASE_READINESS_TIMEOUT')),
          DATABASE_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return readinessResponse(false);
  }

  try {
    await probeDatabase();
    return readinessResponse(true);
  } catch {
    return readinessResponse(false);
  }
}
