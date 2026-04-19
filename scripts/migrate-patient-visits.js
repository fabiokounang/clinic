/**
 * Membuat tabel patient_visits dan backfill kunjungan #1 dari data pasien yang ada.
 * Membutuhkan .env (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT opsional).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { readDbConfig } = require('../utils/db');

async function main() {
  const sqlPath = path.join(__dirname, '..', 'utils', 'migrations', 'add_patient_visits.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('Berkas tidak ditemukan:', sqlPath);
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const cfg = readDbConfig();
  const conn = await mysql.createConnection({
    ...cfg,
    multipleStatements: true
  });
  try {
    await conn.query(sql);
    console.log('Selesai: tabel patient_visits siap (termasuk backfill kunjungan #1 jika perlu).');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Gagal menjalankan migrasi patient_visits:', err.message || err);
  if (process.env.NODE_ENV !== 'production' && err.sql) {
    console.error('SQL:', err.sql);
  }
  process.exit(1);
});
