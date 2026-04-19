const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth');
const { adminLoginLimiter } = require('../middleware/rate_limit');

router.get('/login', authController.showLogin);
router.post('/login', adminLoginLimiter, authController.login);
router.post('/logout', authController.logout);

module.exports = router;