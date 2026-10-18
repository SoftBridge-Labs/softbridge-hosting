import { NextRequest, NextResponse } from 'next/server';

const allowedMethods = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const allowedHeaders = 'Content-Type, Authorization';

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;

  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === 'softbridgelabs.in' || hostname.endsWith('.softbridgelabs.in');
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    if (isAllowedOrigin(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin!);
      response.headers.set('Vary', 'Origin');
      response.headers.set('Access-Control-Allow-Methods', allowedMethods);
      response.headers.set('Access-Control-Allow-Headers', allowedHeaders);
      response.headers.set('Access-Control-Max-Age', '86400');
    }
    return response;
  }

  const response = NextResponse.next();
  if (isAllowedOrigin(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin!);
    response.headers.set('Vary', 'Origin');
    response.headers.set('Access-Control-Allow-Methods', allowedMethods);
    response.headers.set('Access-Control-Allow-Headers', allowedHeaders);
  }
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
