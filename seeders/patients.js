require('dotenv').config();

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { pool } = require('../utils/db');

const DEMO_PREFIX = 'PT-DEMO-';

/** Path publik (href) ke PDF demo — file dibuat saat seed */
const SEED_PDF_HREF = '/uploads/clinical/seed-demo.pdf';

function examText(text) {
  return JSON.stringify({ mode: 'text', text, pdf: '' });
}

function examPdf(note = '') {
  return JSON.stringify({ mode: 'pdf', text: note, pdf: SEED_PDF_HREF });
}

function medsJson(rows) {
  return JSON.stringify(rows);
}

function apptsJson(rows) {
  return JSON.stringify(rows);
}

/**
 * Pastikan ada file PDF kecil untuk mode PDF hasil pemeriksaan (pratinjau di UI).
 */
function ensureSeedPdfFile() {
  const dir = path.join(__dirname, '../public/uploads/clinical');
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, 'seed-demo.pdf');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(abs);
    doc.pipe(stream);
    doc.fontSize(16).fillColor('#0f766e').text('Dokumen demo hasil pemeriksaan', { align: 'center' });
    doc.moveDown();
    doc
      .fontSize(10)
      .fillColor('#334155')
      .text(
        'File ini dibuat otomatis oleh seed data. Di aplikasi asli, berkas diunggah dari formulir staf.',
        { align: 'left' }
      );
    doc.end();
    stream.on('finish', () => resolve(abs));
    stream.on('error', reject);
  });
}

