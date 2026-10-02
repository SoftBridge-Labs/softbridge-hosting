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
    const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.protecgames.htmleditorpro';
    
    try {
      const url = new URL(request.url);
      const hostname = url.hostname;

      if (!hostname.endsWith('.sblab.xyz')) {
        return Response.redirect(playStoreUrl, 302);
      }

      const subdomain = hostname.replace('.sblab.xyz', '');

      // Fallbacks in case environment variables aren't set in Cloudflare dashboard
      const hostingApi = env.HOSTING_API_URL || 'https://sblab.xyz';
      const deploymentRes = await fetch(`${hostingApi}/api/sites/${subdomain}`);
      
      if (!deploymentRes.ok) {
        // Site not found -> Redirect to Play Store
        return Response.redirect(playStoreUrl, 302);
      }

      const deployment = await deploymentRes.json() as any;
      if (!deployment || !deployment.userId || !deployment.projectName) {
        return Response.redirect(playStoreUrl, 302);
      }

      let filePath = url.pathname;
      if (filePath === '/' || filePath === '') filePath = '/index.html';

      if (filePath.includes('..')) {
        return Response.redirect(playStoreUrl, 302);
      }

      const apiUrl = env.API_URL || 'https://api.softbridgelabs.in';
      const githubApiUrl = new URL(`${apiUrl}/github/contents`);
      githubApiUrl.searchParams.set('userId', deployment.userId);
      githubApiUrl.searchParams.set('projectName', deployment.projectName);
      githubApiUrl.searchParams.set('path', filePath.startsWith('/') ? filePath.substring(1) : filePath);

      const fileRes = await fetch(githubApiUrl.toString());

      if (!fileRes.ok) {
        if (fileRes.status === 404 && filePath !== '/404.html') {
          const fallbackUrl = new URL(`${apiUrl}/github/contents`);
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
        
        // Unavailable page -> Redirect to Play Store
        return Response.redirect(playStoreUrl, 302);
      }

      const extMatch = filePath.match(/\.[0-9a-z]+$/i);
      const ext = extMatch ? extMatch[0].toLowerCase() : '';
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      return new Response(fileRes.body, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=300',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (err) {
      // If ANY exception happens (missing env variables, network fail, etc) -> Redirect to Play Store
      console.error('Worker error:', err);
      return Response.redirect(playStoreUrl, 302);
    }
  }
};
