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

export async function POST(
  req: NextRequest,
  { params }: { params: { subdomain: string } }
) {
  try {
    const { subdomain } = params;
    if (!subdomain) {
      return NextResponse.json({ success: false, error: 'Missing subdomain' }, { status: 400 });
    }

    const body = await req.json();
    const kv = await getKv();
    const analyticsKV = await kv.get(['analytics', subdomain]);
    let analyticsData = analyticsKV.value as any;

    if (!analyticsData) {
      analyticsData = {
        views: 0,
        uniqueVisitors: 0,
        bandwidthBytes: 0,
        topReferrers: [],
        topPaths: [],
        lastUpdated: new Date().toISOString()
      };
    }

    analyticsData.views += body.views || 0;
    analyticsData.bandwidthBytes += body.bandwidthBytes || 0;
    
    // Unique Visitors Tracking
    if (body.visitorId && body.visitorId !== 'unknown') {
      const visitorKey = ['analytics_visitor', subdomain, body.visitorId];
      const existingVisitor = await kv.get(visitorKey);
      if (!existingVisitor.value) {
        analyticsData.uniqueVisitors += 1;
        // set an expiration of 24 hours so they are counted once a day
        await kv.set(visitorKey, true, { expireIn: 86400000 });
      }
    } else if (!body.visitorId) {
       // fallback if no visitor ID provided
       analyticsData.uniqueVisitors += body.uniqueVisitors || 0;
    }

    // Top Referrers Tracking
    if (body.referrer) {
      try {
        let domainStr = body.referrer;
        if (body.referrer.startsWith('http')) {
          domainStr = new URL(body.referrer).hostname;
        }
        
        const existingRef = analyticsData.topReferrers.find((r: any) => r.domain === domainStr);
        if (existingRef) {
          existingRef.visits += 1;
        } else {
          analyticsData.topReferrers.push({ domain: domainStr, visits: 1 });
        }
        analyticsData.topReferrers.sort((a: any, b: any) => b.visits - a.visits);
        analyticsData.topReferrers = analyticsData.topReferrers.slice(0, 10);
      } catch(e) {
        // ignore invalid URL
      }
    }

    // Top Paths Tracking
    if (body.path) {
      const existingPath = analyticsData.topPaths.find((p: any) => p.path === body.path);
      if (existingPath) {
        existingPath.visits += 1;
      } else {
        analyticsData.topPaths.push({ path: body.path, visits: 1 });
      }
      analyticsData.topPaths.sort((a: any, b: any) => b.visits - a.visits);
      analyticsData.topPaths = analyticsData.topPaths.slice(0, 10);
    }

    analyticsData.lastUpdated = new Date().toISOString();

    await kv.set(['analytics', subdomain], analyticsData);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Update analytics error', err);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
