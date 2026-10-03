# SoftBridge Hosting Admin API Documentation

These endpoints are used to manage the complete server. All admin endpoints require an `x-admin-key` header to be passed with the request. The expected key value is configured via the `ADMIN_KEY` environment variable.

**Base URL (Admin):** `https://sblab.xyz/api/admin`

---

### 1. `GET /api/admin/stats`
Get aggregated statistics across the entire platform.

**Headers:**
`x-admin-key: <your_admin_secret>`

**Response (Success):**
```json
{
  "success": true,
  "stats": {
    "totalSites": 150,
    "totalUsers": 42,
    "activeSites": 145
  }
}
```

---

### 2. `GET /api/admin/sites`
List all sites hosted on the platform (supports pagination).

**Query Parameters:**
- `limit` (optional): Number of sites to return (default 50)
- `offset` (optional): Offset for pagination (default 0)

**Headers:**
`x-admin-key: <your_admin_secret>`

**Response (Success):**
```json
{
  "success": true,
  "sites": [
    {
      "id": "site_123",
      "userId": "user_uid",
      "projectName": "My Awesome Site",
      "subdomain": "test",
      "plan": "free",
      "status": "active",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

---

### 3. `PATCH /api/admin/sites/:subdomain`
Update a specific site's status or plan (e.g., suspend a site for abuse).

**Headers:**
`x-admin-key: <your_admin_secret>`

**Request:**
```json
{
  "status": "suspended",
  "plan": "premium"
}
```
*(Both fields are optional, you can update just one)*

**Response (Success):**
```json
{
  "success": true,
  "site": {
    "id": "site_123",
    "userId": "user_uid",
    "projectName": "My Awesome Site",
    "subdomain": "test",
    "plan": "premium",
    "status": "suspended"
  }
}
```

---

### 4. `DELETE /api/admin/sites/:subdomain`
Permanently delete a site from the Postgres database and clear its associated KV metadata cache.

**Headers:**
`x-admin-key: <your_admin_secret>`

**Response (Success):**
```json
{
  "success": true,
  "message": "Site deleted",
  "deleted": true
}
```
