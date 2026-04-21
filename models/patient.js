const { pool } = require('../utils/db');

function dbx(conn) {
  return conn || pool;
}

function asSqlJson(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (e) {
    return null;
  }
}

/**
 * Prepared statements (pool.execute) often fail on LIMIT/OFFSET placeholders
 * with ER_WRONG_ARGUMENTS on some MySQL/MariaDB builds. Use validated integers instead.
 */
function sanitizeLimit(value, defaultLimit = 20, max = 100) {
  const n = parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1) {
    return defaultLimit;
  }
  return Math.min(n, max);
}

function sanitizeOffset(value) {
  const n = parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Math.min(n, 2147483646);
}

/** Query failed because tabel `patient_visits` belum ada (migrasi belum dijalankan). */
function isMissingPatientVisitsTableError(err) {
  if (!err) return false;
  const msg = String(err.sqlMessage || err.message || '').toLowerCase();
  return (
    (err.code === 'ER_NO_SUCH_TABLE' || Number(err.errno) === 1146) &&
    msg.includes('patient_visits')
  );
}

/** Whitelist ORDER BY for patient list (SQL fragment, no user input). */
function buildPatientListOrderBy(sortKey, sortDir) {
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';
  const key = String(sortKey || '').toLowerCase();
  const clauses = {
    id: `id ${dir}`,
    patient_code: `patient_code ${dir}`,
    form_type: `form_type ${dir}`,
    name: `first_name ${dir}, last_name ${dir}`,
    date_of_birth: `date_of_birth ${dir}`,
    gender: `gender ${dir}`,
    phone: `phone ${dir}`,
    created_at: `created_at ${dir}`
  };
  return clauses[key] ? `ORDER BY ${clauses[key]}` : `ORDER BY id DESC`;
}

async function createPatient(data) {
  const sql = `
    INSERT INTO patients (
      patient_code,
      form_type,
      first_name,
      last_name,
      date_of_birth,
      gender,
      phone,
      email,
      address,
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
      clinical_notes,
      created_from_ip
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `;

  const params = [
    data.patient_code,
    data.form_type,
    data.first_name,
    data.last_name,
    data.date_of_birth || null,
    data.gender || null,
    data.phone || null,
    data.email || null,
    data.address || null,
    data.primary_diagnosis || null,
    data.secondary_diagnoses || null,
    data.cardiac_history || null,
    data.has_hypertension || 0,
    data.has_diabetes || 0,
    data.has_dyslipidemia || 0,
    data.has_smoking || 0,
    data.has_obesity || 0,
    data.has_family_history || 0,
    data.has_ckd || 0,
    data.has_previous_mi || 0,
    data.has_atrial_fibrillation || 0,
    data.medications || null,
    asSqlJson(data.medications_json),
    asSqlJson(data.ecg_results),
    asSqlJson(data.echo_results),
    asSqlJson(data.lab_results),
    asSqlJson(data.appointments_json),
    data.clinical_notes || null,
    data.created_from_ip || null
  ];

  const [result] = await pool.execute(sql, params);
  return result;
}

async function updatePatientCode(id, patientCode, conn) {
  const sql = `
    UPDATE patients
    SET patient_code = ?
    WHERE id = ? AND deleted_at IS NULL
  `;
  const [result] = await dbx(conn).execute(sql, [patientCode, id]);
  return result;
}

/** Pasien baru: hanya identitas; data klinis di patient_visits + sync ke kolom cache di patients. */
async function insertPatientDemographics(data, conn) {
  const sql = `
    INSERT INTO patients (
      patient_code,
      form_type,
      first_name,
      last_name,
      date_of_birth,
      gender,
      phone,
      email,
      address,
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
      clinical_notes,
      created_from_ip
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      NULL, NULL, NULL,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      ?
    )
  `;
  const params = [
    data.patient_code,
    data.form_type,
    data.first_name,
    data.last_name,
    data.date_of_birth || null,
    data.gender || null,
    data.phone || null,
    data.email || null,
    data.address || null,
    data.created_from_ip || null
  ];
  const [result] = await dbx(conn).execute(sql, params);
  return result;
}

async function updatePatientDemographics(id, data, conn) {
  const sql = `
    UPDATE patients
    SET
      first_name = ?,
      last_name = ?,
      date_of_birth = ?,
      gender = ?,
      phone = ?,
      email = ?,
      address = ?
    WHERE id = ? AND deleted_at IS NULL
  `;
  const params = [
    data.first_name,
    data.last_name,
    data.date_of_birth || null,
    data.gender || null,
    data.phone || null,
    data.email || null,
    data.address || null,
    id
  ];
  const [result] = await dbx(conn).execute(sql, params);
  return result;
}

