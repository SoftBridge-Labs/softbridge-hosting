// @ts-nocheck
// Deno Deploy entrypoint — SoftBridge Hosting API
// Stores site code (HTML/CSS/JS) in Prisma Postgres
// Metadata (subdomain ownership, plan limits) stored in Deno KV

import { PrismaClient } from "npm:@prisma/client";

const RESERVED_SUBDOMAINS = [
  "www", "api", "admin", "app", "auth", "login", "support", "docs",
  "status", "dashboard", "billing", "mail", "cdn", "security",
  "sblab", "softbridge", "htmlpro",
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function errMsg(body: Record<string, any>, fallback: string): string {
  const e = body?.error;
  return (e && typeof e === "object" ? e.message : body?.message) ?? fallback;
}

// Lazy singleton so Deno Deploy cold starts stay fast
let _prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({
      datasourceUrl: Deno.env.get("DATABASE_URL"),
    });
  }
  return _prisma;
}

async function handleDeploy(req: Request, kv: Deno.Kv) {
  if (req.method !== "POST") {
    return json({ success: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405);
  }

  const url = new URL(req.url);
  let uid = url.searchParams.get("uid");

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch (_) {}

  if (!uid) uid = body.uid || body.userId;
  if (!uid) {
    return json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing userId" } }, 401);
  }

  const { projectName, subdomain, plan = "free", html = "", css = "", js = "" } = body;
  if (!projectName || !subdomain) {
    return json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Missing required fields: projectName, subdomain" },
    }, 400);
  }

  // Validate subdomain
  if (!/^[a-z0-9-]+$/.test(subdomain)) {
    return json({
      success: false,
      error: { code: "INVALID_SUBDOMAIN", message: "Subdomain must only contain lowercase letters, numbers, and hyphens" },
    }, 400);
  }
  if (RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase())) {
    return json({ success: false, error: { code: "RESERVED_SUBDOMAIN", message: "This subdomain is reserved" } }, 400);
  }
  if (!html.trim() && !css.trim() && !js.trim()) {
    return json({ success: false, error: { code: "EMPTY_CODE", message: "Please provide at least some HTML content" } }, 400);
  }

  // Check if subdomain is already taken in KV (fast lookup)
  const existing = await kv.get(["sites_by_subdomain", subdomain]);
  if (existing.value && (existing.value as any).userId !== uid) {
    return json({ success: false, error: { code: "SUBDOMAIN_TAKEN", message: "This subdomain is already in use" } }, 400);
  }

  // Plan limits
  const limit = plan === "premium" ? 10 : 1;
  let activeCount = 0;
  for await (const entry of kv.list({ prefix: ["sites_by_user", uid] })) {
    if ((entry.value as any).status === "active") activeCount++;
  }
  if (activeCount >= limit && !existing.value) {
    return json({
      success: false,
      error: { code: "LIMIT_REACHED", message: `${plan} plan allows max ${limit} site(s)` },
    }, 400);
  }

  const prisma = getPrisma();
  const now = new Date();

  // Upsert site in Postgres (create or update code)
  const site = await prisma.site.upsert({
    where: { subdomain },
    create: { subdomain, userId: uid, projectName, plan, html, css, js, status: "active" },
    update: { html, css, js, projectName, plan, updatedAt: now, lastDeployedAt: now },
  });

  // Store metadata in KV for fast subdomain lookups
  const meta = {
    siteId: site.id,
    userId: uid,
    subdomain,
    projectName,
    plan,
    status: "active",
    createdAt: site.createdAt.toISOString(),
    lastDeployedAt: now.toISOString(),
  };
  await kv.atomic()
    .set(["sites_by_subdomain", subdomain], meta)
    .set(["sites_by_user", uid, subdomain], meta)
    .commit();

  return json({ success: true, deploymentId: site.id, url: `https://${subdomain}.sblab.xyz`, status: "active" });
}

async function handleGetSiteCode(subdomain: string, kv: Deno.Kv) {
  const meta = await kv.get(["sites_by_subdomain", subdomain]);
  if (!meta.value || (meta.value as any).status !== "active") {
    return json({ success: false, error: { code: "NOT_FOUND" } }, 404);
  }

  const prisma = getPrisma();
  const site = await prisma.site.findUnique({ where: { subdomain } });
  if (!site || site.status !== "active") {
    return json({ success: false, error: { code: "NOT_FOUND" } }, 404);
  }

  return json({
    success: true,
    subdomain: site.subdomain,
    userId: site.userId,
    projectName: site.projectName,
    plan: site.plan,
    html: site.html,
    css: site.css,
    js: site.js,
  });
}

