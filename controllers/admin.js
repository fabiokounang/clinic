const patientModel = require('../models/patient');
const patientVisitModel = require('../models/patient_visit');
const { pool } = require('../utils/db');
const { normalizeCheckbox, generatePatientCode } = require('../utils/helpers');
const { validatePatientForm } = require('../utils/patientFormValidation');
const auditLogModel = require('../models/audit_log');
const {
  resolveDashboardRange,
  mergeDailySeries,
  buildPresetQueryStrings,
  getActiveDashboardPreset,
  parsePatientListDateRange
} = require('../utils/dashboardRange');
const formTypeModel = require('../models/form_type');
const { getClientIp } = require('../utils/request');
const { parseClinicalFromBody, buildClinicalPrefill, clinicalFieldsFromVisitRow } = require('../utils/clinicalForm');
const { unlinkAbsolute, unlinkPublicRelative } = require('../utils/uploadCleanup');
const adminNavHelpers = require('../utils/adminNav');
const {
  ymdInTimeZone,
  parseYmdParam,
  buildVisitQueueItems,
  shiftYmd
} = require('../utils/appointmentQueue');
const { formatDateId } = require('../utils/dateDisplay');

const PATIENT_LIST_LIMITS = [10, 25, 50, 100];
const PATIENT_LIST_SORT_KEYS = new Set([
  'id',
  'patient_code',
  'form_type',
  'name',
  'date_of_birth',
  'gender',
  'phone',
  'created_at'
]);

function normalizePatientListLimit(raw) {
  const n = parseInt(String(raw), 10);
  return PATIENT_LIST_LIMITS.includes(n) ? n : 10;
}

function normalizePatientListSort(raw) {
  const s = String(raw || '').toLowerCase();
  return PATIENT_LIST_SORT_KEYS.has(s) ? s : 'id';
}

function normalizePatientListOrder(raw) {
  return String(raw || '').toLowerCase() === 'asc' ? 'asc' : 'desc';
}

function patientListQueryString(state) {
  const { search, formType, sort, order, limit, page, dateFrom, dateTo } = state;
  const q = new URLSearchParams();
  if (search) q.set('search', search);
  if (formType) q.set('form_type', formType);
  if (dateFrom) q.set('from', dateFrom);
  if (dateTo) q.set('to', dateTo);
  q.set('sort', sort);
  q.set('order', order);
  q.set('limit', String(limit));
  q.set('page', String(Math.max(1, page)));
  return q.toString();
}

function exportPatientsQueryString({ search, formType, dateFrom, dateTo }) {
  const q = new URLSearchParams();
  if (search) q.set('search', search);
  if (formType) q.set('form_type', formType);
  if (dateFrom) q.set('from', dateFrom);
  if (dateTo) q.set('to', dateTo);
  return q.toString();
}

function nextPatientListSortOrder(currentSort, currentOrder, columnKey) {
  if (currentSort === columnKey) {
    return { sort: columnKey, order: currentOrder === 'asc' ? 'desc' : 'asc' };
  }
  const descFirst = ['id', 'created_at', 'date_of_birth'].includes(columnKey);
  return { sort: columnKey, order: descFirst ? 'desc' : 'asc' };
}

function sanitizeText(value, maxLength = 255) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function parseVisitedAtInput(body) {
  const s = String(body && body.visited_at != null ? body.visited_at : '').trim();
  if (!s) {
    return new Date().toISOString().slice(0, 10);
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

function getPatientSaveErrorMessage(error, fallbackMessage) {
  if (patientModel.isMissingPatientVisitsTableError(error)) {
    return 'Tabel kunjungan (patient_visits) belum ada di database. Jalankan migrasi sekali: npm run migrate:patient-visits (atau eksekusi manual berkas utils/migrations/add_patient_visits.sql), lalu coba lagi.';
  }

  const code = String(error && error.code ? error.code : '');
  const sqlMsg = String(error && error.sqlMessage ? error.sqlMessage : '').toLowerCase();
  const msg = String(error && error.message ? error.message : '').toLowerCase();
  const detail = `${sqlMsg} ${msg}`;

  if (code === 'ER_BAD_FIELD_ERROR' || detail.includes('unknown column')) {
    if (
      detail.includes('medications_json') ||
      detail.includes('ecg_results') ||
      detail.includes('echo_results') ||
      detail.includes('lab_results') ||
      detail.includes('appointments_json') ||
      detail.includes('clinical_notes')
    ) {
      return 'Kolom klinis terbaru belum ada di database. Jalankan migrasi: npm run migrate:patient-clinical, lalu coba lagi.';
    }
  }

  return fallbackMessage;
}

function sanitizeTextarea(value, maxLength = 5000) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, maxLength);
}

