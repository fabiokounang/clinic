const rateLimit = require('express-rate-limit');

const publicFormLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Terlalu banyak request. Silakan coba lagi beberapa saat.',
  skipSuccessfulRequests: false
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Terlalu banyak percobaan login. Silakan coba lagi beberapa saat.'
});

module.exports = {
  publicFormLimiter,
  adminLoginLimiter
};