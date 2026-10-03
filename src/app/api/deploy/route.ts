import { NextRequest, NextResponse } from 'next/server';
import { getKv } from '@/lib/db';
import { pool } from '@/lib/postgres';
import { Filter } from 'bad-words';

const RESERVED_SUBDOMAINS = [
  'www', 'api', 'admin', 'app', 'auth', 'login', 'support', 'docs',
  'status', 'dashboard', 'billing', 'mail', 'cdn', 'security',
  'sblab', 'softbridge', 'htmlpro'
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let { userId, projectName, subdomain, plan = "free", html = "", css = "", js = "", files = [] } = body;
    
    if (!userId) {
      userId = req.nextUrl.searchParams.get('uid') || body.uid;
    }

    if (!userId) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing userId' } }, { status: 401 });
    }

    if (!projectName || !subdomain) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing required fields: projectName, subdomain' } }, { status: 400 });
    }

    if (!/^[a-z0-9-]+$/.test(subdomain)) {
      return NextResponse.json({ success: false, error: { code: 'INVALID_SUBDOMAIN', message: 'Subdomain must only contain lowercase letters, numbers, and hyphens' } }, { status: 400 });
    }

    if (RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase())) {
      return NextResponse.json({ success: false, error: { code: 'RESERVED_SUBDOMAIN', message: 'This subdomain is reserved' } }, { status: 400 });
    }

    if (!html.trim() && !css.trim() && !js.trim() && (!Array.isArray(files) || files.length === 0)) {
      return NextResponse.json({ success: false, error: { code: "EMPTY_CODE", message: "Please provide at least some HTML content or files" } }, { status: 400 });
    }

    const totalSize = Buffer.byteLength(html + css + js + JSON.stringify(files), 'utf8');
    if (totalSize > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Total payload size exceeds 5MB limit per site' } }, { status: 413 });
    }

    const filter = new Filter();

    const contentToCheck = html + " " + css + " " + js + " " + JSON.stringify(files);
    if (filter.isProfane(contentToCheck)) {
      return NextResponse.json({ success: false, error: { code: 'ILLEGAL_CONTENT', message: 'Content violates platform policies' } }, { status: 403 });
    }

    const kv = await getKv();

    // Check if subdomain is already taken in KV
    const existing = await kv.get(['deployments_by_subdomain', subdomain]);
    if (existing.value && (existing.value as any).userId !== userId) {
      return NextResponse.json({ success: false, error: { code: 'SUBDOMAIN_TAKEN', message: 'This subdomain is already in use' } }, { status: 400 });
    }

    // Plan limits
    const limit = plan === 'premium' ? 10 : 1;
    let activeCount = 0;
    for await (const entry of kv.list({ prefix: ['deployments_by_user', userId] })) {
      if ((entry.value as any).status === 'active') activeCount++;
    }

    if (activeCount >= limit && !existing.value) {
      return NextResponse.json({ success: false, error: { code: 'LIMIT_REACHED', message: `${plan} plan allows max ${limit} site(s)` } }, { status: 400 });
    }

    const now = new Date();
    const siteId = (existing.value as any)?.siteId || `site_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Upsert site in Postgres using raw SQL
    const insertQuery = `
      INSERT INTO "Site" (id, "userId", "projectName", subdomain, plan, html, css, js, files, status, "createdAt", "updatedAt", "lastDeployedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10, $10, $10)
      ON CONFLICT (subdomain) 
      DO UPDATE SET 
        html = EXCLUDED.html,
        css = EXCLUDED.css,
        js = EXCLUDED.js,
        files = EXCLUDED.files,
        "projectName" = EXCLUDED."projectName",
        plan = EXCLUDED.plan,
        "updatedAt" = EXCLUDED."updatedAt",
        "lastDeployedAt" = EXCLUDED."lastDeployedAt"
    `;
    const insertValues = [siteId, userId, projectName, subdomain, plan, html, css, js, JSON.stringify(files), now.toISOString()];

    try {
      await pool.query(insertQuery, insertValues);
    } catch (dbErr: any) {
      if (dbErr.code === '42703') { // undefined_column
        await pool.query('ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS files JSONB DEFAULT \'[]\'');
        await pool.query(insertQuery, insertValues); // Retry after adding column
      } else {
        throw dbErr;
      }
    }

    // Store metadata in KV for fast subdomain lookups
    const meta = {
      siteId,
      userId,
      subdomain,
      projectName,
      plan,
      status: "active",
      createdAt: (existing.value as any)?.createdAt || now.toISOString(),
      lastDeployedAt: now.toISOString(),
    };
    
    await kv.atomic()
      .set(['deployments_by_subdomain', subdomain], meta)
      .set(['deployments_by_user', userId, siteId], meta)
      .set(['deployments_by_id', siteId], meta)
      .commit();

    return NextResponse.json({
      success: true,
      deploymentId: siteId,
      url: `https://${subdomain}.sblab.xyz`,
      status: 'active'
    });

  } catch (err: any) {
    console.error('Deploy error', err);
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' } }, { status: 500 });
  }
}