function validateEditForm(body, existingPatient, files) {
  const errors = [];

  const firstName = sanitizeText(body.first_name, 100);
  const lastName = sanitizeText(body.last_name, 100);
  const dateOfBirth = sanitizeText(body.date_of_birth, 20);
  const gender = sanitizeText(body.gender, 20);
  const phone = sanitizeText(body.phone, 30);
  const email = sanitizeText(body.email, 150);
  const address = sanitizeTextarea(body.address, 1000);

  const primaryDiagnosis = sanitizeText(body.primary_diagnosis, 255);
  const secondaryDiagnoses = sanitizeTextarea(body.secondary_diagnoses, 2000);
  const cardiacHistory = sanitizeTextarea(body.cardiac_history, 3000);
  const isCardio = existingPatient && String(existingPatient.form_type) === 'cardiology';
  const clinical = isCardio
    ? parseClinicalFromBody(body, { files: files || {}, existingPatient })
    : parseClinicalFromBody(body);

  if (!firstName) {
    errors.push('First name wajib diisi.');
  }

  if (!lastName) {
    errors.push('Last name wajib diisi.');
  }

  if (dateOfBirth) {
    const date = new Date(dateOfBirth);
    if (Number.isNaN(date.getTime())) {
      errors.push('Date of birth tidak valid.');
    } else {
      const now = new Date();
      if (date > now) {
        errors.push('Date of birth tidak boleh lebih dari hari ini.');
      }
    }
  }

  if (gender && !['male', 'female', 'other'].includes(gender)) {
    errors.push('Gender tidak valid.');
  }

  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push('Format email tidak valid.');
    }
  }

  if (phone) {
    const phoneRegex = /^[0-9+\-\s()]{6,30}$/;
    if (!phoneRegex.test(phone)) {
      errors.push('Format phone tidak valid.');
    }
  }

  function preserveBool(v) {
    return v ? 1 : 0;
  }

  const ex = existingPatient || {};
  const clinicalBlock = isCardio
    ? {
        primary_diagnosis: primaryDiagnosis || null,
        secondary_diagnoses: secondaryDiagnoses || null,
        cardiac_history: cardiacHistory || null,
        has_hypertension: normalizeCheckbox(body.has_hypertension),
        has_diabetes: normalizeCheckbox(body.has_diabetes),
        has_dyslipidemia: normalizeCheckbox(body.has_dyslipidemia),
        has_smoking: normalizeCheckbox(body.has_smoking),
        has_obesity: normalizeCheckbox(body.has_obesity),
        has_family_history: normalizeCheckbox(body.has_family_history),
        has_ckd: normalizeCheckbox(body.has_ckd),
        has_previous_mi: normalizeCheckbox(body.has_previous_mi),
        has_atrial_fibrillation: normalizeCheckbox(body.has_atrial_fibrillation),
        medications: clinical.medications_legacy,
        medications_json: clinical.medications_json,
        ecg_results: clinical.ecg_results,
        echo_results: clinical.echo_results,
        lab_results: clinical.lab_results,
        appointments_json: clinical.appointments_json,
        clinical_notes: clinical.clinical_notes
      }
    : {
        primary_diagnosis: ex.primary_diagnosis != null ? ex.primary_diagnosis : null,
        secondary_diagnoses: ex.secondary_diagnoses != null ? ex.secondary_diagnoses : null,
        cardiac_history: ex.cardiac_history != null ? ex.cardiac_history : null,
        has_hypertension: preserveBool(ex.has_hypertension),
        has_diabetes: preserveBool(ex.has_diabetes),
        has_dyslipidemia: preserveBool(ex.has_dyslipidemia),
        has_smoking: preserveBool(ex.has_smoking),
        has_obesity: preserveBool(ex.has_obesity),
        has_family_history: preserveBool(ex.has_family_history),
        has_ckd: preserveBool(ex.has_ckd),
        has_previous_mi: preserveBool(ex.has_previous_mi),
        has_atrial_fibrillation: preserveBool(ex.has_atrial_fibrillation),
        medications: ex.medications != null ? ex.medications : null,
        medications_json: ex.medications_json != null ? ex.medications_json : null,
        ecg_results: ex.ecg_results != null ? ex.ecg_results : null,
        echo_results: ex.echo_results != null ? ex.echo_results : null,
        lab_results: ex.lab_results != null ? ex.lab_results : null,
        appointments_json: ex.appointments_json != null ? ex.appointments_json : null,
        clinical_notes: ex.clinical_notes != null ? ex.clinical_notes : null
      };

  return {
    errors,
    cleanData: {
      first_name: firstName,
      last_name: lastName,
      date_of_birth: dateOfBirth || null,
      gender: gender || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      ...clinicalBlock
    },
    fileOps: isCardio
      ? {
          rollbackAbs: clinical._uploadRollbackAbs || [],
          unlinkPdfRelAfterSuccess: clinical._unlinkPdfRelAfterSuccess || []
        }
      : { rollbackAbs: [], unlinkPdfRelAfterSuccess: [] }
  };
}

