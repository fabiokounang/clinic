-- Jalankan sekali terhadap database klinik (MySQL/MariaDB).
-- Membuat riwayat kunjungan per pasien; data klinis yang ada disalin ke kunjungan #1.

CREATE TABLE IF NOT EXISTS patient_visits (
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

INSERT INTO patient_visits (
  patient_id,
  visit_number,
  visited_at,
  primary_diagnosis,
  secondary_diagnoses,
  cardiac_history,
  has_hypertension,
  has_diabetes,
  has_dyslipidemia,
  has_smoking,
  has_obesity,
  has_family_history,
  has_ckd,
  has_previous_mi,
  has_atrial_fibrillation,
  medications,
  medications_json,
  ecg_results,
  echo_results,
  lab_results,
  appointments_json,
  clinical_notes
)
SELECT
  p.id,
  1,
  COALESCE(DATE(p.created_at), CURDATE()),
  p.primary_diagnosis,
  p.secondary_diagnoses,
  p.cardiac_history,
  p.has_hypertension,
  p.has_diabetes,
  p.has_dyslipidemia,
  p.has_smoking,
  p.has_obesity,
  p.has_family_history,
  p.has_ckd,
  p.has_previous_mi,
  p.has_atrial_fibrillation,
  p.medications,
  p.medications_json,
  p.ecg_results,
  p.echo_results,
  p.lab_results,
  p.appointments_json,
  p.clinical_notes
FROM patients p
WHERE p.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM patient_visits v WHERE v.patient_id = p.id);
