const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const patientModel = require('../models/patient');
const auditLogModel = require('../models/audit_log');
const { getClientIp, getSiteBaseUrl } = require('../utils/request');
const {
  safeParseJson,
  formatExamForExport,
  normalizeExamForForm,
  resolvePublicFileUrl
} = require('../utils/clinicalForm');
const { parsePatientListDateRange } = require('../utils/dashboardRange');
const { formatDateId, formatDateTimeId, formatVisitDateId } = require('../utils/dateDisplay');

function drawSectionTitle(doc, title) {
  doc.fontSize(11).fillColor('#0f172a').font('Helvetica-Bold').text(title);
  doc.moveDown(0.25);
  doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(doc.x, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.45);
}

function drawField(doc, label, value) {
  doc
    .fontSize(9.5)
    .fillColor('#334155')
    .font('Helvetica-Bold')
    .text(`${label}: `, { continued: true });
  doc.font('Helvetica').fillColor('#0f172a').text(value || '—');
}

function drawBlock(doc, value) {
  doc.fontSize(9.5).fillColor('#1e293b').font('Helvetica').text(value || '—', { lineGap: 3 });
}

function riskYaTidak(value) {
  return value ? 'Ya' : 'Tidak';
}

function riskLabelsIndo(item) {
  return [
    item.has_hypertension && 'Hipertensi',
    item.has_diabetes && 'Diabetes',
    item.has_dyslipidemia && 'Dislipidemia',
    item.has_smoking && 'Merokok',
    item.has_obesity && 'Obesitas',
    item.has_family_history && 'Riwayat keluarga',
    item.has_ckd && 'CKD',
    item.has_previous_mi && 'Infark sebelumnya',
    item.has_atrial_fibrillation && 'Atrial fibrilasi'
  ]
    .filter(Boolean)
    .join(', ') || '—';
}

function formatMedicationsStructured(val) {
  const p = safeParseJson(val);
  if (!Array.isArray(p) || !p.length) {
    return '';
  }
  return p
    .map((m) => {
      if (!m || typeof m !== 'object') return '';
      return [m.name, m.dose, m.frequency].filter(Boolean).join(' · ');
    })
    .filter(Boolean)
    .join(' | ');
}

function formatAppointmentDatetimeDisplay(raw) {
  if (raw == null || raw === '') return '';
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return formatDateTimeId(d);
  }
  return String(raw).trim();
}

function formatAppointmentsField(val) {
  const p = safeParseJson(val);
  if (!Array.isArray(p) || !p.length) {
    return '';
  }
  return p
    .map((a) => {
      if (!a || typeof a !== 'object') return '';
      const dt = a.datetime ? formatAppointmentDatetimeDisplay(a.datetime) : '';
      return [dt, a.note].filter(Boolean).join(' — ');
    })
    .filter(Boolean)
    .join(' || ');
}

function getExcelColumns() {
  return [
    { header: 'Kunjungan ke', key: 'visit_number', width: 12 },
    { header: 'Tgl kunjungan', key: 'visited_at', width: 26 },
    { header: 'Kode pasien', key: 'patient_code', width: 16 },
    { header: 'Jenis form', key: 'form_type', width: 14 },
    { header: 'Nama depan', key: 'first_name', width: 16 },
    { header: 'Nama belakang', key: 'last_name', width: 16 },
    { header: 'Tanggal lahir', key: 'date_of_birth', width: 18 },
    { header: 'Jenis kelamin', key: 'gender', width: 12 },
    { header: 'Telepon', key: 'phone', width: 16 },
    { header: 'Email', key: 'email', width: 22 },
    { header: 'Alamat', key: 'address', width: 28 },
    { header: 'Diagnosis utama', key: 'primary_diagnosis', width: 26 },
    { header: 'Diagnosis sekunder', key: 'secondary_diagnoses', width: 26 },
    { header: 'Riwayat jantung', key: 'cardiac_history', width: 26 },
    { header: 'Hipertensi', key: 'has_hypertension', width: 10 },
    { header: 'Diabetes', key: 'has_diabetes', width: 10 },
    { header: 'Dislipidemia', key: 'has_dyslipidemia', width: 12 },
    { header: 'Merokok', key: 'has_smoking', width: 10 },
    { header: 'Obesitas', key: 'has_obesity', width: 10 },
    { header: 'Riwayat keluarga', key: 'has_family_history', width: 14 },
    { header: 'CKD', key: 'has_ckd', width: 8 },
    { header: 'Infark sebelumnya', key: 'has_previous_mi', width: 14 },
    { header: 'Atrial fibrilasi', key: 'has_atrial_fibrillation', width: 14 },
    { header: 'Obat (teks)', key: 'medications', width: 28 },
    { header: 'Obat (struktur)', key: 'medications_structured', width: 36 },
    { header: 'ECG', key: 'ecg_export', width: 36 },
    { header: 'Echo', key: 'echo_export', width: 36 },
    { header: 'Lab', key: 'lab_export', width: 36 },
    { header: 'Janji kontrol', key: 'appointments_export', width: 32 },
    { header: 'Catatan klinis', key: 'clinical_notes', width: 36 },
    { header: 'Dibuat', key: 'created_at', width: 28 }
  ];
}

