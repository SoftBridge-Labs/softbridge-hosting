import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/postgres';
import { getKv } from '@/lib/db';
import { checkAdminAuth } from '@/lib/adminAuth';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { subdomain: string } }
) {
  const authError = checkAdminAuth(req);
  if (authError) return authError;

  try {
    const { subdomain } = params;
    
    const { rows } = await pool.query('DELETE FROM "Site" WHERE subdomain = $1 RETURNING *', [subdomain]);
    const site = rows[0];

    if (site) {
      const kv = await getKv();
      await kv.atomic()
        .delete(['deployments_by_subdomain', subdomain])
        .delete(['deployments_by_user', site.userId, site.id])
        .delete(['deployments_by_id', site.id])
        .commit();
    }

    return NextResponse.json({ success: true, message: 'Site deleted', deleted: !!site });
  } catch (err: any) {
    console.error('Admin Delete site error', err);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { subdomain: string } }
) {
  const authError = checkAdminAuth(req);
  if (authError) return authError;

  try {
    const { subdomain } = params;
    const body = await req.json();
    const { status, plan } = body;
    
    const updates = [];
    const values = [subdomain];
    let valIdx = 2;

    if (status) {
      updates.push(`status = $${valIdx++}`);
      values.push(status);
    }
    if (plan) {
      updates.push(`plan = $${valIdx++}`);
      values.push(plan);
    }

    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 });
    }

    const query = `UPDATE "Site" SET ${updates.join(', ')}, "updatedAt" = NOW() WHERE subdomain = $1 RETURNING id, "userId", "projectName", subdomain, plan, status`;
    const { rows } = await pool.query(query, values);
    const site = rows[0];

    if (!site) {
      return NextResponse.json({ success: false, error: 'Site not found' }, { status: 404 });
    }
    
    // Update KV metadata as well
    const kv = await getKv();
    const metaKV = await kv.get(['deployments_by_subdomain', subdomain]);
    if (metaKV.value) {
      const newMeta = { ...(metaKV.value as any), status: site.status, plan: site.plan };
      await kv.atomic()
        .set(['deployments_by_subdomain', subdomain], newMeta)
        .set(['deployments_by_user', site.userId, site.id], newMeta)
        .set(['deployments_by_id', site.id], newMeta)
        .commit();
    }

    return NextResponse.json({ success: true, site });
  } catch (err: any) {
    console.error('Admin Update site error', err);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
