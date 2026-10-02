# API Reference

All API requests (except `GET /health` and `GET /sites/:subdomain`) must be authenticated with a Firebase ID token.

## Endpoints

### 1. `GET /health`
Health check.

**Request:**
```bash
curl http://localhost:3000/api/health
```

**Response:**
```json
{
  "success": true
}
```

### 2. `POST /deploy`
Deploy a project.

**Request:**
```bash
curl -X POST http://localhost:3000/api/deploy \
  -H "Authorization: Bearer <firebase_id_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "projectName": "my-portfolio",
    "subdomain": "myportfolio",
    "plan": "free"
  }'
```

**Response:**
```json
{
  "success": true,
  "deploymentId": "dep_123456789",
  "url": "https://myportfolio.sblab.xyz",
  "status": "active"
}
```

### 3. `GET /deployments`
Get user deployments.

**Request:**
```bash
curl -H "Authorization: Bearer <firebase_id_token>" http://localhost:3000/api/deployments
```

**Response:**
```json
{
  "success": true,
  "deployments": [
    {
      "deploymentId": "dep_123456789",
      "userId": "user123",
      "projectName": "my-portfolio",
      "subdomain": "myportfolio",
      "plan": "free",
      "status": "active",
      "createdAt": "2024-03-02T18:30:00.000Z",
      "lastDeployedAt": "2024-03-02T18:30:00.000Z"
    }
  ]
}
```

### 4. `GET /deployments/:id`
Get specific deployment.

**Request:**
```bash
curl -H "Authorization: Bearer <firebase_id_token>" http://localhost:3000/api/deployments/dep_123456789
```

**Response:**
```json
{
  "success": true,
  "deployment": {
    "deploymentId": "dep_123456789",
    "userId": "user123",
    "projectName": "my-portfolio",
    "subdomain": "myportfolio",
    "plan": "free",
    "status": "active",
    "createdAt": "2024-03-02T18:30:00.000Z",
    "lastDeployedAt": "2024-03-02T18:30:00.000Z"
  }
}
```

### 5. `POST /deployments/:id/redeploy`
Trigger redeploy.

**Request:**
```bash
curl -X POST -H "Authorization: Bearer <firebase_id_token>" http://localhost:3000/api/deployments/dep_123456789/redeploy
```

**Response:**
```json
{
  "success": true,
  "message": "Redeployed successfully",
  "deploymentId": "dep_123456789"
}
```

### 6. `DELETE /deployments/:id`
Delete a deployment.

**Request:**
```bash
curl -X DELETE -H "Authorization: Bearer <firebase_id_token>" http://localhost:3000/api/deployments/dep_123456789
```

**Response:**
```json
{
  "success": true,
  "message": "Deployment deleted"
}
```

### 7. `GET /sites/:subdomain`
Internal: get site files or metadata (used by Cloudflare Worker).

**Request:**
```bash
curl http://localhost:3000/api/sites/myportfolio
```

**Response:**
```json
{
  "success": true,
  "deploymentId": "dep_123456789",
  "userId": "user123",
  "projectName": "my-portfolio",
  "subdomain": "myportfolio",
  "plan": "free"
}
```
