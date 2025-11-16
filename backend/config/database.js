// backend/config/database.js
const { Pool } = require('pg');
require('dotenv').config();

const {
  DB_USER,
  DB_HOST,
  DB_NAME,
  DB_PASSWORD,
  DB_PORT,
  DATABASE_URL,   // optional: if you prefer a single URL
  DB_SSL,         // "true" to force SSL
} = process.env;

// If you use individual env vars (DB_*), build config:
const baseConfig = DATABASE_URL
  ? { connectionString: DATABASE_URL }
  : {
      user: DB_USER,
      host: DB_HOST,
      database: DB_NAME,
      password: DB_PASSWORD,
      port: Number(DB_PORT) || 5432,
    };

// Decide if SSL is needed (Render, Neon, etc.) or forced via DB_SSL
const needsSSL =
  String(DB_SSL).toLowerCase() === 'true' ||
  (baseConfig.connectionString && /render\.com|neon\.tech/i.test(baseConfig.connectionString)) ||
  /render\.com|neon\.tech/i.test(DB_HOST || '');

const pool = new Pool({
  ...baseConfig,
  // Render requires SSL; local Postgres typically does not
  ssl: needsSSL ? { rejectUnauthorized: false } : false,
});

// Test the connection
pool.on('connect', () => console.log('✅ Connected to PostgreSQL database'));
pool.on('error', (err) => console.error('❌ Database connection error:', err));

module.exports = pool;
