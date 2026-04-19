/**
 * Menjalankan migrasi ENUM role superadmin (aman dijalankan berulang jika ENUM sudah sama).
 * Usage: node scripts/migrate-superadmin-role.js
 */
require('dotenv').config();
const { pool } = require('../utils/db');

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      ALTER TABLE users
      MODIFY COLUMN role ENUM('superadmin', 'admin') NOT NULL DEFAULT 'admin'
    `);
    console.log('OK: ALTER TABLE users … role ENUM(superadmin, admin)');

    const [r] = await conn.query(
      `UPDATE users SET role = 'superadmin' WHERE email = 'admin@clinic.com' LIMIT 1`
    );
    console.log('OK: UPDATE admin@clinic.com → superadmin (affected:', r.affectedRows, ')');
    console.log('✅ Migrasi superadmin selesai.');
  } finally {
    conn.release();
  }
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Migrasi gagal:', err.message);
  if (err.sqlMessage) console.error(err.sqlMessage);
  process.exit(1);
});
