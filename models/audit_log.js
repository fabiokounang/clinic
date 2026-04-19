const { pool } = require('../utils/db');

async function createAuditLog(data) {
  const sql = `
    INSERT INTO audit_logs (
      user_id,
      module,
      action,
      record_id,
      description,
      old_data,
      new_data,
      ip_address
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    data.user_id || null,
    data.module,
    data.action,
    data.record_id || null,
    data.description || null,
    data.old_data ? JSON.stringify(data.old_data) : null,
    data.new_data ? JSON.stringify(data.new_data) : null,
    data.ip_address || null
  ];

  const [result] = await pool.execute(sql, params);
  return result;
}

async function listRecentAuditLogs(limit = 15) {
  const lim = Math.min(Math.max(parseInt(String(limit), 10) || 15, 1), 50);
  const sql = `
    SELECT id, user_id, module, action, description, created_at
    FROM audit_logs
    ORDER BY created_at DESC
    LIMIT ${lim}
  `;
  const [rows] = await pool.execute(sql);
  return rows;
}

module.exports = {
  createAuditLog,
  listRecentAuditLogs
};