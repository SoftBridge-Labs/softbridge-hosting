import { NextRequest, NextResponse } from 'next/server';
import { getKv } from '@/lib/db';
import { prisma } from '@/lib/prisma';

const RESERVED_SUBDOMAINS = [
  'www', 'api', 'admin', 'app', 'auth', 'login', 'support', 'docs',
  'status', 'dashboard', 'billing', 'mail', 'cdn', 'security',
  'sblab', 'softbridge', 'htmlpro'
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let { userId, projectName, subdomain, plan = "free", html = "", css = "", js = "" } = body;
    
    // Fallback if the Flutter app is outdated and passes uid in url or something
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

    if (!html.trim() && !css.trim() && !js.trim()) {
      return NextResponse.json({ success: false, error: { code: "EMPTY_CODE", message: "Please provide at least some HTML content" } }, { status: 400 });
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

    // Upsert site in Postgres (create or update code)
    const site = await prisma.site.upsert({
      where: { subdomain },
      create: { subdomain, userId, projectName, plan, html, css, js, status: "active" },
      update: { html, css, js, projectName, plan, updatedAt: now, lastDeployedAt: now },
    });

    // Store metadata in KV for fast subdomain lookups
    const meta = {
      siteId: site.id,
      userId,
      subdomain,
      projectName,
      plan,
      status: "active",
      createdAt: site.createdAt.toISOString(),
      lastDeployedAt: now.toISOString(),
    };
    
    await kv.atomic()
      .set(['deployments_by_subdomain', subdomain], meta)
      .set(['deployments_by_user', userId, site.id], meta)
      .set(['deployments_by_id', site.id], meta)
      .commit();

    return NextResponse.json({
      success: true,
      deploymentId: site.id,
      url: `https://${subdomain}.sblab.xyz`,
      status: 'active'
    });

  } catch (err: any) {
    console.error('Deploy error', err);
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' } }, { status: 500 });
  }
}
