import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/postgres';
import { checkAdminAuth } from '@/lib/adminAuth';

export async function GET(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    const { rows } = await pool.query(
      'SELECT id, "userId", "projectName", subdomain, plan, status, "createdAt", "updatedAt" FROM "Site" ORDER BY "createdAt" DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    return NextResponse.json({ success: true, sites: rows });
  } catch (err: any) {
    console.error('Admin Fetch sites error', err);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
