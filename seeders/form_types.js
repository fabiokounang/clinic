require('dotenv').config();

const { pool } = require('../utils/db');

async function seedFormTypes() {
  try {
    const items = [
      ['cardiology', 'Cardiology', 'Form untuk data pasien dan riwayat kardiologi.', 1, 1]
    ];

    for (const item of items) {
      const sql = `
        INSERT INTO form_types (slug, name, description, is_active, sort_order)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          description = VALUES(description),
          is_active = VALUES(is_active),
          sort_order = VALUES(sort_order)
      `;

      await pool.execute(sql, item);
    }

    console.log('✅ Form types seeded successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to seed form types:', error.message);
    process.exit(1);
  }
}

seedFormTypes();