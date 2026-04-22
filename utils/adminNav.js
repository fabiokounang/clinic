/**
 * Objek navigasi atas panel admin (judul + kembali) — dipass ke res.render sebagai adminNav.
 * @typedef {{ pageTitle: string, backItems?: { href: string, label: string }[], subtitle?: string, hint?: string }} AdminNav
 */

/** @returns {AdminNav} */
function dashboard() {
  return { pageTitle: 'Dashboard', backItems: [] };
}

/** @returns {AdminNav} */
function visitQueueToday() {
  return {
    pageTitle: 'Antrian hari ini',
    subtitle: 'Janji kontrol dari data pasien (bagian Janji & kontrol).',
    backItems: []
  };
}

/** @returns {AdminNav} */
function patientsIndex() {
  return { pageTitle: 'Pasien', backItems: [] };
}

/** @returns {AdminNav} */
function patientShow() {
  return {
    pageTitle: 'Detail pasien',
    backItems: [{ href: '/admin/patients', label: 'Daftar pasien' }]
  };
}

/**
 * @param {object} patient
 * @param {number | null | undefined} editingVisitNumber
 */
function patientEdit(patient, editingVisitNumber) {
  const id = patient && patient.id;
  const subtitle =
    editingVisitNumber != null && editingVisitNumber !== ''
      ? `Mengedit kunjungan ke-${editingVisitNumber}`
      : '';
  return {
    pageTitle: 'Edit pasien',
    subtitle,
    hint: 'Perubahan akan tercatat di audit log.',
    backItems: [
      { href: `/admin/patients/${id}`, label: 'Detail pasien' },
      { href: '/admin/patients', label: 'Daftar pasien' }
    ]
  };
}

/** @returns {AdminNav} */
function chooseFormType() {
  return {
    pageTitle: 'Tambah pasien',
    subtitle: 'Pilih jenis form terlebih dahulu, lalu isi data pasien.',
    backItems: []
  };
}

/**
 * @param {string[]} formTypesSlugs — slug aktif (untuk urutan kembali)
 */
function patientNew(_formTypesSlugs) {
  return {
    pageTitle: 'Tambah pasien',
    backItems: []
  };
}

/**
 * @param {object} patient
 */
function visitNew(patient) {
  const id = patient && patient.id;
  const name = [patient && patient.first_name, patient && patient.last_name].filter(Boolean).join(' ').trim();
  return {
    pageTitle: 'Kunjungan baru',
    subtitle: `${name || 'Pasien'} — catat pemeriksaan untuk kunjungan ini. Identitas pasien tidak diubah di sini.`,
    backItems: [
      { href: `/admin/patients/${id}`, label: 'Detail pasien' },
      { href: '/admin/patients', label: 'Daftar pasien' }
    ]
  };
}

/** @returns {AdminNav} */
function staffIndex() {
  return {
    pageTitle: 'Kelola staf',
    backItems: []
  };
}

/** @returns {AdminNav} */
function staffNew() {
  return {
    pageTitle: 'Tambah staf',
    backItems: []
  };
}

/**
 * @param {object} staff — { email }
 */
function staffEdit(staff) {
  return {
    pageTitle: 'Edit staf',
    subtitle: staff && staff.email ? String(staff.email) : '',
    backItems: []
  };
}

module.exports = {
  dashboard,
  visitQueueToday,
  patientsIndex,
  patientShow,
  patientEdit,
  chooseFormType,
  patientNew,
  visitNew,
  staffIndex,
  staffNew,
  staffEdit
};
