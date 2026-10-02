// @ts-nocheck

const RESERVED_SUBDOMAINS = [
  'www', 'api', 'admin', 'app', 'auth', 'login', 'support', 'docs',
  'status', 'dashboard', 'billing', 'mail', 'cdn', 'security',
  'sblab', 'softbridge', 'htmlpro'
];

async function handleDeploy(req: Request, kv: Deno.Kv) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  
  try {
    const url = new URL(req.url);
    let uid = url.searchParams.get('uid');
    const body = await req.json().catch(() => ({}));
    if (!uid) uid = body.uid || body.userId;
    
    if (!uid) return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing UID' } }, { status: 401 });
    
    const { projectName, subdomain, plan } = body;
    if (!projectName || !subdomain || !plan) {
      return Response.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing required fields' } }, { status: 400 });
    }

    const MAIN_API_URL = Deno.env.get('MAIN_API_URL') || 'https://api.softbridgelabs.in';
    const verifyRes = await fetch(`${MAIN_API_URL}/github/contents?userId=${uid}&projectName=${projectName}&path=index.html`);
    if (!verifyRes.ok) {
      return Response.json({ success: false, error: { code: 'PROJECT_NOT_FOUND', message: 'Project or index.html not found' } }, { status: 400 });
    }

    if (!/^[a-z0-9-]+$/.test(subdomain)) {
      return Response.json({ success: false, error: { code: 'INVALID_SUBDOMAIN', message: 'Subdomain must be alphanumeric and hyphens only' } }, { status: 400 });
    }

    if (RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase())) {
      return Response.json({ success: false, error: { code: 'RESERVED_SUBDOMAIN', message: 'This subdomain is reserved' } }, { status: 400 });
    }

    const existingDomain = await kv.get(['deployments_by_subdomain', subdomain]);
    if (existingDomain.value) {
      return Response.json({ success: false, error: { code: 'SUBDOMAIN_TAKEN', message: 'Subdomain is already taken' } }, { status: 400 });
    }

    const limit = plan === 'premium' ? 10 : 1;
    let activeDeploymentsCount = 0;
    for await (const entry of kv.list({ prefix: ['deployments_by_user', uid] })) {
      if ((entry.value as any).status === 'active') activeDeploymentsCount++;
    }

    if (activeDeploymentsCount >= limit) {
      return Response.json({ success: false, error: { code: 'DEPLOYMENT_LIMIT_REACHED', message: `${plan} users can publish only ${limit} website(s).` } }, { status: 400 });
    }

    const deploymentId = `dep_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const newDeployment = {
      deploymentId,
      userId: uid,
      projectName,
      subdomain,
      plan,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastDeployedAt: new Date().toISOString(),
    };

    await kv.atomic()
      .set(['deployments_by_subdomain', subdomain], newDeployment)
      .set(['deployments_by_user', uid, deploymentId], newDeployment)
      .set(['deployments_by_id', deploymentId], newDeployment)
      .commit();

    return Response.json({
      success: true,
      deploymentId,
      url: `https://${subdomain}.sblab.xyz`,
      status: 'active'
    });
  } catch (err) {
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal Error' } }, { status: 500 });
  }
}

async function handleGetDeployments(req: Request, kv: Deno.Kv) {
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid');
  if (!uid) return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing UID' } }, { status: 401 });

  const deployments = [];
  for await (const entry of kv.list({ prefix: ['deployments_by_user', uid] })) {
    deployments.push(entry.value);
  }
  return Response.json({ success: true, deployments });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const pathname = url.pathname;
  
  // CORS Headers
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  const kv = await Deno.openKv();

  try {
    if (pathname === '/api/health') {
      return Response.json({ success: true });
    }

    if (pathname === '/api/deploy') {
      return await handleDeploy(req, kv);
    }

    if (pathname === '/api/deployments') {
      if (req.method === 'GET') return await handleGetDeployments(req, kv);
    }
    
    // Pattern match for specific deployments
    const deployMatch = pathname.match(/^\/api\/deployments\/(dep_[a-zA-Z0-9_]+)$/);
    if (deployMatch) {
      const id = deployMatch[1];
      const uid = url.searchParams.get('uid');
      if (!uid) return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing UID' } }, { status: 401 });

      const entry = await kv.get(['deployments_by_id', id]);
      const deployment = entry.value as any;
      if (!deployment || deployment.userId !== uid) return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Deployment not found' } }, { status: 404 });

      if (req.method === 'GET') return Response.json({ success: true, deployment });
      if (req.method === 'DELETE') {
        await kv.atomic()
          .delete(['deployments_by_subdomain', deployment.subdomain])
          .delete(['deployments_by_user', uid, id])
          .delete(['deployments_by_id', id])
          .commit();
        return Response.json({ success: true, message: 'Deployment deleted' });
      }
    }

    // Redeploy
    const redeployMatch = pathname.match(/^\/api\/deployments\/(dep_[a-zA-Z0-9_]+)\/redeploy$/);
    if (redeployMatch && req.method === 'POST') {
      const id = redeployMatch[1];
      const uid = url.searchParams.get('uid');
      if (!uid) return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing UID' } }, { status: 401 });

      const entry = await kv.get(['deployments_by_id', id]);
      const deployment = entry.value as any;
      if (!deployment || deployment.userId !== uid) return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Deployment not found' } }, { status: 404 });

      deployment.lastDeployedAt = new Date().toISOString();
      await kv.atomic()
        .set(['deployments_by_subdomain', deployment.subdomain], deployment)
        .set(['deployments_by_user', uid, id], deployment)
        .set(['deployments_by_id', id], deployment)
        .commit();
      return Response.json({ success: true, message: 'Redeployed successfully', deploymentId: id });
    }

    // Internal resolution for Cloudflare Worker
    const siteMatch = pathname.match(/^\/api\/sites\/([a-zA-Z0-9-]+)$/);
    if (siteMatch && req.method === 'GET') {
      const subdomain = siteMatch[1];
      const entry = await kv.get(['deployments_by_subdomain', subdomain]);
      const deployment = entry.value as any;
      if (!deployment || deployment.status !== 'active') return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Deployment not found' } }, { status: 404 });
      
      return Response.json({
        success: true,
        deploymentId: deployment.deploymentId,
        userId: deployment.userId,
        projectName: deployment.projectName,
        subdomain: deployment.subdomain,
        plan: deployment.plan
      });
    }

    return new Response('Not Found', { status: 404 });
  } catch (err) {
    console.error(err);
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' } }, { status: 500 });
  }
});
