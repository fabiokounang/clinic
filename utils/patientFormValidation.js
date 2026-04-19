const { normalizeCheckbox } = require('./helpers');
const { parseClinicalFromBody } = require('./clinicalForm');

function sanitizeText(value, maxLength = 255) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function sanitizeTextarea(value, maxLength = 5000) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, maxLength);
}

function validatePatientForm(body, files) {
  const errors = [];

  const firstName = sanitizeText(body.first_name, 100);
  const lastName = sanitizeText(body.last_name, 100);
  const dateOfBirth = sanitizeText(body.date_of_birth, 20);
  const gender = sanitizeText(body.gender, 20);
  const phone = sanitizeText(body.phone, 30);
  const email = sanitizeText(body.email, 150);
  const address = sanitizeTextarea(body.address, 1000);

  const formType = sanitizeText(body.form_type || 'cardiology', 50);
  const primaryDiagnosis = sanitizeText(body.primary_diagnosis, 255);
  const secondaryDiagnoses = sanitizeTextarea(body.secondary_diagnoses, 2000);
  const cardiacHistory = sanitizeTextarea(body.cardiac_history, 3000);
  const clinical =
    formType === 'cardiology'
      ? parseClinicalFromBody(body, { files: files || {}, existingPatient: null })
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

  return {
    errors,
    cleanData: {
      form_type: formType,
      first_name: firstName,
      last_name: lastName,
      date_of_birth: dateOfBirth || null,
      gender: gender || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
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
    },
    fileOps: {
      rollbackAbs: clinical._uploadRollbackAbs || [],
      unlinkPdfRelAfterSuccess: clinical._unlinkPdfRelAfterSuccess || []
    }
  };
}

module.exports = {
  validatePatientForm,
  sanitizeText,
  sanitizeTextarea
};
