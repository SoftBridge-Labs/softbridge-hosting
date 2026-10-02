import { Pool } from 'pg';

const globalForPg = global as unknown as { pool: Pool };

export const pool =
  globalForPg.pool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== 'production') globalForPg.pool = pool;

// Auto-create table if not exists (so no migrations are needed)
pool.query(`
  CREATE TABLE IF NOT EXISTS "Site" (
    id TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    subdomain TEXT UNIQUE NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    html TEXT,
    css TEXT,
    js TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "lastDeployedAt" TIMESTAMP NOT NULL DEFAULT NOW()
  );
`).catch(console.error);
