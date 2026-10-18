# Cloudflare Worker

The worker extracts the subdomain from the hostname, fetches the deployment metadata from our API, and then fetches the actual static files from the GitHub proxy (api.softbridgelabs.in).

The Worker API endpoint is configured with `HOSTING_API_URL` (currently
`https://api.softbridgelabs.in`). Keep this value pointed at the deployment API,
not at the wildcard site domain; otherwise metadata requests can route back
through the Worker and produce a misleading Play Store redirect.

Requests are limited to 120 per IP per minute. For multi-isolate/global
enforcement, provision a Cloudflare Rate Limiting binding named `RATE_LIMITER`;
the Worker uses its `limit({ key: ip })` result when available and otherwise
uses a bounded per-isolate fallback.

```javascript
// worker/src/index.ts
// ...
```