async function dashboard(req, res) {
  try {
    const range = resolveDashboardRange(req.query);
    const { from, to, daysInRange } = range;

    const [
      totalActiveAllTime,
      newInRange,
      dailyRows,
      formBreakdown,
      genderBreakdown,
      recentInRange,
      riskAgg,
      auditLogs,
      quickToday
    ] = await Promise.all([
      patientModel.countActivePatients(),
      patientModel.countNewPatientsInRange(from, to),
      patientModel.getDailyNewPatientCounts(from, to),
      patientModel.getFormTypeBreakdownInRange(from, to),
      patientModel.getGenderBreakdownInRange(from, to),
      patientModel.getRecentPatientsInRange(from, to, 8),
      patientModel.getCardiologyRiskAggregatesInRange(from, to),
      auditLogModel.listRecentAuditLogs(12),
      patientModel.getDashboardStats()
    ]);

    const chartDaily = mergeDailySeries(from, to, dailyRows);
    const avgPerDay = daysInRange > 0 ? newInRange / daysInRange : 0;

    const chartFormMeta = {
      labels: formBreakdown.map((r) => r.form_type || '—'),
      counts: formBreakdown.map((r) => r.c)
    };

    const riskItems = [
      { key: 'n_htn', label: 'Hipertensi', n: riskAgg.n_htn },
      { key: 'n_dm', label: 'Diabetes', n: riskAgg.n_dm },
      { key: 'n_dyslip', label: 'Dislipidemia', n: riskAgg.n_dyslip },
      { key: 'n_smoke', label: 'Merokok', n: riskAgg.n_smoke },
      { key: 'n_obesity', label: 'Obesitas', n: riskAgg.n_obesity },
      { key: 'n_fam', label: 'Riwayat keluarga', n: riskAgg.n_fam },
      { key: 'n_ckd', label: 'CKD', n: riskAgg.n_ckd },
      { key: 'n_mi', label: 'Infark sebelumnya', n: riskAgg.n_mi },
      { key: 'n_af', label: 'Atrial fibrilasi', n: riskAgg.n_af }
    ];

    return res.render('admin/dashboard', {
      title: 'Dashboard',
      adminNav: adminNavHelpers.dashboard(),
      stats: quickToday,
      dateFrom: from,
      dateTo: to,
      daysInRange,
      totalActiveAllTime,
      newInRange,
      avgPerDay,
      chartDaily,
      chartFormMeta,
      formBreakdown,
      genderBreakdown,
      recentInRange,
      riskAgg,
      riskItems,
      auditLogs,
      presetQs: buildPresetQueryStrings(),
      activeDashboardPreset: getActiveDashboardPreset(from, to)
    });
  } catch (error) {
    console.error('dashboard error:', error);
    req.flash('error_msg', 'Gagal memuat dashboard.');
    return res.redirect('/admin/patients');
  }
}

async function indexPatients(req, res) {
  try {
    const search = String(req.query.search || '').trim();
    const formType = String(req.query.form_type || '').trim();
    const { dateFrom, dateTo } = parsePatientListDateRange(req.query);
    const limit = normalizePatientListLimit(req.query.limit);
    const sort = normalizePatientListSort(req.query.sort);
    const order = normalizePatientListOrder(req.query.order);

    const total = await patientModel.countPatients(search, formType, dateFrom, dateTo);
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    let page = Math.max(parseInt(String(req.query.page), 10) || 1, 1);
    if (page > totalPages) {
      page = totalPages;
    }
    const offset = (page - 1) * limit;

    const patients = await patientModel.getPatients({
      search,
      formType,
      dateFrom,
      dateTo,
      limit,
      offset,
      sort,
      order
    });
    const displayFrom = total === 0 ? 0 : (page - 1) * limit + 1;
    const displayTo = (page - 1) * limit + patients.length;

    const formTypes = await formTypeModel.getActiveFormTypes();
    const listState = { search, formType, dateFrom, dateTo, sort, order, limit, page };
    const exportQs = exportPatientsQueryString({ search, formType, dateFrom, dateTo });
    return res.render('admin/patients/index', {
      title: 'Patients',
      adminNav: adminNavHelpers.patientsIndex(),
      patients,
      search,
      formType,
      dateFrom,
      dateTo,
      sort,
      order,
      limit,
      page,
      totalPages,
      total,
      displayFrom,
      displayTo,
      patientListLimits: PATIENT_LIST_LIMITS,
      patientListQs: (overrides = {}) => patientListQueryString({ ...listState, ...overrides }),
      exportPatientsQs: exportQs,
      sortColumnHref: (columnKey) => {
        const next = nextPatientListSortOrder(sort, order, columnKey);
        return `?${patientListQueryString({
          search,
          formType,
          dateFrom,
          dateTo,
          sort: next.sort,
          order: next.order,
          limit,
          page: 1
        })}`;
      },
      formTypes
    });
  } catch (error) {
    console.error('indexPatients error:', error);
    req.flash('error_msg', 'Gagal memuat data pasien.');
    return res.redirect('/admin/dashboard');
  }
}

