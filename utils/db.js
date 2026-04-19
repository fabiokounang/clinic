require('dotenv').config();

const mysql = require('mysql2/promise');

/**
 * TLS untuk MySQL/TiDB Cloud (serverless mewajibkan koneksi aman).
 * - NODE_ENV=production → SSL diaktifkan (default).
 * - Atau DB_SSL=true → SSL meski development (mis. tes ke TiDB dari lokal).
 * - DB_SSL_DISABLED=true → matikan SSL (mis. MySQL lokal tanpa TLS saat NODE_ENV=production).
 * - DB_SSL_REJECT_UNAUTHORIZED=false → hanya jika CA tidak dikenali (jangan di production cloud).
 */
function resolveMysqlSsl() {
  const disabled = ['1', 'true', 'yes'].includes(
    String(process.env.DB_SSL_DISABLED || '').toLowerCase()
  );
  if (disabled) {
    return undefined;
  }

  const prod = process.env.NODE_ENV === 'production';
  const forceTls = ['1', 'true', 'yes'].includes(
    String(process.env.DB_SSL || '').toLowerCase()
  );
  if (!prod && !forceTls) {
    return undefined;
  }

  const rejectUnauthorized = !['0', 'false', 'no'].includes(
    String(process.env.DB_SSL_REJECT_UNAUTHORIZED ?? 'true').toLowerCase()
  );

  return {
    rejectUnauthorized,
    minVersion: 'TLSv1.2'
  };
}

function readDbConfig() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const database = process.env.DB_NAME;
  const missing = [];

  if (!host || !String(host).trim()) {
    missing.push('DB_HOST');
  }

  if (user === undefined || user === null || !String(user).trim()) {
    missing.push('DB_USER');
  }

  if (!database || !String(database).trim()) {
    missing.push('DB_NAME');
  }

  if (missing.length) {
    throw new Error(
      `Database configuration incomplete. Set these in .env: ${missing.join(', ')}`
    );
  }

  const rawPort = process.env.DB_PORT;
  const port = Number(rawPort);

  const config = {
    host: String(host).trim(),
    port: Number.isFinite(port) && port > 0 ? port : 3306,
    user: String(user).trim(),
    password: process.env.DB_PASSWORD != null ? String(process.env.DB_PASSWORD) : '',
    database: String(database).trim(),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };

  const ssl = resolveMysqlSsl();
  if (ssl) {
    config.ssl = ssl;
  }

  return config;
}

const dbConfig = readDbConfig();
const pool = mysql.createPool(dbConfig);

if (dbConfig.ssl) {
  console.log('Database: TLS enabled (TLS 1.2+, TiDB Cloud / secure MySQL)');
}

async function testConnection() {
  const connection = await pool.getConnection();

  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

module.exports = {
  pool,
  testConnection,
  readDbConfig
};
