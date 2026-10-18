// Cloudflare Worker — serves HTML/CSS/JS from Deno Deploy + Prisma Postgres

export interface Env {
  HOSTING_API_URL?: string;
  API_URL?: string;
  RATE_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const playStoreUrl =
  "https://play.google.com/store/apps/details?id=com.protecgames.htmleditorpro";
const siteSuffix = ".sblab.xyz";
const rateLimitWindowMs = 60_000;
const rateLimitMaxRequests = 120;
const localRateLimits = new Map<string, number[]>();

function redirect(url: string) {
  return Response.redirect(url, 302);
}

function rateLimitedResponse() {
  return new Response("Too many requests", {
    status: 429,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Retry-After": "60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function isRateLimited(request: Request, env: Env): Promise<boolean> {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";

  if (env.RATE_LIMITER) {
    const result = await env.RATE_LIMITER.limit({ key: ip });
    return !result.success;
  }

  const now = Date.now();
  const recentRequests = (localRateLimits.get(ip) || []).filter(
    (timestamp) => now - timestamp < rateLimitWindowMs
  );

  if (recentRequests.length >= rateLimitMaxRequests) {
    localRateLimits.set(ip, recentRequests);
    return true;
  }

  recentRequests.push(now);
  localRateLimits.set(ip, recentRequests);

  if (localRateLimits.size > 10_000) {
    localRateLimits.forEach((timestamps, key) => {
      if (timestamps.every((timestamp) => now - timestamp >= rateLimitWindowMs)) {
        localRateLimits.delete(key);
      }
    });
  }

  return false;
}

function apiFailureResponse(status: number, message: string) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: WorkerExecutionContext
  ): Promise<Response> {
    try {
      if (await isRateLimited(request, env)) {
        return rateLimitedResponse();
      }

      const url = new URL(request.url);
      const hostname = url.hostname;

      if (!hostname.endsWith(siteSuffix)) {
        return redirect(playStoreUrl);
      }

      const subdomain = hostname.slice(0, -siteSuffix.length);
      if (!subdomain || subdomain.includes(".")) {
        return redirect(playStoreUrl);
      }

      const hostingApi =
        env.HOSTING_API_URL || env.API_URL || "https://api.softbridgelabs.in";

      // Fetch HTML/CSS/JS code from Deno Deploy API
      let codeRes = await fetch(
        `${hostingApi.replace(/\/$/, "")}/api/sites/${encodeURIComponent(
          subdomain
        )}/code`
      );

      if (codeRes.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        codeRes = await fetch(
          `${hostingApi.replace(/\/$/, "")}/api/sites/${encodeURIComponent(
            subdomain
          )}/code`
        );
      }

      if (!codeRes.ok) {
        return apiFailureResponse(
          codeRes.status === 404 ? 404 : 503,
          codeRes.status === 404 ? "Site not found" : "Site temporarily unavailable"
        );
      }

      let site: {
        success?: boolean;
        html?: string;
        css?: string;
        js?: string;
        plan?: string;
      };
      try {
        site = (await codeRes.json()) as typeof site;
      } catch {
        return apiFailureResponse(502, "Invalid site response");
      }

      if (!site.success) {
        return apiFailureResponse(404, "Site not found");
      }

      const fullHtml = buildPage(
        site.html || "",
        site.css || "",
        site.js || "",
        site.plan || "free"
      );

      const visitorId =
        request.headers.get("cf-connecting-ip") ||
        request.headers.get("x-forwarded-for") ||
        "unknown";
      const referrer = request.headers.get("referer") || url.searchParams.get("ref") || url.searchParams.get("utm_source") || "";
      const path = url.pathname;

      // Track analytics asynchronously
      ctx.waitUntil(
        fetch(`${hostingApi}/api/analytics/${subdomain}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            views: 1,
            visitorId,
            referrer,
            path,
            bandwidthBytes: new Blob([fullHtml]).size,
          }),
        }).catch(err => console.error("Analytics error:", err))
      );

      return new Response(fullHtml, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=60",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      console.error(
        JSON.stringify({
          message: "Worker error",
          error: err instanceof Error ? err.message : String(err),
        })
      );
      return apiFailureResponse(503, "Service temporarily unavailable");
    }
  },
};

const BRANDING_HTML = `
<style>
  #html-editor-pro-brand {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 2147483647;
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    color: #ffffff;
    padding: 10px 18px;
    border-radius: 999px;
    font: 600 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    text-decoration: none;
    box-shadow: 0 4px 20px rgba(124, 58, 237, 0.4);
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    animation: htmlProPulse 3s infinite;
  }

  #html-editor-pro-brand:hover {
    transform: translateY(-2px) scale(1.02);
    box-shadow: 0 6px 24px rgba(124, 58, 237, 0.6);
    background: linear-gradient(135deg, #4338ca 0%, #6d28d9 100%);
  }

  @keyframes htmlProPulse {
    0% {
      box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.4);
    }
    70% {
      box-shadow: 0 0 0 10px rgba(124, 58, 237, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(124, 58, 237, 0);
    }
  }
</style>
<a id="html-editor-pro-brand" href="https://play.google.com/store/apps/details?id=com.protecgames.htmleditorpro" target="_blank" rel="noopener">
  <span>✨</span> Made in HTML Editor PRO - with AI
</a>
`;

function buildPage(html: string, css: string, js: string, plan: string): string {
  // If the user provided a complete HTML document, inject CSS & JS into it
  if (html.includes("</head>") || html.includes("<html")) {
    let page = html;

    if (css.trim()) {
      page = page.replace(
        "</head>",
        `<style>\n${css}\n</style>\n</head>`
      );
    }

    let injectedScriptsAndBranding = "";
    if (js.trim()) {
      injectedScriptsAndBranding += `<script>\n${js}\n</script>\n`;
    }
    if (plan !== 'premium') {
      injectedScriptsAndBranding += BRANDING_HTML;
    }

    if (injectedScriptsAndBranding) {
      if (page.includes("</body>")) {
        page = page.replace("</body>", `${injectedScriptsAndBranding}\n</body>`);
      } else {
        page += injectedScriptsAndBranding;
      }
    }

    return page;
  }

  // Otherwise wrap as a standalone page
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Site</title>
  ${css.trim() ? `<style>\n${css}\n</style>` : ""}
</head>
<body>
  ${html}
  ${js.trim() ? `<script>\n${js}\n</script>` : ""}
  ${plan !== 'premium' ? BRANDING_HTML : ""}
</body>
</html>`;
}