const patients = [
  {
    patient_code: `${DEMO_PREFIX}01`,
    form_type: 'cardiology',
    first_name: 'Andi',
    last_name: 'Wijaya',
    date_of_birth: '1962-03-14',
    gender: 'male',
    phone: '+628121001001',
    email: 'andi.wijaya@email.test',
    address: 'Jl. Sudirman No. 45, Jakarta Selatan',
    primary_diagnosis: 'Penyakit arteri koroner stabil',
    secondary_diagnoses: 'Dislipidemia ringan',
    cardiac_history: 'Kateterisasi jantung 2019, stent pada LAD.',
    has_hypertension: 1,
    has_diabetes: 0,
    has_dyslipidemia: 1,
    has_smoking: 0,
    has_obesity: 0,
    has_family_history: 1,
    has_ckd: 0,
    has_previous_mi: 0,
    has_atrial_fibrillation: 0,
    medications: 'Aspirin 80 mg, Atorvastatin 20 mg, Bisoprolol 2.5 mg',
    medications_json: medsJson([{ name: 'Aspirin', dose: '80 mg', frequency: '1× sehari' }]),
    ecg_results: examText(
      'Kesimpulan: ritme sinus, frekuensi 72×/menit, tidak ada iskemia akut. Interval QTc dalam batas normal.'
    ),
    echo_results: examPdf('Ringkasan echo: FE 55%, tidak ada kelainan katup signifikan.'),
    lab_results: examText(
      'Kesimpulan lab: LDL 98 mg/dL, HbA1c 5,6%, fungsi ginjal dalam batas (eGFR 78).'
    ),
    appointments_json: apptsJson([{ datetime: '2026-05-10 09:00', note: 'Kontrol klinik' }]),
    clinical_notes: 'Pasien stabil; edukasi diet rendah lemak.'
  },
  {
    patient_code: `${DEMO_PREFIX}02`,
    form_type: 'cardiology',
    first_name: 'Siti',
    last_name: 'Rahayu',
    date_of_birth: '1975-11-02',
    gender: 'female',
    phone: '+628131002002',
    email: 'siti.rahayu@email.test',
    address: 'Perumahan Melati Blok C/12, Tangerang',
    primary_diagnosis: 'Hipertensi esensial',
    secondary_diagnoses: 'Gangguan ritme supraventrikular',
    cardiac_history: 'Holter 2023: episoda ESV ringan.',
    has_hypertension: 1,
    has_diabetes: 0,
    has_dyslipidemia: 1,
    has_smoking: 0,
    has_obesity: 1,
    has_family_history: 1,
    has_ckd: 0,
    has_previous_mi: 0,
    has_atrial_fibrillation: 0,
    medications: 'Amlodipine 5 mg, Perindopril 4 mg',
    medications_json: medsJson([
      { name: 'Amlodipine', dose: '5 mg', frequency: '1× sehari' },
      { name: 'Perindopril', dose: '4 mg', frequency: '1× sehari' }
    ]),
    ecg_results: examPdf('Laporan EKG terlampir; teks: tidak ada perubahan ST dinamis.'),
    echo_results: examText(
      'Kesimpulan: ventrikel kiri tidak membesar, fungsi sistolik baik (EF estimasi 60%).'
    ),
    lab_results: examText('Kesimpulan: profil lipid terkontrol; elektrolit normal.'),
    appointments_json: apptsJson([]),
    clinical_notes: null
  },
  {
    patient_code: `${DEMO_PREFIX}03`,
    form_type: 'cardiology',
    first_name: 'Budi',
    last_name: 'Santoso',
    date_of_birth: '1958-07-21',
    gender: 'male',
    phone: '+628141003003',
    email: null,
    address: 'Jl. Pahlawan No. 8, Bandung',
    primary_diagnosis: 'Gagal jantung kronis NYHA II',
    secondary_diagnoses: 'Fibrilasi atrium paroksismal',
    cardiac_history: 'Perikarditis tahun 2015, kontrol rutin di klinik.',
    has_hypertension: 1,
    has_diabetes: 1,
    has_dyslipidemia: 1,
    has_smoking: 1,
    has_obesity: 0,
    has_family_history: 1,
    has_ckd: 1,
    has_previous_mi: 0,
    has_atrial_fibrillation: 1,
    medications: 'Furosemide 40 mg, Apixaban 5 mg, Metformin 500 mg',
    medications_json: medsJson([
      { name: 'Furosemide', dose: '40 mg', frequency: '1× sehari' },
      { name: 'Apixaban', dose: '5 mg', frequency: '2× sehari' }
    ]),
    ecg_results: examText('Kesimpulan: FA dengan respon ventrikel terkontrol (~80/min).'),
    echo_results: examText(
      'Kesimpulan: dilatasi ringan VK, FE menurun (45%), hipertrofi septum ringan.'
    ),
    lab_results: examPdf('Hasil lab lengkap terlampir; catatan: kreatinin baseline untuk CKD.'),
    appointments_json: apptsJson([{ datetime: '2026-04-28 14:00', note: 'Echo kontrol' }]),
    clinical_notes: 'Pantau berat badan dan tekanan darah harian.'
  },
  {
    patient_code: `${DEMO_PREFIX}04`,
    form_type: 'cardiology',
    first_name: 'Dewi',
    last_name: 'Lestari',
    date_of_birth: '1988-01-30',
    gender: 'female',
    phone: '+628151004004',
    email: 'dewi.lestari@email.test',
    address: 'Apartemen Emerald Lt. 12, Surabaya',
    primary_diagnosis: 'Angina tidak stabil (suspisi)',
    secondary_diagnoses: 'Ansietas terkait nyeri dada',
    cardiac_history: 'Belum ada tindakan invasif; rujukan dari Puskesmas.',
    has_hypertension: 0,
    has_diabetes: 0,
    has_dyslipidemia: 1,
    has_smoking: 0,
    has_obesity: 0,
    has_family_history: 1,
    has_ckd: 0,
    has_previous_mi: 0,
    has_atrial_fibrillation: 0,
    medications: 'ISDN 5 mg sesuai kebutuhan, Simvastatin 20 mg',
    medications_json: medsJson([{ name: 'Simvastatin', dose: '20 mg', frequency: 'malam' }]),
    ecg_results: examPdf('EKG saat nyeri: ST depresi difus — rujuk IGD.'),
    echo_results: examPdf('Echo darurat: tidak ada motilitas abnormal terfokus.'),
    lab_results: examText('Kesimpulan: troponin negatif serial, CK-MB normal.'),
    appointments_json: apptsJson([]),
    clinical_notes: 'Observasi gejala iskemia.'
  },
  {
    patient_code: `${DEMO_PREFIX}05`,
    form_type: 'cardiology',
    first_name: 'Eko',
    last_name: 'Prasetyo',
    date_of_birth: '1970-09-09',
    gender: 'male',
    phone: '+628161005005',
    email: 'eko.prasetyo@email.test',
    address: 'Jl. Merdeka No. 22, Semarang',
    primary_diagnosis: 'Infark miokard dinding inferior (riwayat)',
    secondary_diagnoses: 'Disfungsi sistolik ringan LV',
    cardiac_history: 'PCI + stent 2021; rehabilitasi jantung 8 minggu.',
    has_hypertension: 1,
    has_diabetes: 1,
    has_dyslipidemia: 1,
    has_smoking: 0,
    has_obesity: 1,
    has_family_history: 1,
    has_ckd: 0,
    has_previous_mi: 1,
    has_atrial_fibrillation: 0,
    medications: 'Aspirin 100 mg, Clopidogrel 75 mg, Ramipril 5 mg, Empagliflozin 10 mg',
    medications_json: medsJson([{ name: 'Aspirin', dose: '100 mg', frequency: '1× sehari' }]),
    ecg_results: examText('Kesimpulan: Q patologis inferior; tidak ada iskemia akut saat ini.'),
    echo_results: examText('Kesimpulan: hipokinesia inferior, FE 48%.'),
    lab_results: examText('Kesimpulan: lipid panel sesuai target sekunder pencegahan.'),
    appointments_json: apptsJson([{ datetime: '2026-06-01 08:30', note: 'Rehab jantung' }]),
    clinical_notes: null
  },
  {
    patient_code: `${DEMO_PREFIX}06`,
    form_type: 'cardiology',
    first_name: 'Fitri',
    last_name: 'Amalia',
    date_of_birth: '1992-05-18',
    gender: 'female',
    phone: '+628171006006',
    email: 'fitri.amalia@email.test',
    address: 'Jl. Cendrawasih III/4, Yogyakarta',
    primary_diagnosis: 'Murmur jantung — evaluasi',
    secondary_diagnoses: null,
    cardiac_history: 'Tidak ada keluhan; skrining pra-kerja.',
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
    ecg_results: examText('Kesimpulan: EKG dalam batas normal untuk usia.'),
    echo_results: examPdf('Murmur fungsional — echo normal, lampiran PDF.'),
    lab_results: examText('Kesimpulan: tidak ada pemeriksaan lab khusus; Hb dalam batas.'),
    appointments_json: apptsJson([]),
    clinical_notes: 'Clearance kerja diberikan.'
  },
  {
    patient_code: `${DEMO_PREFIX}07`,
    form_type: 'cardiology',
    first_name: 'Gunawan',
    last_name: 'Hakim',
    date_of_birth: '1955-12-01',
    gender: 'male',
    phone: '+628181007007',
    email: null,
    address: 'Jl. Diponegoro No. 90, Medan',
    primary_diagnosis: 'Valvulopati aorta — follow-up',
    secondary_diagnoses: 'Blok cabang kiri tidak lengkap',
    cardiac_history: 'Ekokardiografi tahunan sejak 2018.',
    has_hypertension: 1,
    has_diabetes: 0,
    has_dyslipidemia: 1,
    has_smoking: 0,
    has_obesity: 0,
    has_family_history: 1,
    has_ckd: 0,
    has_previous_mi: 0,
    has_atrial_fibrillation: 0,
    medications: 'Carvedilol 12.5 mg, Atorvastatin 40 mg',
    medications_json: medsJson([{ name: 'Carvedilol', dose: '12,5 mg', frequency: '2× sehari' }]),
    ecg_results: examPdf('EKG: blok LBBB — lihat PDF terlampir.'),
    echo_results: examText('Kesimpulan: stenosis aorta ringan–sedang; gradient doppler terdokumentasi.'),
    lab_results: examText('Kesimpulan: profil lipid; LDL perlu diturunkan lebih lanjut.'),
    appointments_json: apptsJson([{ datetime: '2026-07-15 10:00', note: 'Kontrol valvular' }]),
    clinical_notes: 'Diskusi opsi tindak lanjut bila progresi.'
  },
  {
    patient_code: `${DEMO_PREFIX}08`,
    form_type: 'cardiology',
    first_name: 'Hana',
    last_name: 'Putri',
    date_of_birth: '1983-08-25',
    gender: 'female',
    phone: '+628191008008',
    email: 'hana.putri@email.test',
    address: 'Komplek Flamboyan Raya No. 7, Denpasar',
    primary_diagnosis: 'Perikarditis akut (sembuh)',
    secondary_diagnoses: null,
    cardiac_history: 'Dirawat 5 hari 2024; kontrol bebas keluhan.',
    has_hypertension: 0,
    has_diabetes: 0,
    has_dyslipidemia: 0,
    has_smoking: 0,
    has_obesity: 0,
    has_family_history: 0,
    has_ckd: 0,
    has_previous_mi: 0,
    has_atrial_fibrillation: 0,
    medications: 'Ibuprofen sesuai resep dulu; saat ini tanpa obat rutin',
    medications_json: null,
    ecg_results: examText('Kesimpulan: tidak ada perubahan ST persisten; ritme sinus.'),
    echo_results: examText('Kesimpulan: tidak ada efusi perikard signifikan saat kontrol.'),
    lab_results: examPdf('CRP & prokalsitonin kontrol — lihat lampiran.'),
    appointments_json: apptsJson([]),
    clinical_notes: null
  },
  {
    patient_code: `${DEMO_PREFIX}09`,
    form_type: 'cardiology',
    first_name: 'Indra',
    last_name: 'Mahendra',
    date_of_birth: '1968-04-07',
    gender: 'male',
    phone: '+628121009009',
    email: 'indra.m@email.test',
    address: 'Jl. Gatot Subroto Kav. 10, Jakarta Pusat',
    primary_diagnosis: 'Hipertensi pulmonal ringan',
    secondary_diagnoses: 'OSAS (suspisi)',
    cardiac_history: 'Polisomnografi direncanakan.',
    has_hypertension: 1,
    has_diabetes: 0,
    has_dyslipidemia: 0,
    has_smoking: 1,
    has_obesity: 1,
    has_family_history: 0,
    has_ckd: 0,
    has_previous_mi: 0,
    has_atrial_fibrillation: 0,
    medications: 'Amlodipine 10 mg, edukasi berhenti merokok',
    medications_json: medsJson([{ name: 'Amlodipine', dose: '10 mg', frequency: '1× sehari' }]),
    ecg_results: examText('Kesimpulan: tanda hipertensi VK ringan pada EKG (V1).'),
    echo_results: examPdf('Penilaian tekanan pulmonal — ringkasan di PDF.'),
    lab_results: examText('Kesimpulan: BNP dalam batas ambang untuk usia.'),
    appointments_json: apptsJson([{ datetime: '2026-05-20 15:00', note: 'Rujuk tidur' }]),
    clinical_notes: 'Motivasi berhenti merokok.'
  },
  {
    patient_code: `${DEMO_PREFIX}10`,
    form_type: 'cardiology',
    first_name: 'Jihan',
    last_name: 'Safitri',
    date_of_birth: '1995-02-14',
    gender: 'female',
    phone: '+628131010010',
    email: 'jihan.s@email.test',
    address: 'Jl. Veteran No. 3, Malang',
    primary_diagnosis: 'Sinkop — evaluasi kardiologi',
    secondary_diagnoses: 'Anemia ringan',
    cardiac_history: 'Tilt test negatif; Holter 24 jam normal.',
    has_hypertension: 0,
    has_diabetes: 0,
    has_dyslipidemia: 0,
    has_smoking: 0,
    has_obesity: 0,
    has_family_history: 1,
    has_ckd: 0,
    has_previous_mi: 0,
    has_atrial_fibrillation: 0,
    medications: 'Suplemen zat besi sesuai resep interna',
    medications_json: null,
    ecg_results: examPdf('Holter ringkasan — PDF terlampir; sinus selama 24 jam.'),
    echo_results: examText('Kesimpulan: struktur jantung normal, tidak ada HOCM.'),
    lab_results: examText('Kesimpulan: Hb 11,2 g/dL; feritin rendah — konsisten anemia defisiensi besi.'),
    appointments_json: apptsJson([]),
    clinical_notes: 'Sinkop vasovagal kemungkinan besar.'
  },
  {
    patient_code: `${DEMO_PREFIX}11`,
    form_type: 'cardiology',
    first_name: 'Kirana',
    last_name: 'Wibowo',
    date_of_birth: '1979-10-29',
    gender: 'other',
    phone: '+628141011011',
    email: 'kirana.w@email.test',
    address: 'Jl. Ahmad Yani No. 55, Makassar',
    primary_diagnosis: 'Gagal jantung dengan fraksi ejeksi terpelihara (HFpEF)',
    secondary_diagnoses: 'Fibrilasi atrium persisten',
    cardiac_history: 'Kontrol ritme dengan obat; ablasi dipertimbangkan.',
    has_hypertension: 1,
    has_diabetes: 1,
    has_dyslipidemia: 1,
    has_smoking: 0,
    has_obesity: 1,
    has_family_history: 1,
    has_ckd: 1,
    has_previous_mi: 0,
    has_atrial_fibrillation: 1,
    medications: 'Digoxin 0.125 mg, Dapagliflozin 10 mg, Metformin 850 mg, Apixaban 5 mg',
    medications_json: medsJson([
      { name: 'Dapagliflozin', dose: '10 mg', frequency: '1× sehari' },
      { name: 'Apixaban', dose: '5 mg', frequency: '2× sehari' }
    ]),
    ecg_results: examText('Kesimpulan: FA dengan QRS sempit; tidak ada iskemia akut.'),
    echo_results: examText(
      'Kesimpulan: EF 55%, peningkatan tekanan pengisian (E/e meningkat) — konsisten HFpEF.'
    ),
    lab_results: examPdf('Panel ginjal & elektrolit — PDF; catatan: hiperkalemia perbatasan.'),
    appointments_json: apptsJson([
      { datetime: '2026-05-05 11:00', note: 'Kontrol gula & tekanan' },
      { datetime: '2026-08-12 09:00', note: 'Kontrol AF' }
    ]),
    clinical_notes: 'Koordinasi dengan interna untuk DM dan CKD.'
  }
];

