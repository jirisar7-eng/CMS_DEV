import { NextRequest, NextResponse } from 'next/server';
import { mediaService } from '@/lib/domain/media/service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> } // In Next.js 15, params is a Promise
) {
  try {
    const { id } = await params;
    
    // We fetch the asset metadata first to check security/status
    const asset = await mediaService.getAsset(id);
    if (!asset) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    const status = (asset.status as string).toUpperCase();
    if (status === 'DRAFT' || status === 'QUARANTINED' || status === 'ARCHIVED') {
      // TODO: In a real app, we would check admin/author session here.
      // For now, these statuses are strictly blocked from public unauthenticated access.
      return NextResponse.json({ error: 'Forbidden: Asset is not public' }, { status: 403 });
    }

    const download = await mediaService.getAssetDownload(id);
    
    // Determine headers
    const headers = new Headers();
    headers.set('Content-Type', download.mimeType);
    headers.set('Content-Length', download.sizeBytes.toString());
    
    // Add security headers for SVG
    if (download.mimeType === 'image/svg+xml') {
      headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      headers.set('X-Content-Type-Options', 'nosniff');
    }
    
    // Make sure images/vectors can be cached
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    // Return the response as a stream or buffer
    return new NextResponse(download.data as any, {
      status: 200,
      headers
    });
  } catch (err: any) {
    if (err.message === 'Asset not found') {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }
    console.error('Failed to get media asset:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
