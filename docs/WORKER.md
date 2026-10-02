# Cloudflare Worker

The worker extracts the subdomain from the hostname, fetches the deployment metadata from our API, and then fetches the actual static files from the GitHub proxy (api.softbridgelabs.in).

```javascript
// worker/src/index.ts
// ...
```
