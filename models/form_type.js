const { pool } = require('../utils/db');

async function getActiveFormTypes() {
  const sql = `
    SELECT id, slug, name, description
    FROM form_types
    WHERE is_active = 1
    ORDER BY sort_order ASC, id ASC
  `;

  const [rows] = await pool.execute(sql);
  return rows;
}

async function getFormTypeBySlug(slug) {
  const sql = `
    SELECT id, slug, name, description
    FROM form_types
    WHERE slug = ? AND is_active = 1
    LIMIT 1
  `;

  const [rows] = await pool.execute(sql, [slug]);
  return rows[0] || null;
}

module.exports = {
  getActiveFormTypes,
  getFormTypeBySlug
};