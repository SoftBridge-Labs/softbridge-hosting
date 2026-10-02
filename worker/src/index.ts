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
      const fullHtml = buildPage(site.html || "", site.css || "", site.js || "");

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

function buildPage(html: string, css: string, js: string): string {
  // If the user provided a complete HTML document, inject CSS & JS into it
  if (html.includes("</head>") || html.includes("<html")) {
    let page = html;

    if (css.trim()) {
      page = page.replace(
        "</head>",
        `<style>\n${css}\n</style>\n</head>`
      );
    }
    if (js.trim()) {
      page = page.replace(
        "</body>",
        `<script>\n${js}\n</script>\n</body>`
      );
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
</body>
</html>`;
}
