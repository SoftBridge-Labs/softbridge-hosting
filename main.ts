// @ts-nocheck
// Deno Deploy entrypoint for SoftBridge Hosting API

const RESERVED_SUBDOMAINS = [
  'www', 'api', 'admin', 'app', 'auth', 'login', 'support', 'docs',
  'status', 'dashboard', 'billing', 'mail', 'cdn', 'security',
  'sblab', 'softbridge', 'htmlpro'
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });
}

async function handleDeploy(req: Request, kv: Deno.Kv) {
  if (req.method !== 'POST') return json({ success: false, error: { code: 'METHOD_NOT_ALLOWED' } }, 405);

  const url = new URL(req.url);
  let uid = url.searchParams.get('uid');

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch (_) {}

  if (!uid) uid = body.uid || body.userId;
  if (!uid) return json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing userId' } }, 401);

  const { projectName, subdomain, plan } = body;
  if (!projectName || !subdomain || !plan) {
    return json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing required fields: projectName, subdomain, plan' } }, 400);
  }

  // Validate subdomain format
  if (!/^[a-z0-9-]+$/.test(subdomain)) {
    return json({ success: false, error: { code: 'INVALID_SUBDOMAIN', message: 'Subdomain must only contain lowercase letters, numbers, and hyphens' } }, 400);
  }

  if (RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase())) {
    return json({ success: false, error: { code: 'RESERVED_SUBDOMAIN', message: 'This subdomain is reserved' } }, 400);
  }

  // Verify project exists in GitHub via main API
  const MAIN_API_URL = Deno.env.get('MAIN_API_URL') || 'https://api.softbridgelabs.in';
  let projectExists = false;
  try {
    const verifyRes = await fetch(`${MAIN_API_URL}/github/contents?userId=${encodeURIComponent(uid)}&projectName=${encodeURIComponent(projectName)}`);
    if (verifyRes.ok) {
      const verifyJson = await verifyRes.json();
      // The API returns { success: true, data: [...] }
      projectExists = verifyJson.success === true && Array.isArray(verifyJson.data);
    }
  } catch (e) {
    console.error('GitHub verify failed:', e);
  }

  if (!projectExists) {
    return json({ success: false, error: { code: 'PROJECT_NOT_FOUND', message: `Project "${projectName}" not found for this user` } }, 400);
  }

  // Check subdomain is not already taken
  const existingDomain = await kv.get(['deployments_by_subdomain', subdomain]);
  if (existingDomain.value) {
    return json({ success: false, error: { code: 'SUBDOMAIN_TAKEN', message: 'This subdomain is already in use' } }, 400);
  }

  // Enforce plan limits
  const limit = plan === 'premium' ? 10 : 1;
  let activeCount = 0;
  for await (const entry of kv.list({ prefix: ['deployments_by_user', uid] })) {
    if ((entry.value as any).status === 'active') activeCount++;
  }
  if (activeCount >= limit) {
    return json({ success: false, error: { code: 'DEPLOYMENT_LIMIT_REACHED', message: `${plan} plan allows a maximum of ${limit} active website(s)` } }, 400);
  }

  const deploymentId = `dep_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const now = new Date().toISOString();
  const deployment = {
    deploymentId,
    userId: uid,
    projectName,
    subdomain,
    plan,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    lastDeployedAt: now,
  };

  await kv.atomic()
    .set(['deployments_by_subdomain', subdomain], deployment)
    .set(['deployments_by_user', uid, deploymentId], deployment)
    .set(['deployments_by_id', deploymentId], deployment)
    .commit();

  return json({ success: true, deploymentId, url: `https://${subdomain}.sblab.xyz`, status: 'active' });
}

async function handleGetDeployments(req: Request, kv: Deno.Kv) {
  const uid = new URL(req.url).searchParams.get('uid');
  if (!uid) return json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing uid' } }, 401);
  const deployments: unknown[] = [];
  for await (const entry of kv.list({ prefix: ['deployments_by_user', uid] })) {
    deployments.push(entry.value);
  }
  return json({ success: true, deployments });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  const kv = await Deno.openKv();
  const url = new URL(req.url);
  const path = url.pathname;

  try {
    // Health check
    if (path === '/api/health') {
      return json({ success: true, version: '2.0.0' });
    }

    // Deploy a project
    if (path === '/api/deploy') {
      return await handleDeploy(req, kv);
    }

    // List deployments for a user
    if (path === '/api/deployments' && req.method === 'GET') {
      return await handleGetDeployments(req, kv);
    }

    // Get, redeploy, or delete a specific deployment
    const depMatch = path.match(/^\/api\/deployments\/(dep_[a-zA-Z0-9_]+)(\/redeploy)?$/);
    if (depMatch) {
      const id = depMatch[1];
      const isRedeploy = depMatch[2] === '/redeploy';
      const uid = url.searchParams.get('uid');
      if (!uid) return json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing uid' } }, 401);

      const entry = await kv.get(['deployments_by_id', id]);
      const dep = entry.value as any;
      if (!dep || dep.userId !== uid) return json({ success: false, error: { code: 'NOT_FOUND' } }, 404);

      if (isRedeploy && req.method === 'POST') {
        dep.lastDeployedAt = new Date().toISOString();
        await kv.atomic()
          .set(['deployments_by_subdomain', dep.subdomain], dep)
          .set(['deployments_by_user', uid, id], dep)
          .set(['deployments_by_id', id], dep)
          .commit();
        return json({ success: true, message: 'Redeployed', deploymentId: id });
      }

      if (req.method === 'GET') return json({ success: true, deployment: dep });

      if (req.method === 'DELETE') {
        await kv.atomic()
          .delete(['deployments_by_subdomain', dep.subdomain])
          .delete(['deployments_by_user', uid, id])
          .delete(['deployments_by_id', id])
          .commit();
        return json({ success: true, message: 'Deployment deleted' });
      }
    }

    // Internal: resolve subdomain → deployment metadata (used by Cloudflare Worker)
    const siteMatch = path.match(/^\/api\/sites\/([a-z0-9-]+)$/);
    if (siteMatch && req.method === 'GET') {
      const subdomain = siteMatch[1];
      const entry = await kv.get(['deployments_by_subdomain', subdomain]);
      const dep = entry.value as any;
      if (!dep || dep.status !== 'active') return json({ success: false, error: { code: 'NOT_FOUND' } }, 404);
      return json({ success: true, deploymentId: dep.deploymentId, userId: dep.userId, projectName: dep.projectName, subdomain: dep.subdomain, plan: dep.plan });
    }

    return json({ success: false, error: { code: 'NOT_FOUND' } }, 404);

  } catch (err) {
    console.error('Unhandled error:', err);
    return json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
  }
});
