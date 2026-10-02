export interface Env {
  API_URL: string;
  HOSTING_API_URL: string;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
};

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // We only serve *.sblab.xyz
    if (!hostname.endsWith('.sblab.xyz')) {
      return new Response('Not Found', { status: 404 });
    }

    const subdomain = hostname.replace('.sblab.xyz', '');

    // 1. Get deployment metadata
    // We assume HOSTING_API_URL is the Next.js server we are building (e.g. https://hosting.softbridgelabs.in)
    const deploymentRes = await fetch(`${env.HOSTING_API_URL}/api/sites/${subdomain}`);
    if (!deploymentRes.ok) {
      if (deploymentRes.status === 404) {
        return new Response('Website not found', { status: 404 });
      }
      return new Response('Internal Server Error', { status: 500 });
    }

    const deployment = await deploymentRes.json() as any;
    if (!deployment || !deployment.userId || !deployment.projectName) {
      return new Response('Invalid deployment', { status: 500 });
    }

    // 2. Determine file path
    let filePath = url.pathname;
    if (filePath === '/' || filePath === '') {
      filePath = '/index.html';
    }

    // Security: prevent directory traversal
    if (filePath.includes('..')) {
      return new Response('Forbidden', { status: 403 });
    }

    // 3. Fetch from GitHub via main API
    // GET /github/contents?userId=...&projectName=...&path=...
    const githubApiUrl = new URL(`${env.API_URL}/github/contents`);
    githubApiUrl.searchParams.set('userId', deployment.userId);
    githubApiUrl.searchParams.set('projectName', deployment.projectName);
    githubApiUrl.searchParams.set('path', filePath.startsWith('/') ? filePath.substring(1) : filePath);

    const fileRes = await fetch(githubApiUrl.toString());

    if (!fileRes.ok) {
      if (fileRes.status === 404 && filePath !== '/404.html') {
        // Try fallback 404.html
        const fallbackUrl = new URL(`${env.API_URL}/github/contents`);
        fallbackUrl.searchParams.set('userId', deployment.userId);
        fallbackUrl.searchParams.set('projectName', deployment.projectName);
        fallbackUrl.searchParams.set('path', '404.html');
        
        const fallbackRes = await fetch(fallbackUrl.toString());
        if (fallbackRes.ok) {
          return new Response(fallbackRes.body, {
            status: 404,
            headers: {
              'Content-Type': 'text/html',
              'Cache-Control': 'public, max-age=300'
            }
          });
        }
      }
      return new Response('Not Found', { status: 404 });
    }

    // 4. Determine content type
    const extMatch = filePath.match(/\.[0-9a-z]+$/i);
    const ext = extMatch ? extMatch[0].toLowerCase() : '';
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // 5. Return file
    return new Response(fileRes.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300', // 5 mins cache
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