/** Sinkronkan kolom klinis di `patients` dari satu baris kunjungan (untuk daftar & ekspor agregat). */
async function syncPatientClinicalFromVisit(patientId, visitRow, conn) {
  if (!visitRow) return false;
  const sql = `
    UPDATE patients
    SET
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
    WHERE id = ? AND deleted_at IS NULL
  `;
  const params = [
    visitRow.primary_diagnosis,
    visitRow.secondary_diagnoses,
    visitRow.cardiac_history,
    visitRow.has_hypertension || 0,
    visitRow.has_diabetes || 0,
    visitRow.has_dyslipidemia || 0,
    visitRow.has_smoking || 0,
    visitRow.has_obesity || 0,
    visitRow.has_family_history || 0,
    visitRow.has_ckd || 0,
    visitRow.has_previous_mi || 0,
    visitRow.has_atrial_fibrillation || 0,
    visitRow.medications,
    asSqlJson(visitRow.medications_json),
    asSqlJson(visitRow.ecg_results),
    asSqlJson(visitRow.echo_results),
    asSqlJson(visitRow.lab_results),
    asSqlJson(visitRow.appointments_json),
    visitRow.clinical_notes,
    patientId
  ];
  const [result] = await dbx(conn).execute(sql, params);
  return result.affectedRows > 0;
}

async function updatePatient(id, data) {
  const sql = `
    UPDATE patients
    SET
      first_name = ?,
      last_name = ?,
      date_of_birth = ?,
      gender = ?,
      phone = ?,
      email = ?,
      address = ?,
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
    WHERE id = ? AND deleted_at IS NULL
  `;

  const params = [
    data.first_name,
    data.last_name,
    data.date_of_birth || null,
    data.gender || null,
    data.phone || null,
    data.email || null,
    data.address || null,
    data.primary_diagnosis || null,
    data.secondary_diagnoses || null,
    data.cardiac_history || null,
    data.has_hypertension || 0,
    data.has_diabetes || 0,
    data.has_dyslipidemia || 0,
    data.has_smoking || 0,
    data.has_obesity || 0,
    data.has_family_history || 0,
    data.has_ckd || 0,
    data.has_previous_mi || 0,
    data.has_atrial_fibrillation || 0,
    data.medications || null,
    asSqlJson(data.medications_json),
    asSqlJson(data.ecg_results),
    asSqlJson(data.echo_results),
    asSqlJson(data.lab_results),
    asSqlJson(data.appointments_json),
    data.clinical_notes || null,
    id
  ];

  const [result] = await pool.execute(sql, params);
  return result;
}

async function getPatientById(id) {
  const sql = `
    SELECT *
    FROM patients
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1
  `;
  const [rows] = await pool.execute(sql, [id]);
  return rows[0] || null;
}

async function getPatients({
  search = '',
  formType = '',
  dateFrom = null,
  dateTo = null,
  limit = 20,
  offset = 0,
  sort = 'id',
  order = 'desc'
}) {
  function buildSql(visitCountExpr) {
    let sql = `
    SELECT
      patients.id,
      patients.patient_code,
      patients.form_type,
      patients.first_name,
      patients.last_name,
      patients.date_of_birth,
      patients.gender,
      patients.phone,
      patients.primary_diagnosis,
      patients.created_at,
      ${visitCountExpr}
    FROM patients
    WHERE deleted_at IS NULL
  `;
    const params = [];

    if (formType) {
      sql += ` AND form_type = ? `;
      params.push(formType);
    }

    if (search) {
      sql += `
      AND (
        first_name LIKE ?
        OR last_name LIKE ?
        OR CONCAT(first_name, ' ', last_name) LIKE ?
        OR patient_code LIKE ?
        OR phone LIKE ?
      )
    `;
      const keyword = `%${search}%`;
      params.push(keyword, keyword, keyword, keyword, keyword);
    }

    if (dateFrom) {
      sql += ` AND DATE(created_at) >= ? `;
      params.push(dateFrom);
    }
    if (dateTo) {
      sql += ` AND DATE(created_at) <= ? `;
      params.push(dateTo);
    }

    const safeLimit = sanitizeLimit(limit, 10, 100);
    const safeOffset = sanitizeOffset(offset);
    const orderBy = buildPatientListOrderBy(sort, order);
    sql += ` ${orderBy} LIMIT ${safeLimit} OFFSET ${safeOffset}`;
    return { sql, params };
  }

  const withVisits = buildSql(
    '(SELECT COUNT(*) FROM patient_visits pv WHERE pv.patient_id = patients.id) AS visit_count'
  );
  try {
    const [rows] = await pool.execute(withVisits.sql, withVisits.params);
    return rows;
  } catch (err) {
    if (!isMissingPatientVisitsTableError(err)) throw err;
    const fallback = buildSql('1 AS visit_count');
    const [rows] = await pool.execute(fallback.sql, fallback.params);
    return rows;
  }
}