async function showPatient(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      req.flash('error_msg', 'ID pasien tidak valid.');
      return res.redirect('/admin/patients');
    }

    const patient = await patientModel.getPatientById(id);

    if (!patient) {
      req.flash('error_msg', 'Data pasien tidak ditemukan.');
      return res.redirect('/admin/patients');
    }

    let visits = [];
    try {
      visits = await patientVisitModel.listVisitsByPatientId(id);
    } catch (e) {
      visits = [];
    }

    return res.render('admin/patients/show', {
      title: `Detail pasien · ${patient.first_name} ${patient.last_name}`,
      adminNav: adminNavHelpers.patientShow(),
      patient,
      visits
    });
  } catch (error) {
    console.error('showPatient error:', error);
    req.flash('error_msg', 'Gagal memuat detail pasien.');
    return res.redirect('/admin/patients');
  }
}

async function editPatientForm(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      req.flash('error_msg', 'ID pasien tidak valid.');
      return res.redirect('/admin/patients');
    }

    const patient = await patientModel.getPatientById(id);

    if (!patient) {
      req.flash('error_msg', 'Data pasien tidak ditemukan.');
      return res.redirect('/admin/patients');
    }

    let visits = [];
    try {
      visits = await patientVisitModel.listVisitsByPatientId(id);
    } catch (e) {
      visits = [];
    }

    let selectedVisit = null;
    if (visits.length) {
      const qVid = parseInt(String(req.query.visit_id || ''), 10);
      selectedVisit =
        Number.isFinite(qVid) && qVid > 0
          ? visits.find((v) => Number(v.id) === qVid) || null
          : null;
      if (!selectedVisit) {
        selectedVisit = visits[visits.length - 1];
      }
    }

    const prefillSource = selectedVisit ? { ...patient, ...selectedVisit } : patient;

    return res.render('admin/patients/edit', {
      title: 'Edit Patient',
      adminNav: adminNavHelpers.patientEdit(patient, selectedVisit ? selectedVisit.visit_number : null),
      patient,
      visits,
      editingVisitId: selectedVisit ? selectedVisit.id : null,
      editingVisitNumber: selectedVisit ? selectedVisit.visit_number : null,
      clinicalPrefill: buildClinicalPrefill(prefillSource)
    });
  } catch (error) {
    console.error('editPatientForm error:', error);
    req.flash('error_msg', 'Gagal memuat form edit.');
    return res.redirect('/admin/patients');
  }
}

async function updatePatient(req, res) {
  let fileOps = { rollbackAbs: [], unlinkPdfRelAfterSuccess: [] };
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      req.flash('error_msg', 'ID pasien tidak valid.');
      return res.redirect('/admin/patients');
    }

    const existingPatient = await patientModel.getPatientById(id);

    if (!existingPatient) {
      req.flash('error_msg', 'Data pasien tidak ditemukan.');
      return res.redirect('/admin/patients');
    }

    let visits = [];
    try {
      visits = await patientVisitModel.listVisitsByPatientId(id);
    } catch (e) {
      visits = [];
    }
    let visitId = parseInt(String(req.body.visit_id || ''), 10);
    if (!Number.isFinite(visitId) || visitId < 1) {
      visitId = visits.length ? visits[visits.length - 1].id : null;
    }
    const targetVisit = visits.find((v) => Number(v.id) === Number(visitId)) || (visits.length ? visits[visits.length - 1] : null);

    if (!targetVisit) {
      req.flash(
        'error_msg',
        'Riwayat kunjungan belum tersedia. Jalankan migrasi database (patient_visits) lalu coba lagi.'
      );
      return res.redirect(`/admin/patients/${id}/edit`);
    }

    const mergeBase = { ...existingPatient, ...targetVisit };
    const validated = validateEditForm(req.body, mergeBase, req.files);
    const { errors, cleanData } = validated;
    fileOps = validated.fileOps || fileOps;

    if (errors.length > 0) {
      await unlinkAbsolute(fileOps.rollbackAbs);
      req.flash('error_msg', errors[0]);
      return res.redirect(`/admin/patients/${id}/edit`);
    }

    const duplicatePatient = await patientModel.findPotentialDuplicate({
      first_name: cleanData.first_name,
      last_name: cleanData.last_name,
      date_of_birth: cleanData.date_of_birth,
      phone: cleanData.phone,
      email: cleanData.email,
      exclude_id: id
    });

    if (duplicatePatient) {
      await unlinkAbsolute(fileOps.rollbackAbs);
      req.flash(
        'error_msg',
        `Potensi duplikat terdeteksi dengan patient code ${duplicatePatient.patient_code}.`
      );
      return res.redirect(`/admin/patients/${id}/edit`);
    }

    const {
      first_name: fn,
      last_name: ln,
      date_of_birth: dob,
      gender: g,
      phone: ph,
      email: em,
      address: ad,
      ...clinicalRest
    } = cleanData;

    await patientModel.updatePatientDemographics(id, {
      first_name: fn,
      last_name: ln,
      date_of_birth: dob,
      gender: g,
      phone: ph,
      email: em,
      address: ad
    });

    await patientVisitModel.updateVisit(targetVisit.id, {
      ...clinicalRest,
      visited_at: targetVisit.visited_at
    });

    const freshVisit = await patientVisitModel.getVisitById(targetVisit.id);
    await patientModel.syncPatientClinicalFromVisit(id, freshVisit);

    await unlinkPublicRelative(fileOps.unlinkPdfRelAfterSuccess);

    await auditLogModel.createAuditLog({
      user_id: req.session.admin?.id || null,
      module: 'patients',
      action: 'update',
      record_id: id,
      description: `Admin updated patient ${existingPatient.patient_code} (kunjungan #${targetVisit.visit_number})`,
      old_data: existingPatient,
      new_data: cleanData,
      ip_address: getClientIp(req)
    });

    req.flash('success_msg', 'Data pasien berhasil diperbarui.');
    return res.redirect(`/admin/patients/${id}`);
  } catch (error) {
    console.error('updatePatient error:', error);
    await unlinkAbsolute(fileOps.rollbackAbs);
    req.flash('error_msg', getPatientSaveErrorMessage(error, 'Gagal memperbarui data pasien.'));
    return res.redirect(`/admin/patients/${req.params.id}/edit`);
  }
}

