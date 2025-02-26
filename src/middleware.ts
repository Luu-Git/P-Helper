import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Define CSP header
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.firebaseio.com https://*.firebaseapp.com https://*.firebase.com https://apis.google.com https://www.gstatic.com;
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https://*.firebaseio.com https://*.firebaseapp.com https://*.firebase.com https://www.gstatic.com https://firebasestorage.googleapis.com;
    font-src 'self';
    connect-src 'self' https://*.firebaseio.com https://*.firebaseapp.com https://*.firebase.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com;
    frame-src 'self' https://*.firebaseio.com https://*.firebaseapp.com https://*.firebase.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    block-all-mixed-content;
    upgrade-insecure-requests;
  `.replace(/\s{2,}/g, ' ').trim();

  // Clone the response
  const response = NextResponse.next();

  // Add the CSP header
  response.headers.set('Content-Security-Policy', cspHeader);

  return response;
}

// Only apply middleware to these paths
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}; 