/** Sel Excel: teks biasa atau hyperlink dengan label manusiawi (bukan URL mentah). */
function excelCellForExam(raw, baseUrl, linkLabel) {
  const ex = normalizeExamForForm(raw);
  if (ex.mode === 'pdf' && ex.pdf && baseUrl) {
    const url = resolvePublicFileUrl(ex.pdf, baseUrl);
    const title = linkLabel || 'Hasil pemeriksaan';
    const displayText =
      ex.text && String(ex.text).trim() ? `${title} — ${String(ex.text).trim()}` : title;
    return { text: displayText, hyperlink: url, tooltip: url };
  }
  return formatExamForExport(raw, baseUrl) || '';
}

function mapRowForExcel(item, baseUrl) {
  const structured = formatMedicationsStructured(
    item.medications_json != null ? item.medications_json : item.medications
  );
  return {
    visit_number: item.visit_number != null && item.visit_number !== '' ? item.visit_number : '—',
    visited_at: item.visited_at ? formatVisitDateId(item.visited_at) : formatDateTimeId(item.created_at),
    patient_code: item.patient_code,
    form_type: item.form_type,
    first_name: item.first_name,
    last_name: item.last_name,
    date_of_birth: formatDateId(item.date_of_birth),
    gender: item.gender,
    phone: item.phone,
    email: item.email,
    address: item.address,
    primary_diagnosis: item.primary_diagnosis,
    secondary_diagnoses: item.secondary_diagnoses,
    cardiac_history: item.cardiac_history,
    has_hypertension: riskYaTidak(item.has_hypertension),
    has_diabetes: riskYaTidak(item.has_diabetes),
    has_dyslipidemia: riskYaTidak(item.has_dyslipidemia),
    has_smoking: riskYaTidak(item.has_smoking),
    has_obesity: riskYaTidak(item.has_obesity),
    has_family_history: riskYaTidak(item.has_family_history),
    has_ckd: riskYaTidak(item.has_ckd),
    has_previous_mi: riskYaTidak(item.has_previous_mi),
    has_atrial_fibrillation: riskYaTidak(item.has_atrial_fibrillation),
    medications: item.medications,
    medications_structured: structured || '',
    ecg_export: excelCellForExam(item.ecg_results, baseUrl, 'Hasil EKG (ECG)'),
    echo_export: excelCellForExam(item.echo_results, baseUrl, 'Hasil Ekokardiogram'),
    lab_export: excelCellForExam(item.lab_results, baseUrl, 'Hasil Laboratorium'),
    appointments_export: formatAppointmentsField(item.appointments_json),
    clinical_notes: item.clinical_notes || '',
    created_at: formatDateTimeId(item.created_at)
  };
}

function buildWorkbookWithPatients(rows, baseUrl) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Pasien');
  worksheet.columns = getExcelColumns();
  worksheet.getRow(1).font = { bold: true };

  rows.forEach((item) => {
    worksheet.addRow(mapRowForExcel(item, baseUrl));
  });

  return workbook;
}