function newPatientFormUrl(formType) {
  const slug = String(formType || '').trim();
  return slug ? `/admin/patients/new?form_type=${encodeURIComponent(slug)}` : '/admin/patients/new';
}

async function newPatientForm(req, res) {
  try {
    const formTypes = await formTypeModel.getActiveFormTypes();
    const slug = String(req.query.form_type || '').trim();

    if (!slug) {
      if (!formTypes.length) {
        req.flash('error_msg', 'Belum ada jenis form aktif.');
        return res.redirect('/admin/patients');
      }
      if (formTypes.length === 1) {
        return res.redirect(`/admin/patients/new?form_type=${encodeURIComponent(formTypes[0].slug)}`);
      }
      return res.render('admin/patients/choose_form_type', {
        title: 'Pilih jenis form',
        adminNav: adminNavHelpers.chooseFormType(),
        formTypes
      });
    }

    const formTypeData = await formTypeModel.getFormTypeBySlug(slug);
    if (!formTypeData) {
      req.flash('error_msg', 'Jenis form tidak dikenal.');
      return res.redirect('/admin/patients/new');
    }

    return res.render('admin/patients/new', {
      title: 'Tambah pasien',
      adminNav: adminNavHelpers.patientNew(formTypes.map((ft) => ft.slug)),
      formType: formTypeData.slug,
      formTypes
    });
  } catch (error) {
    console.error('newPatientForm error:', error);
    req.flash('error_msg', 'Gagal memuat formulir pasien baru.');
    return res.redirect('/admin/patients');
  }
}

