const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const {
  DB_USER,
  DB_HOST,
  DB_NAME,
  DB_PASSWORD,
  DB_PORT,
  DATABASE_URL,
  DB_SSL,
} = process.env;

// Use DATABASE_URL if available, otherwise use individual vars
const baseConfig = DATABASE_URL
  ? { connectionString: DATABASE_URL }
  : {
      user: DB_USER,
      host: DB_HOST,
      database: DB_NAME,
      password: DB_PASSWORD,
      port: Number(DB_PORT) || 5432,
    };

// Enable SSL for cloud databases (Neon, Render, etc.)
const needsSSL =
  String(DB_SSL).toLowerCase() === 'true' ||
  (baseConfig.connectionString && /render\.com|neon\.tech/i.test(baseConfig.connectionString)) ||
  /render\.com|neon\.tech/i.test(DB_HOST || '');

const pool = new Pool({
  ...baseConfig,
  ssl: needsSSL ? { rejectUnauthorized: false } : false,
});

async function initializeDatabase() {
  try {
    console.log('🗄️ Initializing Cemetery Database...');
    
    // Read and execute the schema
    const schemaSQL = fs.readFileSync(
      path.join(__dirname, 'improved_schema.sql'), 
      'utf8'
    );
    
    await pool.query(schemaSQL);
    console.log('✅ Database schema created successfully');
    
    // Test PostGIS functionality
    const testResult = await pool.query('SELECT PostGIS_Version() as version');
    console.log('✅ PostGIS version:', testResult.rows[0].version);
    
    // Test cemetery bounds function
    const boundsResult = await pool.query('SELECT * FROM get_cemetery_bounds()');
    console.log('✅ Cemetery bounds:', boundsResult.rows[0]);
    
    // Count plots
    const plotCount = await pool.query('SELECT COUNT(*) as total FROM plots');
    console.log('✅ Total plots inserted:', plotCount.rows[0].total);
    
    console.log('🎉 Cemetery database initialization complete!');
    
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  } finally {
    await pool.end();
  }
}

initializeDatabase();