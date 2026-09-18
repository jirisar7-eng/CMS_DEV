import { NextRequest, NextResponse } from 'next/server';
import { mediaService } from '@/lib/domain/media/service';
import { resolvePublicProjectContext } from '@/lib/domain/navigation/public-context';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Resolve public project context fail-closed
    const projectId = await resolvePublicProjectContext(request);
    if (!projectId) {
      return NextResponse.json(
        { error: 'Forbidden: Missing or invalid project context' },
        { status: 403 }
      );
    }

    // We fetch the asset metadata with strict projectId isolation
    const asset = await mediaService.getAsset(id, projectId);
    if (!asset) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    const status = (asset.status as string).toUpperCase();
    
    // ONLY exact 'PUBLISHED' is allowed publicly. Fail-closed everything else.
    if (status !== 'PUBLISHED') {
      // DRAFT, QUARANTINED, ARCHIVED, READY, PROCESSING, FAILED, etc.
      // All of these require authorization which we do not check here since it's a public endpoint
      return NextResponse.json({ error: 'Forbidden: Asset is not public' }, { status: 403 });
    }

    const download = await mediaService.getAssetDownload(id, projectId);
    
    // Determine headers
    const headers = new Headers();
    headers.set('Content-Type', download.mimeType);
    headers.set('Content-Length', download.sizeBytes.toString());
    
    // Add security headers for SVG
    if (download.mimeType === 'image/svg+xml') {
      headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      headers.set('X-Content-Type-Options', 'nosniff');
    } else {
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
