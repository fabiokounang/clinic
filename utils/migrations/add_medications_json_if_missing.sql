-- Jalankan sekali jika tabel `patients` Anda belum punya kolom medications_json
-- (repo schema.sql sudah menyertakan kolom ini untuk instalasi baru).
-- MySQL 5.7.8+ / MariaDB 10.2.7+ (tipe JSON).

ALTER TABLE patients
  ADD COLUMN medications_json JSON DEFAULT NULL AFTER medications;