async function storeNewPatient(req, res) {
  let fileOps = { rollbackAbs: [], unlinkPdfRelAfterSuccess: [] };
  try {
    const validated = validatePatientForm(req.body, req.files);
    const { errors, cleanData } = validated;
    fileOps = validated.fileOps || fileOps;

    if (errors.length > 0) {
      await unlinkAbsolute(fileOps.rollbackAbs);
      req.session.oldForm = req.body;
      req.flash('error_msg', errors[0]);
      return res.redirect(newPatientFormUrl(req.body.form_type));
    }

    const formTypeData = await formTypeModel.getFormTypeBySlug(cleanData.form_type);

    if (!formTypeData) {
      await unlinkAbsolute(fileOps.rollbackAbs);
      req.flash('error_msg', 'Tipe form tidak valid.');
      return res.redirect(newPatientFormUrl(req.body.form_type));
    }

    const duplicatePatient = await patientModel.findPotentialDuplicate({
      first_name: cleanData.first_name,
      last_name: cleanData.last_name,
      date_of_birth: cleanData.date_of_birth,
      phone: cleanData.phone,
      email: cleanData.email
    });

    if (duplicatePatient) {
      await unlinkAbsolute(fileOps.rollbackAbs);
      req.session.oldForm = req.body;
      req.flash(
        'error_msg',
        `Kemungkinan duplikat: pasien serupa sudah ada (${duplicatePatient.patient_code}).`
      );
      return res.redirect(newPatientFormUrl(cleanData.form_type));
    }

    const tempPatientCode = `TMP-${Date.now()}`;
    const visitedAt = parseVisitedAtInput(req.body);

    const conn = await pool.getConnection();
    let patientId;
    let patientCode;
    try {
      await conn.beginTransaction();

      const ins = await patientModel.insertPatientDemographics(
        {
          patient_code: tempPatientCode,
          form_type: cleanData.form_type,
          first_name: cleanData.first_name,
          last_name: cleanData.last_name,
          date_of_birth: cleanData.date_of_birth,
          gender: cleanData.gender,
          phone: cleanData.phone,
          email: cleanData.email,
          address: cleanData.address,
          created_from_ip: getClientIp(req)
        },
        conn
      );

      patientId = ins.insertId;
      patientCode = generatePatientCode(patientId);

      await patientModel.updatePatientCode(patientId, patientCode, conn);

      const visitInsertId = await patientVisitModel.insertVisit(
        {
          patient_id: patientId,
          visit_number: 1,
          visited_at: visitedAt,
          primary_diagnosis: cleanData.primary_diagnosis,
          secondary_diagnoses: cleanData.secondary_diagnoses,
          cardiac_history: cleanData.cardiac_history,
          has_hypertension: cleanData.has_hypertension,
          has_diabetes: cleanData.has_diabetes,
          has_dyslipidemia: cleanData.has_dyslipidemia,
          has_smoking: cleanData.has_smoking,
          has_obesity: cleanData.has_obesity,
          has_family_history: cleanData.has_family_history,
          has_ckd: cleanData.has_ckd,
          has_previous_mi: cleanData.has_previous_mi,
          has_atrial_fibrillation: cleanData.has_atrial_fibrillation,
          medications: cleanData.medications,
          medications_json: cleanData.medications_json,
          ecg_results: cleanData.ecg_results,
          echo_results: cleanData.echo_results,
          lab_results: cleanData.lab_results,
          appointments_json: cleanData.appointments_json,
          clinical_notes: cleanData.clinical_notes
        },
        conn
      );

      const visitRow = await patientVisitModel.getVisitById(visitInsertId, conn);
      await patientModel.syncPatientClinicalFromVisit(patientId, visitRow, conn);

      await conn.commit();
    } catch (txErr) {
      try {
        await conn.rollback();
      } catch (rbErr) {
        /* ignore */
      }
      throw txErr;
    } finally {
      conn.release();
    }

    await unlinkPublicRelative(fileOps.unlinkPdfRelAfterSuccess);

    await auditLogModel.createAuditLog({
      user_id: req.session.admin?.id || null,
      module: 'patients',
      action: 'create',
      record_id: patientId,
      description: `Staff membuat pasien baru ${patientCode} (kunjungan #1)`,
      old_data: null,
      new_data: {
        patient_code: patientCode,
        form_type: cleanData.form_type,
        first_name: cleanData.first_name,
        last_name: cleanData.last_name
      },
      ip_address: getClientIp(req)
    });

    req.flash('success_msg', `Pasien tersimpan dengan kode ${patientCode}.`);
    return res.redirect(`/admin/patients/${patientId}`);
  } catch (error) {
    console.error('storeNewPatient error:', error);
    await unlinkAbsolute(fileOps.rollbackAbs);
    req.session.oldForm = req.body;
    req.flash('error_msg', getPatientSaveErrorMessage(error, 'Gagal menyimpan data pasien.'));
    return res.redirect(newPatientFormUrl(req.body && req.body.form_type));
  }
}

async function newVisitForm(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      req.flash('error_msg', 'ID pasien tidak valid.');
      return res.redirect('/admin/patients');
    }
    const patient = await patientModel.getPatientById(id);
    if (!patient) {
      req.flash('error_msg', 'Data pasien tidak ditemukan.');
      return res.redirect('/admin/patients');
    }
    if (patient.form_type !== 'cardiology') {
      req.flash('error_msg', 'Formulir kunjungan lanjutan saat ini hanya untuk jenis form kardiologi.');
      return res.redirect(`/admin/patients/${id}`);
    }
    const dupQ = String(req.query.duplicate || '').toLowerCase();
    const duplicateRequested = dupQ === '1' || dupQ === 'true' || dupQ === 'yes';

    let visits = [];
    try {
      visits = await patientVisitModel.listVisitsByPatientId(id);
    } catch (e) {
      visits = [];
    }
    const hasPreviousVisits = visits.length > 0;

    const emptyClinical = {
      primary_diagnosis: null,
      secondary_diagnoses: null,
      cardiac_history: null,
      has_hypertension: 0,
      has_diabetes: 0,
      has_dyslipidemia: 0,
      has_smoking: 0,
      has_obesity: 0,
      has_family_history: 0,
      has_ckd: 0,
      has_previous_mi: 0,
      has_atrial_fibrillation: 0,
      medications: null,
      medications_json: null,
      ecg_results: null,
      echo_results: null,
      lab_results: null,
      appointments_json: null,
      clinical_notes: null
    };

    let formPatient = Object.assign({}, patient, emptyClinical);
    let duplicatedFromVisitNumber = null;
    let duplicateLoadMessage = null;

    if (duplicateRequested) {
      if (visits.length) {
        const lastVisit = visits[visits.length - 1];
        duplicatedFromVisitNumber = lastVisit.visit_number;
        Object.assign(formPatient, clinicalFieldsFromVisitRow(lastVisit));
      } else {
        duplicateLoadMessage = 'Belum ada kunjungan sebelumnya yang bisa diduplikasi.';
      }
    }

    const clinicalPrefill = buildClinicalPrefill(formPatient);
    return res.render('admin/patients/visit_new', {
      title: 'Kunjungan baru',
      adminNav: adminNavHelpers.visitNew(patient),
      patient,
      formPatient,
      clinicalPrefill,
      duplicatedFromVisitNumber,
      duplicateLoadMessage,
      hasPreviousVisits
    });
  } catch (error) {
    console.error('newVisitForm error:', error);
    req.flash('error_msg', 'Gagal memuat formulir kunjungan.');
    return res.redirect('/admin/patients');
  }
}

