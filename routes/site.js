const express = require('express');
const router = express.Router();

const siteController = require('../controllers/site');
const { requireAdmin } = require('../middleware/auth');

router.get('/', siteController.redirectRootToLogin);
router.get('/forms', requireAdmin, siteController.formSelector);
router.get('/p/:formType', siteController.showPatientInfo);
router.get('/form/:formType', siteController.redirectLegacyForm);

router.post('/submit-patient', (req, res) => {
  res.status(410).type('text').send(
    'Pengiriman formulir pasien melalui tautan ini tidak lagi tersedia. Data hanya dapat dimasukkan oleh staf klinik yang sudah masuk.'
  );
});

module.exports = router;
