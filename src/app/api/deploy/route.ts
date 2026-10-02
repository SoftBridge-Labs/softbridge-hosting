import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { getKv, DeploymentRecord } from '@/lib/db';

const RESERVED_SUBDOMAINS = [
  'www', 'api', 'admin', 'app', 'auth', 'login', 'support', 'docs',
  'status', 'dashboard', 'billing', 'mail', 'cdn', 'security',
  'sblab', 'softbridge', 'htmlpro'
];

export async function POST(req: NextRequest) {
  const uid = await authenticateRequest(req);
  if (!uid) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { userId, projectName, subdomain, plan } = body;

    if (uid !== userId) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'User ID mismatch' } }, { status: 403 });
    }

    const MAIN_API_URL = process.env.MAIN_API_URL || 'https://api.softbridgelabs.in';
    const verifyRes = await fetch(`${MAIN_API_URL}/github/contents?userId=${userId}&projectName=${projectName}&path=index.html`);
    if (!verifyRes.ok) {
      return NextResponse.json({ success: false, error: { code: 'PROJECT_NOT_FOUND', message: 'Project or index.html not found in GitHub repository' } }, { status: 400 });
    }

    if (!/^[a-z0-9-]+$/.test(subdomain)) {
      return NextResponse.json({ success: false, error: { code: 'INVALID_SUBDOMAIN', message: 'Subdomain must be alphanumeric and hyphens only' } }, { status: 400 });
    }

    if (RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase())) {
      return NextResponse.json({ success: false, error: { code: 'RESERVED_SUBDOMAIN', message: 'This subdomain is reserved' } }, { status: 400 });
    }

    const kv = await getKv();

    // Check if subdomain is taken
    const existingDomain = await kv.get(['deployments_by_subdomain', subdomain]);
    if (existingDomain.value) {
      return NextResponse.json({ success: false, error: { code: 'SUBDOMAIN_TAKEN', message: 'Subdomain is already taken' } }, { status: 400 });
    }

    const limit = plan === 'premium' ? 10 : 1;
    
    // Count active deployments for user
    const userDeploymentsIter = kv.list({ prefix: ['deployments_by_user', userId] });
    let activeDeploymentsCount = 0;
    for await (const entry of userDeploymentsIter) {
      if (entry.value.status === 'active') {
        activeDeploymentsCount++;
      }
    }

    if (activeDeploymentsCount >= limit) {
      return NextResponse.json({ success: false, error: { code: 'DEPLOYMENT_LIMIT_REACHED', message: `${plan} users can publish only ${limit} website(s).` } }, { status: 400 });
    }

    const deploymentId = `dep_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const newDeployment: DeploymentRecord = {
      deploymentId,
      userId,
      projectName,
      subdomain,
      plan,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastDeployedAt: new Date().toISOString(),
    };

    // Save transaction
    await kv.atomic()
      .set(['deployments_by_subdomain', subdomain], newDeployment)
      .set(['deployments_by_user', userId, deploymentId], newDeployment)
      .set(['deployments_by_id', deploymentId], newDeployment)
      .commit();

    return NextResponse.json({
      success: true,
      deploymentId,
      url: `https://${subdomain}.sblab.xyz`,
      status: 'active'
    });

  } catch (err: any) {
    console.error('Deploy error', err);
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' } }, { status: 500 });
  }
}
