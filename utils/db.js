require('dotenv').config();

const mysql = require('mysql2/promise');

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

  return {
    host: String(host).trim(),
    port: Number.isFinite(port) && port > 0 ? port : 3306,
    user: String(user).trim(),
    password: process.env.DB_PASSWORD != null ? String(process.env.DB_PASSWORD) : '',
    database: String(database).trim(),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };
}

const pool = mysql.createPool(readDbConfig());

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
