import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/postgres';

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get('uid');

    if (!uid) {
      return NextResponse.json({ success: false, error: { message: 'Missing uid' } }, { status: 401 });
    }

    const { rows } = await pool.query('SELECT * FROM "Site" WHERE "userId" = $1 ORDER BY "updatedAt" DESC', [uid]);
    
    // Map to deployment format
    const deployments = rows.map(site => ({
      deploymentId: site.id,
      siteId: site.id,
      userId: site.userId,
      subdomain: site.subdomain,
      projectName: site.projectName,
      plan: site.plan,
      status: site.status,
      createdAt: site.createdAt,
      lastDeployedAt: site.lastDeployedAt,
      html: site.html || "",
      css: site.css || "",
      js: site.js || ""
    }));

    return NextResponse.json({
      success: true,
      deployments
    });

  } catch (err: any) {
    console.error('Fetch deployments error', err);
    return NextResponse.json({ success: false, error: { message: 'Internal Server Error' } }, { status: 500 });
  }
}