function drawExamSectionForPdf(doc, raw, baseUrl, linkLabel) {
  const ex = normalizeExamForForm(raw);
  if (ex.mode === 'pdf' && ex.pdf) {
    const href = baseUrl ? resolvePublicFileUrl(ex.pdf, baseUrl) : String(ex.pdf).trim();
    const title = linkLabel || 'Hasil pemeriksaan';

    if (ex.text && String(ex.text).trim()) {
      doc.fontSize(9.5).fillColor('#1e293b').font('Helvetica').text(String(ex.text).trim(), { lineGap: 3 });
      doc.moveDown(0.35);
    }
    const linkTarget = /^https?:\/\//i.test(href) ? href : null;
    doc.fontSize(9.5).font('Helvetica');
    if (linkTarget) {
      doc.fillColor('#0d9488').text(title, { link: linkTarget, underline: true });
    } else {
      doc.fillColor('#0f172a').text(title || href || '—');
    }
    return;
  }
  drawBlock(doc, ex.text || '—');
}

function renderPdfPatientPage(doc, item, baseUrl, visitMeta) {
  doc.fontSize(16).fillColor('#0f172a').font('Helvetica-Bold').text('Ringkasan pasien', { align: 'center' });
  doc.moveDown(0.4);
  doc
    .fontSize(9)
    .fillColor('#64748b')
    .font('Helvetica')
    .text(`Dicetak: ${formatDateTimeId(new Date())}`, { align: 'center' });
  doc.moveDown(1.2);

  doc.fontSize(15).fillColor('#0f172a').font('Helvetica-Bold').text(`${item.first_name} ${item.last_name}`);
  doc.moveDown(0.4);
  if (visitMeta && visitMeta.visit_number) {
    doc
      .fontSize(11)
      .fillColor('#0f766e')
      .font('Helvetica-Bold')
      .text(
        `Kunjungan ke-${visitMeta.visit_number} · ${formatVisitDateId(visitMeta.visited_at)}`,
        { align: 'left' }
      );
    doc.moveDown(0.35);
  }
  doc.fontSize(10).fillColor('#475569').font('Helvetica');
  doc.text(`Kode: ${item.patient_code}  ·  Form: ${item.form_type}`);
  doc.text(`Tanggal lahir: ${formatDateId(item.date_of_birth)}  ·  Kelamin: ${item.gender || '—'}`);
  doc.moveDown(0.9);

  drawSectionTitle(doc, 'Kontak');
  drawField(doc, 'Telepon', item.phone);
  drawField(doc, 'Email', item.email);
  drawField(doc, 'Alamat', item.address);

  doc.moveDown(0.8);
  drawSectionTitle(doc, 'Diagnosis');
  drawField(doc, 'Utama', item.primary_diagnosis);
  drawField(doc, 'Sekunder', item.secondary_diagnoses);

  doc.moveDown(0.8);
  drawSectionTitle(doc, 'Riwayat jantung');
  drawBlock(doc, item.cardiac_history);

  doc.moveDown(0.8);
  drawSectionTitle(doc, 'Faktor risiko');
  drawBlock(doc, riskLabelsIndo(item));

  doc.moveDown(0.8);
  drawSectionTitle(doc, 'Obat');
  const medStructured = formatMedicationsStructured(
    item.medications_json != null ? item.medications_json : item.medications
  );
  drawBlock(doc, medStructured || item.medications);

  doc.moveDown(0.8);
  drawSectionTitle(doc, 'ECG');
  drawExamSectionForPdf(doc, item.ecg_results, baseUrl, 'Hasil EKG (ECG)');

  doc.moveDown(0.8);
  drawSectionTitle(doc, 'Ekokardiogram');
  drawExamSectionForPdf(doc, item.echo_results, baseUrl, 'Hasil Ekokardiogram');

  doc.moveDown(0.8);
  drawSectionTitle(doc, 'Laboratorium');
  drawExamSectionForPdf(doc, item.lab_results, baseUrl, 'Hasil Laboratorium');

  doc.moveDown(0.8);
  drawSectionTitle(doc, 'Janji kontrol');
  drawBlock(doc, formatAppointmentsField(item.appointments_json) || '—');

  doc.moveDown(0.8);
  drawSectionTitle(doc, 'Catatan klinis');
  drawBlock(doc, item.clinical_notes);
}

