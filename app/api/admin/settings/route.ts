import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getSettingsService, SettingsError } from '@/lib/domain/settings';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const service = getSettingsService();
    const settings = await service.getSystemSettings(user.id);

    return NextResponse.json({ settings }, { status: 200, headers: NO_STORE_HEADERS });
  } catch (err: any) {
    if (err instanceof SettingsError) {
      return NextResponse.json(
        { error: err.code, message: err.message, validationErrors: (err as any).validationErrors },
        { status: err.status, headers: NO_STORE_HEADERS }
      );
    }
    console.error('[API /api/admin/settings GET] Unexpected error:', err);
    return NextResponse.json({ error: 'INTERNAL_SERVER_ERROR' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401, headers: NO_STORE_HEADERS });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'INVALID_JSON', message: 'Malformed JSON payload' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'INVALID_PAYLOAD', message: 'Payload must be a JSON object' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const payload = body.settings !== undefined ? body.settings : body;

    const service = getSettingsService();
    const settings = await service.updateSystemSettings(user.id, payload);

    return NextResponse.json({ settings }, { status: 200, headers: NO_STORE_HEADERS });
  } catch (err: any) {
    if (err instanceof SettingsError) {
      return NextResponse.json(
        { error: err.code, message: err.message, validationErrors: (err as any).validationErrors },
        { status: err.status, headers: NO_STORE_HEADERS }
      );
    }
    console.error('[API /api/admin/settings PUT] Unexpected error:', err);
    return NextResponse.json({ error: 'INTERNAL_SERVER_ERROR' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
