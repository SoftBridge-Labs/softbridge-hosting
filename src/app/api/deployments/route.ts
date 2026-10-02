import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/postgres';
import { getKv } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get('uid');

    if (!uid) {
      return NextResponse.json({ success: false, error: { message: 'Missing uid' } }, { status: 401 });
    }

    // 1. Fetch from Postgres
    const { rows } = await pool.query('SELECT * FROM "Site" WHERE "userId" = $1 ORDER BY "updatedAt" DESC', [uid]);
    
    const postgresDeployments = rows.map(site => ({
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

    // 2. Fetch legacy deployments from Deno KV
    const kv = await getKv();
    const kvDeployments = [];
    for await (const entry of kv.list({ prefix: ['deployments_by_user', uid] })) {
      const val = entry.value as any;
      // Only add if not already in Postgres
      if (!postgresDeployments.find(d => d.subdomain === val.subdomain)) {
        kvDeployments.push({
          deploymentId: val.deploymentId || val.siteId,
          siteId: val.siteId || val.deploymentId,
          userId: val.userId,
          subdomain: val.subdomain,
          projectName: val.projectName,
          plan: val.plan,
          status: val.status,
          createdAt: val.createdAt,
          lastDeployedAt: val.lastDeployedAt,
          html: "", css: "", js: ""
        });
      }
    }

    return NextResponse.json({
      success: true,
      deployments: [...postgresDeployments, ...kvDeployments]
    });

  } catch (err: any) {
    console.error('Fetch deployments error', err);
    return NextResponse.json({ success: false, error: { message: 'Internal Server Error' } }, { status: 500 });
  }
}

