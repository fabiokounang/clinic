CREATE DATABASE IF NOT EXISTS clinic_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;
USE clinic_db;

CREATE TABLE patients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  patient_code VARCHAR(30) NOT NULL,
  form_type VARCHAR(50) NOT NULL DEFAULT 'cardiology',

  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE DEFAULT NULL,
  gender ENUM('male', 'female', 'other') DEFAULT NULL,
  phone VARCHAR(30) DEFAULT NULL,
  email VARCHAR(150) DEFAULT NULL,
  address TEXT DEFAULT NULL,

  primary_diagnosis VARCHAR(255) DEFAULT NULL,
  secondary_diagnoses TEXT DEFAULT NULL,
  cardiac_history TEXT DEFAULT NULL,

  has_hypertension TINYINT(1) NOT NULL DEFAULT 0,
  has_diabetes TINYINT(1) NOT NULL DEFAULT 0,
  has_dyslipidemia TINYINT(1) NOT NULL DEFAULT 0,
  has_smoking TINYINT(1) NOT NULL DEFAULT 0,
  has_obesity TINYINT(1) NOT NULL DEFAULT 0,
  has_family_history TINYINT(1) NOT NULL DEFAULT 0,
  has_ckd TINYINT(1) NOT NULL DEFAULT 0,
  has_previous_mi TINYINT(1) NOT NULL DEFAULT 0,
  has_atrial_fibrillation TINYINT(1) NOT NULL DEFAULT 0,

  medications TEXT DEFAULT NULL,
  medications_json JSON DEFAULT NULL,
  ecg_results JSON DEFAULT NULL,
  echo_results JSON DEFAULT NULL,
  lab_results JSON DEFAULT NULL,
  appointments_json JSON DEFAULT NULL,
  clinical_notes TEXT DEFAULT NULL,

  created_from_ip VARCHAR(45) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_patients_patient_code (patient_code),
  KEY idx_patients_form_type (form_type),
  KEY idx_patients_name (first_name, last_name),
  KEY idx_patients_phone (phone),
  KEY idx_patients_created_at (created_at),
  KEY idx_patients_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Riwayat kunjungan klinis per pasien (kunjungan 1, 2, …); baris di `patients` tetap identitas + cache data terbaru.
CREATE TABLE patient_visits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  patient_id BIGINT UNSIGNED NOT NULL,
  visit_number INT UNSIGNED NOT NULL,
  visited_at DATE NOT NULL,

  primary_diagnosis VARCHAR(255) DEFAULT NULL,
  secondary_diagnoses TEXT DEFAULT NULL,
  cardiac_history TEXT DEFAULT NULL,

  has_hypertension TINYINT(1) NOT NULL DEFAULT 0,
  has_diabetes TINYINT(1) NOT NULL DEFAULT 0,
  has_dyslipidemia TINYINT(1) NOT NULL DEFAULT 0,
  has_smoking TINYINT(1) NOT NULL DEFAULT 0,
  has_obesity TINYINT(1) NOT NULL DEFAULT 0,
  has_family_history TINYINT(1) NOT NULL DEFAULT 0,
  has_ckd TINYINT(1) NOT NULL DEFAULT 0,
  has_previous_mi TINYINT(1) NOT NULL DEFAULT 0,
  has_atrial_fibrillation TINYINT(1) NOT NULL DEFAULT 0,

  medications TEXT DEFAULT NULL,
  medications_json JSON DEFAULT NULL,
  ecg_results JSON DEFAULT NULL,
  echo_results JSON DEFAULT NULL,
  lab_results JSON DEFAULT NULL,
  appointments_json JSON DEFAULT NULL,
  clinical_notes TEXT DEFAULT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_patient_visit_num (patient_id, visit_number),
  KEY idx_pv_patient (patient_id),
  KEY idx_pv_visited_at (visited_at),
  CONSTRAINT fk_pv_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('superadmin', 'admin') NOT NULL DEFAULT 'admin',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE form_types (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_form_types_slug (slug),
  KEY idx_form_types_active_sort (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO form_types (slug, name, description, is_active, sort_order)
VALUES
('cardiology', 'Cardiology', 'Form untuk data pasien dan riwayat kardiologi.', 1, 1);

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED DEFAULT NULL,
  module VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  record_id BIGINT UNSIGNED DEFAULT NULL,
  description VARCHAR(255) DEFAULT NULL,
  old_data JSON DEFAULT NULL,
  new_data JSON DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_logs_module_record (module, record_id),
  KEY idx_audit_logs_user_id (user_id),
  KEY idx_audit_logs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;