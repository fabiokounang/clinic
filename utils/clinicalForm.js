/**
 * Parse repeatable fields from patient intake (staf/admin).
 * Hasil pemeriksaan (ECG / Echo / Lab): objek { mode: 'text'|'pdf', text, pdf } atau legacy array string.
 */

function normalizeArrayField(raw) {
  if (raw == null || raw === '') {
    return [];
  }
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map((s) => String(s).trim());
}

function parseMedicationRows(body) {
  const names = normalizeArrayField(body.med_name);
  const doses = normalizeArrayField(body.med_dose);
  const freqs = normalizeArrayField(body.med_freq);
  const n = Math.max(names.length, doses.length, freqs.length);
  const out = [];

  for (let i = 0; i < n; i += 1) {
    const name = (names[i] || '').slice(0, 200);
    const dose = (doses[i] || '').slice(0, 200);
    const frequency = (freqs[i] || '').slice(0, 200);
    if (!name && !dose && !frequency) {
      continue;
    }
    out.push({ name, dose, frequency });
  }

  return out;
}

function parseAppointments(body) {
  const dts = normalizeArrayField(body.appt_datetime);
  const notes = normalizeArrayField(body.appt_note);
  const n = Math.max(dts.length, notes.length);
  const out = [];

  for (let i = 0; i < n; i += 1) {
    const datetime = (dts[i] || '').slice(0, 80);
    const note = (notes[i] || '').slice(0, 500);
    if (!datetime && !note) {
      continue;
    }
    out.push({ datetime, note });
  }

  return out.slice(0, 40);
}

function medicationsToLegacyText(rows) {
  if (!rows || !rows.length) {
    return null;
  }
  return rows
    .map((r) => {
      const parts = [r.name, r.dose, r.frequency].filter(Boolean);
      return parts.join(' · ');
    })
    .join('\n');
}

function jsonOrNull(value) {
  if (value == null) {
    return null;
  }
  if (Array.isArray(value) && value.length === 0) {
    return null;
  }
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
    return null;
  }
  return JSON.stringify(value);
}

function safeParseJson(val) {
  if (val == null || val === '') {
    return null;
  }
  if (typeof val === 'object') {
    return val;
  }
  try {
    return JSON.parse(String(val));
  } catch (e) {
    return null;
  }
}

/**
 * Satu blok hasil pemeriksaan untuk form & tampilan.
 */
function normalizeExamForForm(raw) {
  const p = safeParseJson(raw);
  if (p && typeof p === 'object' && !Array.isArray(p) && (p.mode === 'text' || p.mode === 'pdf')) {
    return {
      mode: p.mode,
      text: typeof p.text === 'string' ? p.text : '',
      pdf: typeof p.pdf === 'string' ? p.pdf : ''
    };
  }
  if (Array.isArray(p) && p.length) {
    const text = p.map((s) => String(s || '').trim()).filter(Boolean).join('\n');
    return { mode: 'text', text, pdf: '' };
  }
  return { mode: 'text', text: '', pdf: '' };
}

function getUploadedFile(files, fieldName) {
  if (!files || !files[fieldName] || !files[fieldName][0]) {
    return null;
  }
  return files[fieldName][0];
}

function parseExamSection(body, files, key, existingRaw) {
  const prev = normalizeExamForForm(existingRaw);
  const mode = body[`${key}_mode`] === 'pdf' ? 'pdf' : 'text';
  const text = typeof body[`${key}_text`] === 'string' ? body[`${key}_text`].trim().slice(0, 8000) : '';
  const existingPdfField =
    typeof body[`${key}_existing_pdf`] === 'string' ? body[`${key}_existing_pdf`].trim() : '';

  const uploaded = getUploadedFile(files, `${key}_pdf`);
  const rollbackAbs = [];
  if (uploaded && uploaded.path) {
    rollbackAbs.push(uploaded.path);
  }

  let pdfRel = null;
  if (mode === 'pdf') {
    if (uploaded && uploaded.filename) {
      pdfRel = `/uploads/clinical/${uploaded.filename}`;
    } else if (existingPdfField && existingPdfField.startsWith('/uploads/')) {
      pdfRel = existingPdfField;
    } else if (prev.pdf && prev.pdf.startsWith('/uploads/')) {
      pdfRel = prev.pdf;
    }
  }

  const newPdf = mode === 'pdf' ? pdfRel : null;
  const obj = {
    mode,
    text,
    pdf: newPdf
  };

  const unlinkRelAfterSuccess = [];
  if (prev.pdf && prev.pdf.startsWith('/uploads/clinical/')) {
    if (!newPdf || newPdf !== prev.pdf) {
      unlinkRelAfterSuccess.push(prev.pdf);
    }
  }

  return { obj, rollbackAbs, unlinkRelAfterSuccess };
}

function mergeExamRollbacks(parts) {
  const rollbackAbs = [];
  const unlinkRelAfterSuccess = [];
  for (const p of parts) {
    rollbackAbs.push(...(p.rollbackAbs || []));
    unlinkRelAfterSuccess.push(...(p.unlinkRelAfterSuccess || []));
  }
  return { rollbackAbs, unlinkRelAfterSuccess };
}

