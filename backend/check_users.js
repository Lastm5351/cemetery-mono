const { Pool } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;
const baseConfig = DATABASE_URL
  ? { connectionString: DATABASE_URL }
  : {
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: Number(process.env.DB_PORT) || 5432,
    };

const needsSSL =
  String(process.env.DB_SSL).toLowerCase() === 'true' ||
  (baseConfig.connectionString && /render\.com|neon\.tech/i.test(baseConfig.connectionString));

const pool = new Pool({
  ...baseConfig,
  ...(needsSSL ? { ssl: { rejectUnauthorized: false } } : {}),
});

async function checkUsers() {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY created_at');
    console.log('\n📊 ALL USERS IN DATABASE:\n');
    console.log('Total users:', result.rows.length);
    console.log('\n');

    result.rows.forEach((user, i) => {
      console.log(`User #${i + 1}:`);
      console.log(`  ID: ${user.id}`);
      console.log(`  UID: ${user.uid}`);
      console.log(`  Username: ${user.username}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Role: ${user.role}`);
      console.log(`  First Name: ${user.first_name}`);
      console.log(`  Last Name: ${user.last_name}`);
      console.log(`  Phone: ${user.phone || 'N/A'}`);
      console.log(`  Address: ${user.address || 'N/A'}`);
      console.log(`  Active: ${user.is_active}`);
      console.log(`  Created: ${user.created_at}`);
      console.log(`  Updated: ${user.updated_at}`);
      console.log('');
    });

    // Count by role
    const roleCount = await pool.query('SELECT role, COUNT(*) as count FROM users GROUP BY role');
    console.log('👥 USERS BY ROLE:');
    roleCount.rows.forEach(row => {
      console.log(`  ${row.role}: ${row.count} user(s)`);
    });

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

checkUsers();