async function countPatients(search = '', formType = '', dateFrom = null, dateTo = null) {
  let sql = `
    SELECT COUNT(*) AS total
    FROM patients
    WHERE deleted_at IS NULL
  `;
  const params = [];

  if (formType) {
    sql += ` AND form_type = ? `;
    params.push(formType);
  }

  if (search) {
    sql += `
      AND (
        first_name LIKE ?
        OR last_name LIKE ?
        OR CONCAT(first_name, ' ', last_name) LIKE ?
        OR patient_code LIKE ?
        OR phone LIKE ?
      )
    `;
    const keyword = `%${search}%`;
    params.push(keyword, keyword, keyword, keyword, keyword);
  }

  if (dateFrom) {
    sql += ` AND DATE(created_at) >= ? `;
    params.push(dateFrom);
  }
  if (dateTo) {
    sql += ` AND DATE(created_at) <= ? `;
    params.push(dateTo);
  }

  const [rows] = await pool.execute(sql, params);
  return rows[0].total;
}

async function softDeletePatient(id) {
  const sql = `
    UPDATE patients
    SET deleted_at = NOW()
    WHERE id = ? AND deleted_at IS NULL
  `;
  const [result] = await pool.execute(sql, [id]);
  return result;
}

async function getDashboardStats() {
  const sql = `
    SELECT
      COUNT(*) AS total_patients,
      COALESCE(SUM(DATE(created_at) = CURDATE()), 0) AS total_today
    FROM patients
    WHERE deleted_at IS NULL
  `;
  const [rows] = await pool.execute(sql);
  const row = rows[0] || {};
  return {
    total_patients: Number(row.total_patients) || 0,
    total_today: Number(row.total_today) || 0
  };
}

