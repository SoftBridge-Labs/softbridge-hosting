import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/postgres';
import { checkAdminAuth } from '@/lib/adminAuth';

export async function GET(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return authError;

  try {
    const sitesCountRes = await pool.query('SELECT COUNT(*) FROM "Site"');
    const usersCountRes = await pool.query('SELECT COUNT(DISTINCT "userId") FROM "Site"');
    const activeSitesRes = await pool.query('SELECT COUNT(*) FROM "Site" WHERE status = \'active\'');

    return NextResponse.json({
      success: true,
      stats: {
        totalSites: parseInt(sitesCountRes.rows[0].count),
        totalUsers: parseInt(usersCountRes.rows[0].count),
        activeSites: parseInt(activeSitesRes.rows[0].count),
      }
    });
  } catch (err: any) {
    console.error('Admin Stats error', err);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