function safeFileSegment(code) {
  return String(code || 'pasien').replace(/[^\w.-]+/g, '_').slice(0, 40);
}

async function exportPatientsExcel(req, res) {
  try {
    const search = String(req.query.search || '').trim();
    const formType = String(req.query.form_type || '').trim();
    const { dateFrom, dateTo } = parsePatientListDateRange(req.query);

    const baseUrl = getSiteBaseUrl(req);
    const rows = await patientModel.getPatientsForExport({ search, formType, dateFrom, dateTo });
    const workbook = buildWorkbookWithPatients(rows, baseUrl);

    await auditLogModel.createAuditLog({
      user_id: req.session.admin?.id || null,
      module: 'patients',
      action: 'export_excel',
      record_id: null,
      description: `Ekspor Excel semua pasien (${rows.length} baris)`,
      old_data: null,
      new_data: { search, formType, dateFrom, dateTo, total_rows: rows.length },
      ip_address: getClientIp(req)
    });

    const fileName = `pasien-semua-${Date.now()}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('exportPatientsExcel error:', error);
    req.flash('error_msg', 'Gagal ekspor Excel.');
    return res.redirect('/admin/patients');
  }
}

async function exportOnePatientExcel(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      req.flash('error_msg', 'ID pasien tidak valid.');
      return res.redirect('/admin/patients');
    }

    const rows = await patientModel.getPatientExportRows(id);
    if (!rows.length) {
      req.flash('error_msg', 'Data pasien tidak ditemukan.');
      return res.redirect('/admin/patients');
    }

    const patient = rows[0];
    const baseUrl = getSiteBaseUrl(req);
    const workbook = buildWorkbookWithPatients(rows, baseUrl);

    await auditLogModel.createAuditLog({
      user_id: req.session.admin?.id || null,
      module: 'patients',
      action: 'export_excel',
      record_id: id,
      description: `Ekspor Excel semua kunjungan ${patient.patient_code} (${rows.length} baris)`,
      old_data: null,
      new_data: { patient_code: patient.patient_code, visit_rows: rows.length },
      ip_address: getClientIp(req)
    });

    const fileName = `pasien-${safeFileSegment(patient.patient_code)}-kunjungan-${Date.now()}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('exportOnePatientExcel error:', error);
    req.flash('error_msg', 'Gagal ekspor Excel.');
    return res.redirect(`/admin/patients/${req.params.id}`);
  }
}

async function exportPatientsPdf(req, res) {
  try {
    const search = String(req.query.search || '').trim();
    const formType = String(req.query.form_type || '').trim();
    const { dateFrom, dateTo } = parsePatientListDateRange(req.query);

    const baseUrl = getSiteBaseUrl(req);
    const rows = await patientModel.getPatientsForExport({ search, formType, dateFrom, dateTo });

    await auditLogModel.createAuditLog({
      user_id: req.session.admin?.id || null,
      module: 'patients',
      action: 'export_pdf',
      record_id: null,
      description: `Ekspor PDF semua pasien (${rows.length} rekaman)`,
      old_data: null,
      new_data: { search, formType, dateFrom, dateTo, total_rows: rows.length },
      ip_address: getClientIp(req)
    });

    const fileName = `pasien-semua-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    doc.pipe(res);

    rows.forEach((item, index) => {
      if (index > 0) {
        doc.addPage();
      }
      renderPdfPatientPage(doc, item, baseUrl);
    });

    doc.end();
  } catch (error) {
    console.error('exportPatientsPdf error:', error);
    req.flash('error_msg', 'Gagal ekspor PDF.');
    return res.redirect('/admin/patients');
  }
}

async function exportOnePatientPdf(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      req.flash('error_msg', 'ID pasien tidak valid.');
      return res.redirect('/admin/patients');
    }

    const rows = await patientModel.getPatientExportRows(id);
    if (!rows.length) {
      req.flash('error_msg', 'Data pasien tidak ditemukan.');
      return res.redirect('/admin/patients');
    }

    const baseUrl = getSiteBaseUrl(req);
    const first = rows[0];

    await auditLogModel.createAuditLog({
      user_id: req.session.admin?.id || null,
      module: 'patients',
      action: 'export_pdf',
      record_id: id,
      description: `Ekspor PDF semua kunjungan ${first.patient_code} (${rows.length} halaman)`,
      old_data: null,
      new_data: { patient_code: first.patient_code, visit_pages: rows.length },
      ip_address: getClientIp(req)
    });

    const fileName = `pasien-${safeFileSegment(first.patient_code)}-semua-kunjungan-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    doc.pipe(res);
    rows.forEach((row, index) => {
      if (index > 0) {
        doc.addPage();
      }
      const meta =
        row.visit_number != null
          ? { visit_number: row.visit_number, visited_at: row.visited_at }
          : null;
      renderPdfPatientPage(doc, row, baseUrl, meta);
    });
    doc.end();
  } catch (error) {
    console.error('exportOnePatientPdf error:', error);
    req.flash('error_msg', 'Gagal ekspor PDF.');
    return res.redirect(`/admin/patients/${req.params.id}`);
  }
}

