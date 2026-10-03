const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  try {
    await pool.query('ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS files JSONB DEFAULT \'[]\'');
    console.log('Added files column');
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
main();
