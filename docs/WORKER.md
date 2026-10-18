# Cloudflare Worker

The worker extracts the subdomain from the hostname and fetches the deployed HTML/CSS/JS from the Next.js deployment API at `https://sblab.xyz`.

The Worker API endpoint is configured with `HOSTING_API_URL` (currently
`https://sblab.xyz`). Keep this value pointed at the deployment API. The root
hostname is intentionally used instead of `*.sblab.xyz`, so requests do not
route back through the wildcard Worker.

Requests are limited to 120 per IP per minute. For multi-isolate/global
enforcement, provision a Cloudflare Rate Limiting binding named `RATE_LIMITER`;
the Worker uses its `limit({ key: ip })` result when available and otherwise
uses a bounded per-isolate fallback.

```javascript
// worker/src/index.ts
// ...
```
