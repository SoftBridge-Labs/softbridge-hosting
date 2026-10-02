import { NextRequest } from 'next/server';

export async function authenticateRequest(req: NextRequest) {
  // Try to get uid from query params
  const uid = req.nextUrl.searchParams.get('uid');
  if (uid) return uid;

  // For POST/PUT requests, try to parse JSON body (Note: this consumes the stream, 
  // so the caller must use req.clone() if they need to parse it again)
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    try {
      const clone = req.clone();
      const body = await clone.json();
      if (body.uid) return body.uid;
      if (body.userId) return body.userId;
    } catch (e) {
      return null;
    }
  }

  return null;
}
