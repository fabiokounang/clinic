const { pool } = require('../utils/db');

const STAFF_ROLES = ['admin', 'superadmin'];

async function getUserByEmail(email) {
  const sql = `
    SELECT *
    FROM users
    WHERE email = ?
    LIMIT 1
  `;
  const [rows] = await pool.execute(sql, [String(email || '').trim().toLowerCase()]);
  return rows[0] || null;
}

async function getUserById(id) {
  const n = parseInt(String(id), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  const sql = `
    SELECT *
    FROM users
    WHERE id = ?
    LIMIT 1
  `;
  const [rows] = await pool.execute(sql, [n]);
  return rows[0] || null;
}

async function emailTaken(email, excludeId) {
  const e = String(email || '').trim().toLowerCase();
  let sql = `SELECT id FROM users WHERE email = ? LIMIT 1`;
  const params = [e];
  if (excludeId != null) {
    const ex = parseInt(String(excludeId), 10);
    if (Number.isFinite(ex) && ex > 0) {
      sql = `SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1`;
      params.push(ex);
    }
  }
  const [rows] = await pool.execute(sql, params);
  return rows.length > 0;
}

/**
 * Prepared statements (pool.execute) often fail on LIMIT/OFFSET placeholders
 * on some MySQL/MariaDB builds. Use validated integers instead.
 */
function sanitizeStaffListOffset(value) {
  const n = parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Math.min(n, 2147483646);
}

function sanitizeStaffListLimit(value) {
  const allowed = [10, 25, 50, 100];
  const n = parseInt(String(value), 10);
  return allowed.includes(n) ? n : 10;
}

const STAFF_LIST_SORT_COL = {
  id: 'id',
  name: 'name',
  email: 'email',
  role: 'role',
  created_at: 'created_at'
};

function buildStaffListWhere(search, role, status) {
  const conditions = [`role IN ('admin', 'superadmin')`];
  const params = [];

  if (search) {
    const keyword = `%${search}%`;
    conditions.push('(name LIKE ? OR email LIKE ?)');
    params.push(keyword, keyword);
  }
  if (role === 'admin' || role === 'superadmin') {
    conditions.push('role = ?');
    params.push(role);
  }
  if (status === 'active') {
    conditions.push('is_active = 1');
  } else if (status === 'inactive') {
    conditions.push('is_active = 0');
  }

  return { conditions, params };
}

function buildStaffListOrderBy(sortKey, sortDir) {
  const col = STAFF_LIST_SORT_COL[sortKey] || 'id';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';
  return `ORDER BY ${col} ${dir}`;
}

async function countStaffUsers({ search = '', role = '', status = '' } = {}) {
  const { conditions, params } = buildStaffListWhere(search, role, status);
  const sql = `SELECT COUNT(*) AS c FROM users WHERE ${conditions.join(' AND ')}`;
  const [rows] = await pool.execute(sql, params);
  return Number(rows[0]?.c || 0);
}

async function listStaffUsers({
  search = '',
  role = '',
  status = '',
  limit = 10,
  offset = 0,
  sort = 'id',
  order = 'asc'
} = {}) {
  const { conditions, params } = buildStaffListWhere(search, role, status);
  const safeLimit = sanitizeStaffListLimit(limit);
  const safeOffset = sanitizeStaffListOffset(offset);
  const orderSql = buildStaffListOrderBy(sort, order);
  const sql = `
    SELECT id, name, email, role, is_active, created_at, updated_at
    FROM users
    WHERE ${conditions.join(' AND ')}
    ${orderSql}
    LIMIT ${safeLimit} OFFSET ${safeOffset}
  `;
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Jumlah baris dengan role superadmin (perlindungan: minimal satu di sistem). */
async function countSuperAdminRows() {
  const sql = `
    SELECT COUNT(*) AS c
    FROM users
    WHERE role = 'superadmin'
  `;
  const [rows] = await pool.execute(sql);
  return Number(rows[0]?.c || 0);
}

async function createUser({ name, email, passwordHash, role }) {
  const r = STAFF_ROLES.includes(role) ? role : 'admin';
  const sql = `
    INSERT INTO users (name, email, password, role, is_active)
    VALUES (?, ?, ?, ?, 1)
  `;
  const [result] = await pool.execute(sql, [
    String(name || '').trim(),
    String(email || '').trim().toLowerCase(),
    passwordHash,
    r
  ]);
  return result.insertId;
}

async function updateUser(id, { name, email, passwordHash, role, is_active }) {
  const n = parseInt(String(id), 10);
  if (!Number.isFinite(n) || n < 1) return false;

  const fields = [];
  const params = [];

  if (name != null) {
    fields.push('name = ?');
    params.push(String(name).trim());
  }
  if (email != null) {
    fields.push('email = ?');
    params.push(String(email).trim().toLowerCase());
  }
  if (passwordHash != null) {
    fields.push('password = ?');
    params.push(passwordHash);
  }
  if (role != null && STAFF_ROLES.includes(role)) {
    fields.push('role = ?');
    params.push(role);
  }
  if (is_active != null) {
    fields.push('is_active = ?');
    params.push(is_active ? 1 : 0);
  }

  if (!fields.length) return false;

  params.push(n);
  const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
  const [result] = await pool.execute(sql, params);
  return result.affectedRows > 0;
}

async function deleteUserById(id) {
  const n = parseInt(String(id), 10);
  if (!Number.isFinite(n) || n < 1) return false;
  const sql = `DELETE FROM users WHERE id = ? LIMIT 1`;
  const [result] = await pool.execute(sql, [n]);
  return result.affectedRows > 0;
}

module.exports = {
  getUserByEmail,
  getUserById,
  emailTaken,
  countStaffUsers,
  listStaffUsers,
  countSuperAdminRows,
  createUser,
  updateUser,
  deleteUserById,
  STAFF_ROLES
};
