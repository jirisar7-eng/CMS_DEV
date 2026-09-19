import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import { resolveBasicSystemMap, resolveInternalSystemMap, SystemMapRegistryError } from '@/lib/domain/system-map';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate session
    const { user } = await getSession();
    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'UNAUTHENTICATED' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // 2. Determine requested view
    const { searchParams } = new URL(req.url);
    const requestedView = searchParams.get('view') || 'basic';

    if (requestedView === 'internal') {
      // 3a. Authorize internal view
      const canReadInternal = await hasPermission(user.id, 'system_map.read_internal');
      if (!canReadInternal) {
        return NextResponse.json(
          { error: 'UNAUTHORIZED_INTERNAL_VIEW', message: 'Permission system_map.read_internal required' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }

      const internalMap = resolveInternalSystemMap();
      return NextResponse.json(internalMap, {
        status: 200,
        headers: NO_STORE_HEADERS,
      });
    }

    if (requestedView === 'basic') {
      // 3b. Authorize basic view
      const canReadBasic = await hasPermission(user.id, 'system_map.read_basic');
      if (!canReadBasic) {
        return NextResponse.json(
          { error: 'UNAUTHORIZED_BASIC_VIEW', message: 'Permission system_map.read_basic required' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }

      const basicMap = resolveBasicSystemMap();
      return NextResponse.json(basicMap, {
        status: 200,
        headers: NO_STORE_HEADERS,
      });
    }

    // Invalid view parameter
    return NextResponse.json(
      { error: 'INVALID_VIEW_PARAMETER', message: "Supported views: 'basic' or 'internal'" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error resolving system map:', error);
    if (error instanceof SystemMapRegistryError) {
      return NextResponse.json(
        { error: 'SYSTEM_MAP_REGISTRY_ERROR', message: error.message },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
