import { NextRequest, NextResponse } from 'next/server';

export function checkAdminAuth(req: NextRequest) {
  const adminKey = req.headers.get('x-admin-key');
  const expectedKey = process.env.ADMIN_KEY;

  if (adminKey !== expectedKey) {
    return NextResponse.json({ success: false, error: 'Unauthorized: Invalid Admin Key' }, { status: 401 });
  }
  return null; // indicates auth passed
}
