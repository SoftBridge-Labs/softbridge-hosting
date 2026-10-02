# Cloudflare Setup

## Wildcard DNS
Configure a CNAME record for `*.sblab.xyz` pointing to the Cloudflare Worker.

## Worker Configuration
- Set up route: `*.sblab.xyz/*`
- Handle subdomains dynamically.