async function countActivePatients() {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS c FROM patients WHERE deleted_at IS NULL`
  );
  return Number(rows[0].c) || 0;
}

async function countNewPatientsInRange(dateFrom, dateTo) {
  const [rows] = await pool.execute(
    `
    SELECT COUNT(*) AS c
    FROM patients
    WHERE deleted_at IS NULL
      AND DATE(created_at) >= ?
      AND DATE(created_at) <= ?
    `,
    [dateFrom, dateTo]
  );
  return Number(rows[0].c) || 0;
}

async function getDailyNewPatientCounts(dateFrom, dateTo) {
  const [rows] = await pool.execute(
    `
    SELECT DATE(created_at) AS d, COUNT(*) AS c
    FROM patients
    WHERE deleted_at IS NULL
      AND DATE(created_at) >= ?
      AND DATE(created_at) <= ?
    GROUP BY DATE(created_at)
    ORDER BY d ASC
    `,
    [dateFrom, dateTo]
  );
  return rows.map((r) => ({
    d: r.d,
    c: Number(r.c) || 0
  }));
}

async function getFormTypeBreakdownInRange(dateFrom, dateTo) {
  const [rows] = await pool.execute(
    `
    SELECT form_type AS form_type, COUNT(*) AS c
    FROM patients
    WHERE deleted_at IS NULL
      AND DATE(created_at) >= ?
      AND DATE(created_at) <= ?
    GROUP BY form_type
    ORDER BY c DESC
    `,
    [dateFrom, dateTo]
  );
  return rows.map((r) => ({
    form_type: r.form_type,
    c: Number(r.c) || 0
  }));
}

async function getGenderBreakdownInRange(dateFrom, dateTo) {
  const [rows] = await pool.execute(
    `
    SELECT gender AS gender, COUNT(*) AS c
    FROM patients
    WHERE deleted_at IS NULL
      AND DATE(created_at) >= ?
      AND DATE(created_at) <= ?
    GROUP BY gender
    `,
    [dateFrom, dateTo]
  );
  return rows.map((r) => ({
    gender: r.gender,
    c: Number(r.c) || 0
  }));
}

async function getRecentPatientsInRange(dateFrom, dateTo, limit = 8) {
  const lim = sanitizeLimit(limit, 8, 20);
  const sql = `
    SELECT id, patient_code, first_name, last_name, form_type, created_at
    FROM patients
    WHERE deleted_at IS NULL
      AND DATE(created_at) >= ?
      AND DATE(created_at) <= ?
    ORDER BY created_at DESC
    LIMIT ${lim}
  `;
  const [rows] = await pool.execute(sql, [dateFrom, dateTo]);
  return rows;
}

/** Pasien kardiologi baru dalam rentang: agregat faktor risiko (kunjungan; fallback ke baris `patients` jika tabel kunjungan belum ada). */
async function getCardiologyRiskAggregatesInRange(dateFrom, dateTo) {
  try {
    const [rows] = await pool.execute(
      `
    SELECT
      COUNT(*) AS cardio_n,
      COALESCE(SUM(pv.has_hypertension), 0) AS n_htn,
      COALESCE(SUM(pv.has_diabetes), 0) AS n_dm,
      COALESCE(SUM(pv.has_dyslipidemia), 0) AS n_dyslip,
      COALESCE(SUM(pv.has_smoking), 0) AS n_smoke,
      COALESCE(SUM(pv.has_obesity), 0) AS n_obesity,
      COALESCE(SUM(pv.has_family_history), 0) AS n_fam,
      COALESCE(SUM(pv.has_ckd), 0) AS n_ckd,
      COALESCE(SUM(pv.has_previous_mi), 0) AS n_mi,
      COALESCE(SUM(pv.has_atrial_fibrillation), 0) AS n_af
    FROM patient_visits pv
    INNER JOIN patients p ON p.id = pv.patient_id AND p.deleted_at IS NULL
    WHERE p.form_type = 'cardiology'
      AND DATE(pv.visited_at) >= ?
      AND DATE(pv.visited_at) <= ?
    `,
      [dateFrom, dateTo]
    );
    const r = rows[0] || {};
    return {
      cardio_n: Number(r.cardio_n) || 0,
      n_htn: Number(r.n_htn) || 0,
      n_dm: Number(r.n_dm) || 0,
      n_dyslip: Number(r.n_dyslip) || 0,
      n_smoke: Number(r.n_smoke) || 0,
      n_obesity: Number(r.n_obesity) || 0,
      n_fam: Number(r.n_fam) || 0,
      n_ckd: Number(r.n_ckd) || 0,
      n_mi: Number(r.n_mi) || 0,
      n_af: Number(r.n_af) || 0
    };
  } catch (err) {
    if (!isMissingPatientVisitsTableError(err)) throw err;
    const [rows] = await pool.execute(
      `
    SELECT
      COUNT(*) AS cardio_n,
      COALESCE(SUM(has_hypertension), 0) AS n_htn,
      COALESCE(SUM(has_diabetes), 0) AS n_dm,
      COALESCE(SUM(has_dyslipidemia), 0) AS n_dyslip,
      COALESCE(SUM(has_smoking), 0) AS n_smoke,
      COALESCE(SUM(has_obesity), 0) AS n_obesity,
      COALESCE(SUM(has_family_history), 0) AS n_fam,
      COALESCE(SUM(has_ckd), 0) AS n_ckd,
      COALESCE(SUM(has_previous_mi), 0) AS n_mi,
      COALESCE(SUM(has_atrial_fibrillation), 0) AS n_af
    FROM patients
    WHERE deleted_at IS NULL
      AND form_type = 'cardiology'
      AND DATE(created_at) >= ?
      AND DATE(created_at) <= ?
    `,
      [dateFrom, dateTo]
    );
    const r = rows[0] || {};
    return {
      cardio_n: Number(r.cardio_n) || 0,
      n_htn: Number(r.n_htn) || 0,
      n_dm: Number(r.n_dm) || 0,
      n_dyslip: Number(r.n_dyslip) || 0,
      n_smoke: Number(r.n_smoke) || 0,
      n_obesity: Number(r.n_obesity) || 0,
      n_fam: Number(r.n_fam) || 0,
      n_ckd: Number(r.n_ckd) || 0,
      n_mi: Number(r.n_mi) || 0,
      n_af: Number(r.n_af) || 0
    };
  }
}

async function findPotentialDuplicate({ first_name, last_name, date_of_birth, phone, email, exclude_id = null }) {
  let sql = `
    SELECT id, patient_code, first_name, last_name, date_of_birth, phone, email
    FROM patients
    WHERE deleted_at IS NULL
      AND first_name = ?
      AND last_name = ?
  `;

  const params = [first_name, last_name];

  if (date_of_birth) {
    sql += ` AND date_of_birth = ? `;
    params.push(date_of_birth);
  }

  if (phone || email) {
    sql += ` AND (`;
    const checks = [];

    if (phone) {
      checks.push(`phone = ?`);
      params.push(phone);
    }

    if (email) {
      checks.push(`email = ?`);
      params.push(email);
    }

    sql += checks.join(' OR ');
    sql += `)`;
  }

  if (exclude_id) {
    sql += ` AND id <> ? `;
    params.push(exclude_id);
  }

  sql += ` ORDER BY id DESC LIMIT 1 `;

  const [rows] = await pool.execute(sql, params);
  return rows[0] || null;
}

async function getPatientsForExport({
  search = '',
  formType = '',
  patientId = null,
  dateFrom = null,
  dateTo = null
}) {
  /**
   * Gunakan SELECT * agar export tetap jalan walau skema DB belum punya kolom klinis
   * (ecg_results, medications_json, dll.). Kolom yang tidak ada tidak ikut di result;
   * controllers/export memetakan dengan aman ke nilai kosong.
   */
  let sql = `
    SELECT *
    FROM patients
    WHERE deleted_at IS NULL
  `;

  const params = [];

  if (patientId != null && patientId !== '') {
    const pid = Number(patientId);
    if (Number.isInteger(pid) && pid > 0) {
      sql += ` AND id = ? `;
      params.push(pid);
    }
  } else {
    if (formType) {
      sql += ` AND form_type = ? `;
      params.push(formType);
    }

    if (search) {
      sql += `
        AND (
          first_name LIKE ?
          OR last_name LIKE ?
          OR CONCAT(first_name, ' ', last_name) LIKE ?
          OR patient_code LIKE ?
          OR phone LIKE ?
        )
      `;
      const keyword = `%${search}%`;
      params.push(keyword, keyword, keyword, keyword, keyword);
    }

    if (dateFrom) {
      sql += ` AND DATE(created_at) >= ? `;
      params.push(dateFrom);
    }
    if (dateTo) {
      sql += ` AND DATE(created_at) <= ? `;
      params.push(dateTo);
    }
  }

  sql += ` ORDER BY id DESC `;

  const [rows] = await pool.execute(sql, params);
  return rows;
}

const patientVisitModel = require('./patient_visit');

/** Satu baris per kunjungan untuk ekspor (identitas pasien + snapshot klinis kunjungan). */
async function getPatientExportRows(patientId) {
  const pid = parseInt(String(patientId), 10);
  if (!Number.isFinite(pid) || pid < 1) return [];
  const patient = await getPatientById(pid);
  if (!patient) return [];
  let visits;
  try {
    visits = await patientVisitModel.listVisitsByPatientId(pid);
  } catch (e) {
    return [patient];
  }
  if (!visits.length) {
    return [patient];
  }
  return visits.map((v) => ({
    ...patient,
    primary_diagnosis: v.primary_diagnosis,
    secondary_diagnoses: v.secondary_diagnoses,
    cardiac_history: v.cardiac_history,
    has_hypertension: v.has_hypertension,
    has_diabetes: v.has_diabetes,
    has_dyslipidemia: v.has_dyslipidemia,
    has_smoking: v.has_smoking,
    has_obesity: v.has_obesity,
    has_family_history: v.has_family_history,
    has_ckd: v.has_ckd,
    has_previous_mi: v.has_previous_mi,
    has_atrial_fibrillation: v.has_atrial_fibrillation,
    medications: v.medications,
    medications_json: v.medications_json,
    ecg_results: v.ecg_results,
    echo_results: v.echo_results,
    lab_results: v.lab_results,
    appointments_json: v.appointments_json,
    clinical_notes: v.clinical_notes,
    visit_id: v.id,
    visit_number: v.visit_number,
    visited_at: v.visited_at,
    created_at: v.created_at
  }));
}

module.exports = {
  createPatient,
  insertPatientDemographics,
  updatePatientDemographics,
  syncPatientClinicalFromVisit,
  updatePatientCode,
  updatePatient,
  getPatientById,
  getPatients,
  countPatients,
  softDeletePatient,
  getDashboardStats,
  countActivePatients,
  countNewPatientsInRange,
  getDailyNewPatientCounts,
  getFormTypeBreakdownInRange,
  getGenderBreakdownInRange,
  getRecentPatientsInRange,
  getCardiologyRiskAggregatesInRange,
  findPotentialDuplicate,
  getPatientsForExport,
  getPatientExportRows,
  isMissingPatientVisitsTableError
};