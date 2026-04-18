'use strict';

/**
 * SQLite locally (file). PostgreSQL on Render when DATABASE_URL is set — data survives deploys.
 * Set FORCE_SQLITE=1 to ignore DATABASE_URL (emergency fallback if Postgres misbehaves on the host).
 */

const forceSqlite = String(process.env.FORCE_SQLITE || '').trim() === '1';
const hasPgUrl = process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim();

if (hasPgUrl && !forceSqlite) {
  module.exports = require('./db-postgres');
} else {
  if (hasPgUrl && forceSqlite) {
    console.warn('⚠️  FORCE_SQLITE=1 — using SQLite; DATABASE_URL is ignored.');
  }
  module.exports = require('./db-sqlite');
}
