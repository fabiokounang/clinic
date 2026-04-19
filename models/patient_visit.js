const { pool } = require('../utils/db');

function q(conn) {
  return conn || pool;
}

async function listVisitsByPatientId(patientId, conn) {
  const pid = parseInt(String(patientId), 10);
  if (!Number.isFinite(pid) || pid < 1) return [];
  const sql = `
    SELECT *
    FROM patient_visits
    WHERE patient_id = ?
    ORDER BY visit_number ASC, id ASC
  `;
  const [rows] = await q(conn).execute(sql, [pid]);
  return rows;
}

async function getVisitById(visitId, conn) {
  const vid = parseInt(String(visitId), 10);
  if (!Number.isFinite(vid) || vid < 1) return null;
  const sql = `SELECT * FROM patient_visits WHERE id = ? LIMIT 1`;
  const [rows] = await q(conn).execute(sql, [vid]);
  return rows[0] || null;
}

async function getVisitForPatient(patientId, visitId, conn) {
  const pid = parseInt(String(patientId), 10);
  const vid = parseInt(String(visitId), 10);
  if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(vid) || vid < 1) return null;
  const sql = `
    SELECT * FROM patient_visits
    WHERE id = ? AND patient_id = ?
    LIMIT 1
  `;
  const [rows] = await q(conn).execute(sql, [vid, pid]);
  return rows[0] || null;
}

async function getNextVisitNumber(patientId, conn) {
  const pid = parseInt(String(patientId), 10);
  if (!Number.isFinite(pid) || pid < 1) return 1;
  const sql = `
    SELECT COALESCE(MAX(visit_number), 0) + 1 AS n
    FROM patient_visits
    WHERE patient_id = ?
  `;
  const [rows] = await q(conn).execute(sql, [pid]);
  return Math.max(1, Number(rows[0]?.n || 1));
}

async function insertVisit(
  {
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
  },
  conn
) {
  const sql = `
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
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?
    )
  `;
  const params = [
    patient_id,
    visit_number,
    visited_at,
    primary_diagnosis,
    secondary_diagnoses,
    cardiac_history,
    has_hypertension || 0,
    has_diabetes || 0,
    has_dyslipidemia || 0,
    has_smoking || 0,
    has_obesity || 0,
    has_family_history || 0,
    has_ckd || 0,
    has_previous_mi || 0,
    has_atrial_fibrillation || 0,
    medications,
    medications_json,
    ecg_results,
    echo_results,
    lab_results,
    appointments_json,
    clinical_notes
  ];
  const [result] = await q(conn).execute(sql, params);
  return result.insertId;
}

async function deleteVisitForPatient(visitId, patientId, conn) {
  const vid = parseInt(String(visitId), 10);
  const pid = parseInt(String(patientId), 10);
  if (!Number.isFinite(vid) || vid < 1 || !Number.isFinite(pid) || pid < 1) return false;
  const sql = `DELETE FROM patient_visits WHERE id = ? AND patient_id = ? LIMIT 1`;
  const [result] = await q(conn).execute(sql, [vid, pid]);
  return result.affectedRows > 0;
}

async function updateVisit(visitId, data, conn) {
  const vid = parseInt(String(visitId), 10);
  if (!Number.isFinite(vid) || vid < 1) return false;
  const sql = `
    UPDATE patient_visits SET
      visited_at = ?,
      primary_diagnosis = ?,
      secondary_diagnoses = ?,
      cardiac_history = ?,
      has_hypertension = ?,
      has_diabetes = ?,
      has_dyslipidemia = ?,
      has_smoking = ?,
      has_obesity = ?,
      has_family_history = ?,
      has_ckd = ?,
      has_previous_mi = ?,
      has_atrial_fibrillation = ?,
      medications = ?,
      medications_json = ?,
      ecg_results = ?,
      echo_results = ?,
      lab_results = ?,
      appointments_json = ?,
      clinical_notes = ?
    WHERE id = ?
  `;
  const params = [
    data.visited_at,
    data.primary_diagnosis,
    data.secondary_diagnoses,
    data.cardiac_history,
    data.has_hypertension || 0,
    data.has_diabetes || 0,
    data.has_dyslipidemia || 0,
    data.has_smoking || 0,
    data.has_obesity || 0,
    data.has_family_history || 0,
    data.has_ckd || 0,
    data.has_previous_mi || 0,
    data.has_atrial_fibrillation || 0,
    data.medications,
    data.medications_json,
    data.ecg_results,
    data.echo_results,
    data.lab_results,
    data.appointments_json,
    data.clinical_notes,
    vid
  ];
  const [result] = await q(conn).execute(sql, params);
  return result.affectedRows > 0;
}

module.exports = {
  listVisitsByPatientId,
  getVisitById,
  getVisitForPatient,
  getNextVisitNumber,
  insertVisit,
  deleteVisitForPatient,
  updateVisit
};
