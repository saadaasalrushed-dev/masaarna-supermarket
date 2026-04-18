'use strict';

/**
 * SQLite locally (file). PostgreSQL on Render when DATABASE_URL is set — data survives deploys.
 */

if (process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim()) {
  module.exports = require('./db-postgres');
} else {
  module.exports = require('./db-sqlite');
}
