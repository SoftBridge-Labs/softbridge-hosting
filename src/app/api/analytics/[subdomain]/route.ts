import { NextRequest, NextResponse } from 'next/server';
import { getKv } from '@/lib/db';
import { pool } from '@/lib/postgres';

export async function GET(
  req: NextRequest,
  { params }: { params: { subdomain: string } }
) {
  try {
    const { subdomain } = params;
    if (!subdomain) {
      return NextResponse.json({ success: false, error: 'Missing subdomain' }, { status: 400 });
    }

    // Optionally check if site exists and user has access (for now, public or mock check)
    const { rows } = await pool.query('SELECT "userId", "createdAt" FROM "Site" WHERE subdomain = $1', [subdomain]);
    const site = rows[0];

    if (!site) {
      return NextResponse.json({ success: false, error: 'Site not found' }, { status: 404 });
    }

    const kv = await getKv();
    // Try to fetch analytics from KV
    const analyticsKV = await kv.get(['analytics', subdomain]);
    let analyticsData = analyticsKV.value as any;

    if (!analyticsData) {
      // Return default/empty stats if none found
      // In a real scenario, this would be updated by the edge worker on every request
      analyticsData = {
        views: 0,
        uniqueVisitors: 0,
        bandwidthBytes: 0,
        topReferrers: [],
        topPaths: [],
        lastUpdated: new Date().toISOString()
      };
    }

    return NextResponse.json({
      success: true,
      subdomain,
      analytics: analyticsData
    });

  } catch (err: any) {
    console.error('Fetch analytics error', err);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
