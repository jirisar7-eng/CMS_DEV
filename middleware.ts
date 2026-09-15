import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect /admin routes
  if (pathname.startsWith('/admin')) {
    // Exclude login page from redirect loop
    if (pathname === '/admin/login') {
      return NextResponse.next();
    }

    // Check for session cookie
    const sessionCookie = request.cookies.get('syn_admin_session');
    if (!sessionCookie || !sessionCookie.value) {
      const loginUrl = new URL('/admin/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
    
    // Note: Deep authorization (RBAC) is enforced at the layout / server action level,
    // where we have full database access. This middleware provides a fast initial edge check.
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
