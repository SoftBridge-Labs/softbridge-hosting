import { NextRequest, NextResponse } from 'next/server';
import { getKv } from '@/lib/db';
import { pool } from '@/lib/postgres';

export async function POST(
  req: NextRequest,
  { params }: { params: { subdomain: string } }
) {
  try {
    const { subdomain } = params;
    const uid = req.nextUrl.searchParams.get('uid');

    if (!uid) {
      return NextResponse.json({ success: false, error: { message: 'Missing uid' } }, { status: 401 });
    }

    if (!subdomain) {
      return NextResponse.json({ success: false, error: { message: 'Missing subdomain' } }, { status: 400 });
    }

    // Verify ownership
    const { rows } = await pool.query('SELECT * FROM "Site" WHERE subdomain = $1', [subdomain]);
    const site = rows[0];

    if (!site) {
      return NextResponse.json({ success: false, error: { message: 'Site not found' } }, { status: 404 });
    }

    if (site.userId !== uid) {
      return NextResponse.json({ success: false, error: { message: 'Forbidden' } }, { status: 403 });
    }

    const now = new Date().toISOString();

    // Update Postgres timestamp
    await pool.query('UPDATE "Site" SET "lastDeployedAt" = $1 WHERE subdomain = $2', [now, subdomain]);

    // Update KV timestamp
    const kv = await getKv();
    const existing = await kv.get(['deployments_by_subdomain', subdomain]);
    
    if (existing.value) {
      const meta = { ...(existing.value as any), lastDeployedAt: now };
      await kv.atomic()
        .set(['deployments_by_subdomain', subdomain], meta)
        .set(['deployments_by_user', uid, site.id], meta)
        .set(['deployments_by_id', site.id], meta)
        .commit();
    }

    return NextResponse.json({
      success: true,
      message: 'Redeployed',
      url: `https://${subdomain}.sblab.xyz`
    });

  } catch (err: any) {
    console.error('Redeploy site error', err);
    return NextResponse.json({ success: false, error: { message: 'Internal Server Error' } }, { status: 500 });
  }
}
