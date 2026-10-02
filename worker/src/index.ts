// @ts-nocheck
// Cloudflare Worker — serves HTML/CSS/JS from Deno Deploy + Prisma Postgres

export interface Env {
  HOSTING_API_URL: string;
}

const playStoreUrl =
  "https://play.google.com/store/apps/details?id=com.protecgames.htmleditorpro";

function redirect(url: string) {
  return Response.redirect(url, 302);
}

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    try {
      const url = new URL(request.url);
      const hostname = url.hostname;

      if (!hostname.endsWith(".sblab.xyz")) {
        return redirect(playStoreUrl);
      }

      const subdomain = hostname.replace(".sblab.xyz", "");
      const hostingApi = env.HOSTING_API_URL || "https://sblab.xyz";

      // Fetch HTML/CSS/JS code from Deno Deploy API
      const codeRes = await fetch(`${hostingApi}/api/sites/${subdomain}/code`);

      if (!codeRes.ok) {
        return redirect(playStoreUrl);
      }

      const site = (await codeRes.json()) as any;
      if (!site.success) return redirect(playStoreUrl);

      // Assemble a full HTML page combining html + css + js
      const fullHtml = buildPage(
        site.html || "",
        site.css || "",
        site.js || "",
        site.plan || "free"
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
      console.error("Worker error:", err);
      return redirect(playStoreUrl);
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
