require('dotenv').config();

const bcrypt = require('bcryptjs');
const { pool } = require('../utils/db');

async function seedAdmin() {
  try {
    const name = 'Super Admin';
    const email = 'admin@clinic.com';
    const plainPassword = 'admin123456';

    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const checkSql = `
      SELECT id
      FROM users
      WHERE email = ?
      LIMIT ?
    `;
    const [existing] = await pool.execute(checkSql, [email, 1]);

    if (existing.length > 0) {
      console.log(`Admin already exists: ${email}`);
      process.exit(0);
    }

    const insertSql = `
      INSERT INTO users (
        name,
        email,
        password,
        role,
        is_active
      ) VALUES (?, ?, ?, ?, ?)
    `;

    await pool.execute(insertSql, [
      name,
      email,
      hashedPassword,
      'superadmin',
      1
    ]);

    console.log('✅ Admin seeded successfully');
    console.log(`Email: ${email}`);
    console.log(`Password: ${plainPassword}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to seed admin:', error.message);
    process.exit(1);
  }
}

seedAdmin();