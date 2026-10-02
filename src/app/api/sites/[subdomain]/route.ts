import { NextRequest, NextResponse } from 'next/server';
import { getKv } from '@/lib/db';
import { pool } from '@/lib/postgres';

export async function DELETE(
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

    // 1. Check Postgres first
    const { rows } = await pool.query('SELECT * FROM "Site" WHERE subdomain = $1', [subdomain]);
    const site = rows[0];

    const kv = await getKv();
    const existingKv = await kv.get(['deployments_by_subdomain', subdomain]);
    const kvSite = existingKv.value as any;

    if (!site && !kvSite) {
      return NextResponse.json({ success: false, error: { message: 'Site not found' } }, { status: 404 });
    }

    // Verify ownership against whichever one exists
    const ownerId = site?.userId || kvSite?.userId;
    if (ownerId !== uid) {
      return NextResponse.json({ success: false, error: { message: 'Forbidden' } }, { status: 403 });
    }

    // 2. Delete from Postgres if it exists there
    if (site) {
      await pool.query('DELETE FROM "Site" WHERE subdomain = $1', [subdomain]);
    }

    // 3. Delete from KV if it exists there
    if (kvSite) {
      const siteId = kvSite.deploymentId || kvSite.siteId || site?.id;
      if (siteId) {
        await kv.atomic()
          .delete(['deployments_by_subdomain', subdomain])
          .delete(['deployments_by_user', uid, siteId])
          .delete(['deployments_by_id', siteId])
          .commit();
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Site deleted'
    });

  } catch (err: any) {
    console.error('Delete site error', err);
    return NextResponse.json({ success: false, error: { message: 'Internal Server Error' } }, { status: 500 });
  }
}
