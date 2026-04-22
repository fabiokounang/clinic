const express = require('express');
const router = express.Router();

const adminController = require('../controllers/admin');
const exportController = require('../controllers/export');
const staffUsersController = require('../controllers/staffUsers');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth');

router.get('/', requireAdmin, (req, res) => res.redirect('/admin/dashboard'));

router.get('/dashboard', requireAdmin, adminController.dashboard);
router.get('/visit-queue', requireAdmin, adminController.visitQueueToday);

router.get('/users', requireSuperAdmin, staffUsersController.index);
router.get('/users/new', requireSuperAdmin, staffUsersController.newForm);
router.post('/users/new', requireSuperAdmin, staffUsersController.create);
router.get('/users/:id/edit', requireSuperAdmin, staffUsersController.editForm);
router.post('/users/:id/edit', requireSuperAdmin, staffUsersController.update);
router.post('/users/:id/delete', requireSuperAdmin, staffUsersController.destroy);

router.get('/patients', requireAdmin, adminController.indexPatients);
router.get('/patients/new', requireAdmin, adminController.newPatientForm);
router.post('/patients/new', requireAdmin, adminController.storeNewPatient);
router.get('/patients/export/excel', requireAdmin, exportController.exportPatientsExcel);
router.get('/patients/export/pdf', requireAdmin, exportController.exportPatientsPdf);
router.get('/patients/:id/export/excel', requireAdmin, exportController.exportOnePatientExcel);
router.get('/patients/:id/export/pdf', requireAdmin, exportController.exportOnePatientPdf);
router.get('/patients/:id/visits/new', requireAdmin, adminController.newVisitForm);
router.post('/patients/:id/visits', requireAdmin, adminController.storeNewVisit);
router.get('/patients/:id/visits/:visitId/export/excel', requireAdmin, exportController.exportVisitExcel);
router.get('/patients/:id/visits/:visitId/export/pdf', requireAdmin, exportController.exportVisitPdf);
router.post('/patients/:id/visits/:visitId/delete', requireAdmin, adminController.deleteVisit);
router.get('/patients/:id/edit', requireAdmin, adminController.editPatientForm);
router.get('/patients/:id', requireAdmin, adminController.showPatient);
router.post('/patients/:id/edit', requireAdmin, adminController.updatePatient);
router.post('/patients/:id/delete', requireAdmin, adminController.deletePatient);

module.exports = router;