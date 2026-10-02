# SoftBridge Hosting API Documentation

**Base URL (Deno Deploy API):** `https://sblab.xyz`

---

### 1. `POST /api/deploy`
Create a new deployment or update an existing deployment's code.

**Request:**
```json
{
  "userId": "firebase_user_uid",
  "projectName": "My Awesome Site",
  "subdomain": "test",
  "plan": "free",
  "html": "<h1>Hello World!</h1>",
  "css": "h1 { color: red; }",
  "js": "console.log('Running');"
}
```

**Response (Success):**
```json
{
  "success": true,
  "deploymentId": "clqweasdzxcv...",
  "url": "https://test.sblab.xyz",
  "status": "active"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": {
    "code": "SUBDOMAIN_TAKEN",
    "message": "This subdomain is already in use"
  }
}
```

---

### 2. `GET /api/deployments`
List all deployments for a specific user.

**Request:**
`GET /api/deployments?uid=firebase_user_uid`

**Response:**
```json
{
  "success": true,
  "deployments": [
    {
      "siteId": "clqweasdzxcv...",
      "userId": "firebase_user_uid",
      "subdomain": "test",
      "projectName": "My Awesome Site",
      "plan": "free",
      "status": "active",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "lastDeployedAt": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

---

### 3. `DELETE /api/sites/:subdomain`
Delete a site (sets status to deleted and clears metadata).

**Request:**
`DELETE /api/sites/test?uid=firebase_user_uid`

**Response:**
```json
{
  "success": true,
  "message": "Site deleted"
}
```

---

### 4. `POST /api/sites/:subdomain/redeploy`
Update the `lastDeployedAt` timestamp for a site (forces Cloudflare cache flush logic if implemented).

**Request:**
`POST /api/sites/test/redeploy?uid=firebase_user_uid`

**Response:**
```json
{
  "success": true,
  "message": "Redeployed",
  "url": "https://test.sblab.xyz"
}
```

---

### Internal Cloudflare Worker Endpoints

**`GET /api/sites/:subdomain/code`**
Used by the edge worker to fetch the HTML/CSS/JS for rendering a subdomain.

**Response:**
```json
{
  "success": true,
  "subdomain": "test",
  "userId": "firebase_user_uid",
  "projectName": "My Awesome Site",
  "plan": "free",
  "html": "...",
  "css": "...",
  "js": "..."
}
```