/** Urutan kolom untuk INSERT — disaring ke kolom yang benar-benar ada di DB */
const INSERT_FIELD_ORDER = [
  'patient_code',
  'form_type',
  'first_name',
  'last_name',
  'date_of_birth',
  'gender',
  'phone',
  'email',
  'address',
  'primary_diagnosis',
  'secondary_diagnoses',
  'cardiac_history',
  'has_hypertension',
  'has_diabetes',
  'has_dyslipidemia',
  'has_smoking',
  'has_obesity',
  'has_family_history',
  'has_ckd',
  'has_previous_mi',
  'has_atrial_fibrillation',
  'medications',
  'medications_json',
  'ecg_results',
  'echo_results',
  'lab_results',
  'appointments_json',
  'clinical_notes',
  'created_from_ip'
];

async function loadWritablePatientColumns(connection) {
  const [rows] = await connection.execute(
    `SELECT COLUMN_NAME AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'patients'
       AND COLUMN_NAME NOT IN ('id', 'created_at', 'updated_at', 'deleted_at')`
  );
  return new Set(rows.map((r) => r.c));
}

async function seedPatients() {
  const connection = await pool.getConnection();

  try {
    await ensureSeedPdfFile();
    await connection.beginTransaction();

    const [delResult] = await connection.execute(`DELETE FROM patients`);
    console.log(`Removed all patients (${delResult.affectedRows} row(s)).`);

    await connection.execute(`ALTER TABLE patients AUTO_INCREMENT = 1`);

    const colSet = await loadWritablePatientColumns(connection);
    const insertCols = INSERT_FIELD_ORDER.filter((c) => colSet.has(c));
    if (!insertCols.length) {
      throw new Error('Tabel patients tidak memiliki kolom yang dikenali.');
    }

    const quotedCols = insertCols.map((c) => `\`${c}\``).join(', ');
    const placeholders = insertCols.map(() => '?').join(', ');
    const insertSql = `INSERT INTO patients (${quotedCols}) VALUES (${placeholders})`;

    for (const p of patients) {
      const row = { ...p, created_from_ip: '127.0.0.1' };
      const vals = insertCols.map((c) => (row[c] !== undefined ? row[c] : null));
      await connection.execute(insertSql, vals);
    }

    await connection.commit();
    console.log(`✅ Seeded ${patients.length} patients (${DEMO_PREFIX}01–${DEMO_PREFIX}11). Hasil pemeriksaan: campuran teks (kesimpulan) & PDF.`);
    process.exit(0);
  } catch (error) {
    await connection.rollback();
    console.error('❌ Failed to seed patients:', error.message);
    process.exit(1);
  } finally {
    connection.release();
  }
}

seedPatients();