async function storeNewVisit(req, res) {
  let fileOps = { rollbackAbs: [], unlinkPdfRelAfterSuccess: [] };
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      req.flash('error_msg', 'ID pasien tidak valid.');
      return res.redirect('/admin/patients');
    }
    const patient = await patientModel.getPatientById(id);
    if (!patient) {
      req.flash('error_msg', 'Data pasien tidak ditemukan.');
      return res.redirect('/admin/patients');
    }

    const body = { ...req.body };
    body.first_name = patient.first_name;
    body.last_name = patient.last_name;
    body.date_of_birth = patient.date_of_birth
      ? new Date(patient.date_of_birth).toISOString().slice(0, 10)
      : '';
    body.gender = patient.gender || '';
    body.phone = patient.phone || '';
    body.email = patient.email || '';
    body.address = patient.address || '';
    body.form_type = patient.form_type;

    const validated = validatePatientForm(body, req.files);
    fileOps = validated.fileOps || fileOps;
    const { errors, cleanData } = validated;

    if (errors.length > 0) {
      await unlinkAbsolute(fileOps.rollbackAbs);
      req.session.oldForm = req.body;
      req.flash('error_msg', errors[0]);
      return res.redirect(`/admin/patients/${id}/visits/new`);
    }

    const nextNum = await patientVisitModel.getNextVisitNumber(id);
    const visitedAt = parseVisitedAtInput(req.body);

    const visitInsertId = await patientVisitModel.insertVisit({
      patient_id: id,
      visit_number: nextNum,
      visited_at: visitedAt,
      primary_diagnosis: cleanData.primary_diagnosis,
      secondary_diagnoses: cleanData.secondary_diagnoses,
      cardiac_history: cleanData.cardiac_history,
      has_hypertension: cleanData.has_hypertension,
      has_diabetes: cleanData.has_diabetes,
      has_dyslipidemia: cleanData.has_dyslipidemia,
      has_smoking: cleanData.has_smoking,
      has_obesity: cleanData.has_obesity,
      has_family_history: cleanData.has_family_history,
      has_ckd: cleanData.has_ckd,
      has_previous_mi: cleanData.has_previous_mi,
      has_atrial_fibrillation: cleanData.has_atrial_fibrillation,
      medications: cleanData.medications,
      medications_json: cleanData.medications_json,
      ecg_results: cleanData.ecg_results,
      echo_results: cleanData.echo_results,
      lab_results: cleanData.lab_results,
      appointments_json: cleanData.appointments_json,
      clinical_notes: cleanData.clinical_notes
    });

    const visitRow = await patientVisitModel.getVisitById(visitInsertId);
    await patientModel.syncPatientClinicalFromVisit(id, visitRow);
    await unlinkPublicRelative(fileOps.unlinkPdfRelAfterSuccess);

    await auditLogModel.createAuditLog({
      user_id: req.session.admin?.id || null,
      module: 'patients',
      action: 'create_visit',
      record_id: id,
      description: `Kunjungan ke-${nextNum} untuk ${patient.patient_code}`,
      old_data: null,
      new_data: { visit_number: nextNum, visited_at: visitedAt },
      ip_address: getClientIp(req)
    });

    req.flash('success_msg', `Kunjungan ke-${nextNum} berhasil dicatat.`);
    return res.redirect(`/admin/patients/${id}`);
  } catch (error) {
    console.error('storeNewVisit error:', error);
    await unlinkAbsolute(fileOps.rollbackAbs);
    req.session.oldForm = req.body;
    if (patientModel.isMissingPatientVisitsTableError(error)) {
      req.flash(
        'error_msg',
        'Tabel kunjungan (patient_visits) belum ada di database. Jalankan migrasi sekali: npm run migrate:patient-visits (atau eksekusi manual berkas utils/migrations/add_patient_visits.sql), lalu coba lagi.'
      );
    } else {
      req.flash('error_msg', 'Gagal menyimpan kunjungan.');
    }
    return res.redirect(`/admin/patients/${req.params.id}/visits/new`);
  }
}

