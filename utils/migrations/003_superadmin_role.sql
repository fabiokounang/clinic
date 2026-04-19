-- Jalankan sekali pada database yang sudah ada (ENUM lama hanya 'admin').
-- Setelah ini, role dapat 'superadmin' | 'admin'.

ALTER TABLE users
  MODIFY COLUMN role ENUM('superadmin', 'admin') NOT NULL DEFAULT 'admin';

-- Promosikan akun seed default menjadi superadmin (sesuaikan email jika beda).
UPDATE users SET role = 'superadmin' WHERE email = 'admin@clinic.com' LIMIT 1;
