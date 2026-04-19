/**
 * Menambahkan kolom klinis pada `patients` jika belum ada (aman dijalankan berulang).
 * Menyelesaikan error: Unknown column 'medications_json' / ecg_results / dll.
 *
 * Usage: npm run migrate:patient-clinical
 */
require('dotenv').config();
const { pool } = require('../utils/db');

const COLUMNS = [
  {
    name: 'medications_json',
    fragment: 'ADD COLUMN `medications_json` JSON DEFAULT NULL AFTER `medications`'
  },
  {
    name: 'ecg_results',
    fragment: 'ADD COLUMN `ecg_results` JSON DEFAULT NULL AFTER `medications_json`'
  },
  {
    name: 'echo_results',
    fragment: 'ADD COLUMN `echo_results` JSON DEFAULT NULL AFTER `ecg_results`'
  },
  {
    name: 'lab_results',
    fragment: 'ADD COLUMN `lab_results` JSON DEFAULT NULL AFTER `echo_results`'
  },
  {
    name: 'appointments_json',
    fragment: 'ADD COLUMN `appointments_json` JSON DEFAULT NULL AFTER `lab_results`'
  },
  {
    name: 'clinical_notes',
    fragment: 'ADD COLUMN `clinical_notes` TEXT DEFAULT NULL AFTER `appointments_json`'
  }
];

async function columnExists(conn, dbName, tableName, columnName) {
  const [rows] = await conn.query(
    `
    SELECT COUNT(*) AS c
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    `,
    [dbName, tableName, columnName]
  );
  return Number(rows[0].c) > 0;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    const [[dbRow]] = await conn.query('SELECT DATABASE() AS db');
    const dbName = dbRow && dbRow.db ? String(dbRow.db) : process.env.DB_NAME;
    if (!dbName) {
      throw new Error('Tidak bisa menentukan nama database (DATABASE() kosong, set DB_NAME di .env).');
    }

    console.log('Database:', dbName);

    for (const col of COLUMNS) {
      const exists = await columnExists(conn, dbName, 'patients', col.name);
      if (exists) {
        console.log(`— Kolom sudah ada: ${col.name}`);
        continue;
      }
      const sql = `ALTER TABLE patients ${col.fragment}`;
      await conn.query(sql);
      console.log(`✓ Ditambahkan: ${col.name}`);
    }

    console.log('✅ Migrasi kolom klinis pasien selesai.');
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
