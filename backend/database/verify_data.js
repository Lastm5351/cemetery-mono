const { Pool } = require('pg');
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

const baseConfig = DATABASE_URL
  ? { connectionString: DATABASE_URL }
  : {
      user: DB_USER,
      host: DB_HOST,
      database: DB_NAME,
      password: DB_PASSWORD,
      port: Number(DB_PORT) || 5432,
    };

const needsSSL =
  String(DB_SSL).toLowerCase() === 'true' ||
  (baseConfig.connectionString && /render\.com|neon\.tech/i.test(baseConfig.connectionString)) ||
  /render\.com|neon\.tech/i.test(DB_HOST || '');

const pool = new Pool({
  ...baseConfig,
  ssl: needsSSL ? { rejectUnauthorized: false } : false,
});

async function verifyData() {
  try {
    console.log('🔍 Verifying Cemetery Database...\n');

    // Check all tables
    console.log('📋 TABLES:');
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    tables.rows.forEach(row => console.log(`   - ${row.table_name}`));

    // Check row counts
    console.log('\n📊 ROW COUNTS:');
    const counts = await pool.query(`
      SELECT
        'users' as table_name, COUNT(*) as count FROM users
      UNION ALL
      SELECT 'plots', COUNT(*) FROM plots
      UNION ALL
      SELECT 'graves', COUNT(*) FROM graves
      UNION ALL
      SELECT 'burial_schedules', COUNT(*) FROM burial_schedules
      UNION ALL
      SELECT 'maintenance_requests', COUNT(*) FROM maintenance_requests
      UNION ALL
      SELECT 'visit_logs', COUNT(*) FROM visit_logs
      UNION ALL
      SELECT 'cemetery_sections', COUNT(*) FROM cemetery_sections
      UNION ALL
      SELECT 'qr_codes', COUNT(*) FROM qr_codes
      UNION ALL
      SELECT 'road_plots', COUNT(*) FROM road_plots
      UNION ALL
      SELECT 'building_plots', COUNT(*) FROM building_plots
      ORDER BY table_name
    `);
    counts.rows.forEach(row => console.log(`   ${row.table_name}: ${row.count} rows`));

    // Check users
    console.log('\n👥 USERS:');
    const users = await pool.query(`
      SELECT id, uid, username, email, role, created_at
      FROM users
      ORDER BY id
    `);
    if (users.rows.length > 0) {
      users.rows.forEach(user => {
        console.log(`   - ${user.username} (${user.email}) - Role: ${user.role} - UID: ${user.uid}`);
      });
    } else {
      console.log('   No users found');
    }

    // Check plots by type
    console.log('\n🗺️  PLOTS BY TYPE:');
    const plotTypes = await pool.query(`
      SELECT plot_type, COUNT(*) as count
      FROM plots
      GROUP BY plot_type
      ORDER BY plot_type
    `);
    if (plotTypes.rows.length > 0) {
      plotTypes.rows.forEach(row => {
        console.log(`   ${row.plot_type}: ${row.count} plots`);
      });
    } else {
      console.log('   No plots found');
    }

    // Check PostGIS
    console.log('\n🌍 POSTGIS:');
    const postgis = await pool.query('SELECT PostGIS_Version() as version');
    console.log(`   Version: ${postgis.rows[0].version}`);

    // Check cemetery bounds
    console.log('\n📍 CEMETERY BOUNDS:');
    const bounds = await pool.query('SELECT * FROM get_cemetery_bounds()');
    console.log(`   Min Lat: ${bounds.rows[0].min_lat}`);
    console.log(`   Max Lat: ${bounds.rows[0].max_lat}`);
    console.log(`   Min Lng: ${bounds.rows[0].min_lng}`);
    console.log(`   Max Lng: ${bounds.rows[0].max_lng}`);

    console.log('\n✅ Verification complete!\n');

  } catch (error) {
    console.error('❌ Verification error:', error.message);
  } finally {
    await pool.end();
  }
}

verifyData();