function parseClinicalFromBody(body, options = {}) {
  const { files: fileMap = null, existingPatient = null } = options;

  const medicationsList = parseMedicationRows(body);
  const appointments = parseAppointments(body);
  const clinical_notes = typeof body.clinical_notes === 'string' ? body.clinical_notes.trim().slice(0, 8000) : '';

  let ecg_results = null;
  let echo_results = null;
  let lab_results = null;
  let rollbackAbs = [];
  let unlinkRelAfterSuccess = [];

  if (fileMap != null) {
    const files = fileMap || {};
    const exEcg = parseExamSection(body, files, 'ecg', existingPatient && existingPatient.ecg_results);
    const exEcho = parseExamSection(body, files, 'echo', existingPatient && existingPatient.echo_results);
    const exLab = parseExamSection(body, files, 'lab', existingPatient && existingPatient.lab_results);
    ecg_results = jsonOrNull(exEcg.obj);
    echo_results = jsonOrNull(exEcho.obj);
    lab_results = jsonOrNull(exLab.obj);
    const merged = mergeExamRollbacks([exEcg, exEcho, exLab]);
    rollbackAbs = merged.rollbackAbs;
    unlinkRelAfterSuccess = merged.unlinkRelAfterSuccess;
  } else {
    const legacyEcg = normalizeArrayField(body.ecg_entry)
      .map((s) => s.slice(0, 4000))
      .filter(Boolean)
      .slice(0, 25);
    const legacyEcho = normalizeArrayField(body.echo_entry)
      .map((s) => s.slice(0, 4000))
      .filter(Boolean)
      .slice(0, 25);
    const legacyLab = normalizeArrayField(body.lab_entry)
      .map((s) => s.slice(0, 4000))
      .filter(Boolean)
      .slice(0, 25);

    ecg_results = legacyEcg.length ? jsonOrNull({ mode: 'text', text: legacyEcg.join('\n'), pdf: null }) : null;
    echo_results = legacyEcho.length ? jsonOrNull({ mode: 'text', text: legacyEcho.join('\n'), pdf: null }) : null;
    lab_results = legacyLab.length ? jsonOrNull({ mode: 'text', text: legacyLab.join('\n'), pdf: null }) : null;
  }

  return {
    medications_list: medicationsList,
    medications_legacy: medicationsToLegacyText(medicationsList),
    medications_json: jsonOrNull(medicationsList),
    ecg_results,
    echo_results,
    lab_results,
    appointments_json: jsonOrNull(appointments),
    clinical_notes: clinical_notes || null,
    _uploadRollbackAbs: rollbackAbs,
    _unlinkPdfRelAfterSuccess: unlinkRelAfterSuccess
  };
}

function buildClinicalPrefill(patient) {
  const meds = safeParseJson(patient.medications_json);
  const medList = Array.isArray(meds) && meds.length ? meds : [{ name: '', dose: '', frequency: '' }];

  const appts = safeParseJson(patient.appointments_json);
  const apptList =
    Array.isArray(appts) && appts.length
      ? appts
      : [{ datetime: '', note: '' }];

  return {
    medications: medList,
    ecg: normalizeExamForForm(patient.ecg_results),
    echo: normalizeExamForForm(patient.echo_results),
    labs: normalizeExamForForm(patient.lab_results),
    appointments: apptList,
    clinical_notes: patient.clinical_notes || ''
  };
}

/**
 * Path relatif (/uploads/...) → URL absolut agar bisa dibuka dari Excel/PDF ekspor.
 */
function resolvePublicFileUrl(relativeOrAbsolute, baseUrl) {
  if (!relativeOrAbsolute || !baseUrl) {
    return relativeOrAbsolute ? String(relativeOrAbsolute).trim() : '';
  }
  const p = String(relativeOrAbsolute).trim();
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) {
    return p;
  }
  const base = String(baseUrl).replace(/\/$/, '');
  const path = p.startsWith('/') ? p : `/${p}`;
  return `${base}${path}`;
}

/** Untuk ekspor / ringkasan teks satu kolom. `baseUrl` opsional: jika ada, path PDF dijadikan URL absolut. */
function formatExamForExport(raw, baseUrl) {
  const ex = normalizeExamForForm(raw);
  if (ex.mode === 'pdf' && ex.pdf) {
    const note = ex.text ? ` — ${ex.text}` : '';
    const href = baseUrl ? resolvePublicFileUrl(ex.pdf, baseUrl) : ex.pdf;
    return `PDF: ${href}${note}`;
  }
  return ex.text || '';
}

module.exports = {
  parseClinicalFromBody,
  medicationsToLegacyText,
  jsonOrNull,
  normalizeArrayField,
  safeParseJson,
  buildClinicalPrefill,
  normalizeExamForForm,
  formatExamForExport,
  resolvePublicFileUrl
};