async function handleGetDeployments(uid: string, kv: Deno.Kv) {
  const sites: unknown[] = [];
  for await (const entry of kv.list({ prefix: ["sites_by_user", uid] })) {
    sites.push(entry.value);
  }
  return json({ success: true, deployments: sites });
}

async function handleDelete(subdomain: string, uid: string, kv: Deno.Kv) {
  const meta = await kv.get(["sites_by_subdomain", subdomain]);
  if (!meta.value || (meta.value as any).userId !== uid) {
    return json({ success: false, error: { code: "NOT_FOUND" } }, 404);
  }

  const prisma = getPrisma();
  await prisma.site.update({ where: { subdomain }, data: { status: "deleted" } });
  await kv.atomic()
    .delete(["sites_by_subdomain", subdomain])
    .delete(["sites_by_user", uid, subdomain])
    .commit();

  return json({ success: true, message: "Site deleted" });
}

async function handleRedeploy(subdomain: string, uid: string, kv: Deno.Kv) {
  const meta = await kv.get(["sites_by_subdomain", subdomain]);
  if (!meta.value || (meta.value as any).userId !== uid) {
    return json({ success: false, error: { code: "NOT_FOUND" } }, 404);
  }

  const prisma = getPrisma();
  const site = await prisma.site.update({
    where: { subdomain },
    data: { lastDeployedAt: new Date() },
  });

  const updated = { ...(meta.value as any), lastDeployedAt: site.lastDeployedAt.toISOString() };
  await kv.atomic()
    .set(["sites_by_subdomain", subdomain], updated)
    .set(["sites_by_user", uid, subdomain], updated)
    .commit();

  return json({ success: true, message: "Redeployed", url: `https://${subdomain}.sblab.xyz` });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const kv = await Deno.openKv();
  const url = new URL(req.url);
  const path = url.pathname;

  try {
    // Health
    if (path === "/api/health") {
      return json({ success: true, version: "3.0.0" });
    }

    // Deploy (create/update site with code)
    if (path === "/api/deploy") {
      return await handleDeploy(req, kv);
    }

    // List deployments for a user
    if (path === "/api/deployments" && req.method === "GET") {
      const uid = url.searchParams.get("uid");
      if (!uid) return json({ success: false, error: { code: "UNAUTHORIZED" } }, 401);
      return await handleGetDeployments(uid, kv);
    }

    // Get site code — used by Cloudflare Worker to serve HTML/CSS/JS
    const siteCodeMatch = path.match(/^\/api\/sites\/([a-z0-9-]+)\/code$/);
    if (siteCodeMatch && req.method === "GET") {
      return await handleGetSiteCode(siteCodeMatch[1], kv);
    }

    // Get site metadata
    const siteMetaMatch = path.match(/^\/api\/sites\/([a-z0-9-]+)$/);
    if (siteMetaMatch && req.method === "GET") {
      const subdomain = siteMetaMatch[1];
      const meta = await kv.get(["sites_by_subdomain", subdomain]);
      if (!meta.value) return json({ success: false, error: { code: "NOT_FOUND" } }, 404);
      return json({ success: true, ...(meta.value as any) });
    }

    // Delete a site
    const deleteMatch = path.match(/^\/api\/sites\/([a-z0-9-]+)$/);
    if (deleteMatch && req.method === "DELETE") {
      const uid = url.searchParams.get("uid");
      if (!uid) return json({ success: false, error: { code: "UNAUTHORIZED" } }, 401);
      return await handleDelete(deleteMatch[1], uid, kv);
    }

    // Redeploy
    const redeployMatch = path.match(/^\/api\/sites\/([a-z0-9-]+)\/redeploy$/);
    if (redeployMatch && req.method === "POST") {
      const uid = url.searchParams.get("uid");
      if (!uid) return json({ success: false, error: { code: "UNAUTHORIZED" } }, 401);
      return await handleRedeploy(redeployMatch[1], uid, kv);
    }

    return json({ success: false, error: { code: "NOT_FOUND" } }, 404);
  } catch (err) {
    console.error("Unhandled error:", err);
    return json({ success: false, error: { code: "INTERNAL_ERROR", message: String(err) } }, 500);
  }
});