async function exportVisitExcel(req, res) {
  try {
    const pid = Number(req.params.id);
    const vid = Number(req.params.visitId);
    if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(vid) || vid <= 0) {
      req.flash('error_msg', 'Parameter tidak valid.');
      return res.redirect('/admin/patients');
    }
    const rows = await patientModel.getPatientExportRows(pid);
    const row = rows.find((r) => Number(r.visit_id) === vid);
    if (!row) {
      req.flash('error_msg', 'Kunjungan tidak ditemukan.');
      return res.redirect(`/admin/patients/${pid}`);
    }
    const baseUrl = getSiteBaseUrl(req);
    const workbook = buildWorkbookWithPatients([row], baseUrl);

    await auditLogModel.createAuditLog({
      user_id: req.session.admin?.id || null,
      module: 'patients',
      action: 'export_excel',
      record_id: pid,
      description: `Ekspor Excel kunjungan #${row.visit_number} ${row.patient_code}`,
      old_data: null,
      new_data: { visit_id: vid, visit_number: row.visit_number },
      ip_address: getClientIp(req)
    });

    const fileName = `pasien-${safeFileSegment(row.patient_code)}-kunjungan-${row.visit_number}-${Date.now()}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('exportVisitExcel error:', error);
    req.flash('error_msg', 'Gagal ekspor Excel.');
    return res.redirect(`/admin/patients/${req.params.id}`);
  }
}

async function exportVisitPdf(req, res) {
  try {
    const pid = Number(req.params.id);
    const vid = Number(req.params.visitId);
    if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(vid) || vid <= 0) {
      req.flash('error_msg', 'Parameter tidak valid.');
      return res.redirect('/admin/patients');
    }
    const rows = await patientModel.getPatientExportRows(pid);
    const row = rows.find((r) => Number(r.visit_id) === vid);
    if (!row) {
      req.flash('error_msg', 'Kunjungan tidak ditemukan.');
      return res.redirect(`/admin/patients/${pid}`);
    }
    const baseUrl = getSiteBaseUrl(req);

    await auditLogModel.createAuditLog({
      user_id: req.session.admin?.id || null,
      module: 'patients',
      action: 'export_pdf',
      record_id: pid,
      description: `Ekspor PDF kunjungan #${row.visit_number} ${row.patient_code}`,
      old_data: null,
      new_data: { visit_id: vid, visit_number: row.visit_number },
      ip_address: getClientIp(req)
    });

    const fileName = `pasien-${safeFileSegment(row.patient_code)}-kunjungan-${row.visit_number}-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    doc.pipe(res);
    renderPdfPatientPage(doc, row, baseUrl, {
      visit_number: row.visit_number,
      visited_at: row.visited_at
    });
    doc.end();
  } catch (error) {
    console.error('exportVisitPdf error:', error);
    req.flash('error_msg', 'Gagal ekspor PDF.');
    return res.redirect(`/admin/patients/${req.params.id}`);
  }
}

module.exports = {
  exportPatientsExcel,
  exportPatientsPdf,
  exportOnePatientExcel,
  exportOnePatientPdf,
  exportVisitExcel,
  exportVisitPdf
};
