-- Jalankan sekali pada database yang sudah ada (setelah schema awal).
-- mysql -u ... -p clinic_db < utils/migration_002_cardiology_fields.sql

ALTER TABLE patients
  ADD COLUMN medications_json JSON DEFAULT NULL AFTER medications,
  ADD COLUMN ecg_results JSON DEFAULT NULL AFTER medications_json,
  ADD COLUMN echo_results JSON DEFAULT NULL AFTER ecg_results,
  ADD COLUMN lab_results JSON DEFAULT NULL AFTER echo_results,
  ADD COLUMN appointments_json JSON DEFAULT NULL AFTER lab_results,
  ADD COLUMN clinical_notes TEXT DEFAULT NULL AFTER appointments_json;
