# HTML Editor PRO - Hosting Server

This repository contains the deployment and hosting infrastructure for **HTML Editor PRO**, enabling users to publish their GitHub-backed web projects to a live public subdomain (e.g., `myportfolio.sblab.xyz`).

## Architecture

The system is split into two primary layers to balance secure metadata management and ultra-fast global edge delivery:

1. **Deployment API (Next.js & Deno KV)**
   - Built with Next.js (App Router) and designed to be deployed on **Deno Deploy**.
   - Manages subdomain reservations, checks Free/Premium user limits, and stores deployment metadata using **Deno KV**.
   - Handles Firebase Authentication to secure user deployments.
   - *Note: GitHub remains the single source of truth for user files. This server only stores metadata (e.g. mapping `myportfolio` -> `userId / projectName`).*

2. **Edge Proxy (Cloudflare Worker)**
   - Runs globally on Cloudflare's Edge network (`worker/src/index.ts`).
   - Receives all incoming wildcard traffic for `*.sblab.xyz`.
   - Resolves the requested subdomain using the Deployment API.
   - Fetches and streams the static assets directly from the main API (`api.softbridgelabs.in/github/contents`).

---

## Cloudflare Setup

To route wildcard subdomains to your users' websites, you must configure both Cloudflare DNS and the Cloudflare Worker.

### 1. Wildcard DNS
In your Cloudflare Dashboard for `sblab.xyz`:
- Go to **DNS > Records**.
- Add a **CNAME** record:
  - Name: `*`
  - Target: `<your-worker-name>.<your-cloudflare-subdomain>.workers.dev` (or route it directly to the Worker via "Worker Routes" in the dash).
  - Proxy status: **Proxied (Orange Cloud)**.

### 2. Worker Configuration
- The worker code is located in the `/worker` directory.
- It intercepts wildcard traffic, parses the hostname (`[subdomain].sblab.xyz`), and queries the Next.js API (`/api/sites/[subdomain]`) to find the associated GitHub project coordinates.
- It automatically applies MIME types, prevents directory traversal, and provides smart 404 handling.

### 3. Deploying the Worker
Navigate into the worker directory and use Wrangler:
```bash
cd worker
npm install
npx wrangler deploy
```

---

## Running the API Locally

1. Create your environment file:
   ```bash
   cp .sample.env .env
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server (via Deno to support `Deno.openKv()`):
   ```bash
   deno run -A --unstable-kv npm:next dev
   ```

*Note: Since the project uses Deno KV natively, deploying the Next.js app to **Deno Deploy** will automatically connect the database without requiring any connection strings.*

## API Reference
Please see [docs/API.md](./docs/API.md) for detailed Request/Response payloads, including `POST /deploy`, `GET /deployments`, and `POST /deployments/:id/redeploy`.
