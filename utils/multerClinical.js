const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const uploadDir = path.join(__dirname, '../public/uploads/clinical');

try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch (e) {
  /* ignore */
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ext === '.pdf' ? '.pdf' : '.pdf';
    cb(null, `${crypto.randomUUID()}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
      return;
    }
    cb(new Error('Hanya berkas PDF yang diperbolehkan untuk hasil pemeriksaan.'));
  }
});

const clinicalPdfFields = upload.fields([
  { name: 'ecg_pdf', maxCount: 1 },
  { name: 'echo_pdf', maxCount: 1 },
  { name: 'lab_pdf', maxCount: 1 }
]);

/**
 * Harus dijalankan *sebelum* middleware csurf global.
 * Untuk multipart/form-data, body (termasuk _csrf) baru terisi setelah multer;
 * jika csurf jalan dulu, req.body kosong → EBADCSRFTOKEN.
 */
function clinicalMultipartBeforeCsrf(req, res, next) {
  if (req.method !== 'POST') {
    return next();
  }
  const ct = String(req.headers['content-type'] || '');
  if (!ct.toLowerCase().includes('multipart/form-data')) {
    return next();
  }
  const p = String((req.originalUrl || req.url || req.path || '').split('?')[0] || '');
  if (
    p === '/admin/patients/new' ||
    /^\/admin\/patients\/\d+\/edit\/?$/.test(p) ||
    /^\/admin\/patients\/\d+\/visits\/?$/.test(p)
  ) {
    return clinicalPdfFields(req, res, next);
  }
  return next();
}

module.exports = {
  clinicalPdfFields,
  clinicalMultipartBeforeCsrf,
  uploadDir
};