async function deleteVisit(req, res) {
  try {
    const id = Number(req.params.id);
    const visitId = Number(req.params.visitId);

    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(visitId) || visitId <= 0) {
      req.flash('error_msg', 'Parameter tidak valid.');
      return res.redirect('/admin/patients');
    }

    const patient = await patientModel.getPatientById(id);
    if (!patient) {
      req.flash('error_msg', 'Data pasien tidak ditemukan.');
      return res.redirect('/admin/patients');
    }

    let visits = [];
    try {
      visits = await patientVisitModel.listVisitsByPatientId(id);
    } catch (e) {
      visits = [];
    }

    if (visits.length <= 1) {
      req.flash(
        'error_msg',
        'Tidak dapat menghapus kunjungan terakhir. Gunakan hapus pasien di bagian atas jika ingin menghapus seluruh rekam.'
      );
      return res.redirect(`/admin/patients/${id}`);
    }

    const target = visits.find((v) => Number(v.id) === visitId);
    if (!target) {
      req.flash('error_msg', 'Kunjungan tidak ditemukan.');
      return res.redirect(`/admin/patients/${id}`);
    }

    const ok = await patientVisitModel.deleteVisitForPatient(visitId, id);
    if (!ok) {
      req.flash('error_msg', 'Gagal menghapus kunjungan.');
      return res.redirect(`/admin/patients/${id}`);
    }

    const remaining = await patientVisitModel.listVisitsByPatientId(id);
    const latest = remaining.length ? remaining[remaining.length - 1] : null;
    if (latest) {
      await patientModel.syncPatientClinicalFromVisit(id, latest);
    }

    await auditLogModel.createAuditLog({
      user_id: req.session.admin?.id || null,
      module: 'patients',
      action: 'delete_visit',
      record_id: id,
      description: `Menghapus kunjungan ke-${target.visit_number} (${patient.patient_code})`,
      old_data: { visit_id: visitId, visit_number: target.visit_number },
      new_data: null,
      ip_address: getClientIp(req)
    });

    req.flash('success_msg', `Kunjungan ke-${target.visit_number} berhasil dihapus.`);
    return res.redirect(`/admin/patients/${id}`);
  } catch (error) {
    console.error('deleteVisit error:', error);
    req.flash('error_msg', 'Gagal menghapus kunjungan.');
    const pid = Number(req.params.id);
    return res.redirect(Number.isInteger(pid) && pid > 0 ? `/admin/patients/${pid}` : '/admin/patients');
  }
}

async function visitQueueToday(req, res) {
  const tz = process.env.CLINIC_TIMEZONE || 'Asia/Jakarta';
  const todayYmd = ymdInTimeZone(new Date(), tz);
  const rawDate = parseYmdParam(req.query.date);
  const queueDate = rawDate || todayYmd;

  let queueItems = [];
  try {
    const rows = await patientVisitModel.fetchAppointmentQueueSources();
    queueItems = buildVisitQueueItems(rows, queueDate);
  } catch (error) {
    console.error('visitQueueToday error:', error);
    req.flash(
      'error_msg',
      'Gagal memuat daftar janji. Pastikan migrasi tabel kunjungan sudah dijalankan (npm run migrate:patient-visits).'
    );
  }

  const queueDateLabel = formatDateId(queueDate);

  const prevDate = shiftYmd(queueDate, -1);
  const nextDate = shiftYmd(queueDate, 1);

  return res.render('admin/visit_queue_today', {
    title: 'Antrian hari ini',
    adminNav: adminNavHelpers.visitQueueToday(),
    queueDate,
    queueDateLabel,
    todayYmd,
    clinicTimezone: tz,
    queueItems,
    prevDate,
    nextDate,
    isToday: queueDate === todayYmd
  });
}

async function deletePatient(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      req.flash('error_msg', 'ID pasien tidak valid.');
      return res.redirect('/admin/patients');
    }

    const existingPatient = await patientModel.getPatientById(id);

    if (!existingPatient) {
      req.flash('error_msg', 'Data pasien tidak ditemukan.');
      return res.redirect('/admin/patients');
    }

    await patientModel.softDeletePatient(id);

    await auditLogModel.createAuditLog({
      user_id: req.session.admin?.id || null,
      module: 'patients',
      action: 'delete',
      record_id: id,
      description: `Admin soft deleted patient ${existingPatient.patient_code}`,
      old_data: existingPatient,
      new_data: null,
      ip_address: getClientIp(req)
    });

    req.flash('success_msg', 'Data pasien berhasil dihapus.');
    return res.redirect('/admin/patients');
  } catch (error) {
    console.error('deletePatient error:', error);
    req.flash('error_msg', 'Gagal menghapus data pasien.');
    return res.redirect('/admin/patients');
  }
}

module.exports = {
  dashboard,
  visitQueueToday,
  indexPatients,
  showPatient,
  newPatientForm,
  storeNewPatient,
  newVisitForm,
  storeNewVisit,
  editPatientForm,
  updatePatient,
  deleteVisit,
  deletePatient
};