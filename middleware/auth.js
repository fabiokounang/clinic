const userModel = require('../models/user');

function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    req.flash('error_msg', 'Silakan login terlebih dahulu.');
    return res.redirect('/admin/auth/login');
  }

  next();
}

/**
 * Hanya superadmin (role di DB, bukan hanya session) — cegah privilege stale / manipulasi session.
 */
async function requireSuperAdmin(req, res, next) {
  try {
    if (!req.session.admin) {
      req.flash('error_msg', 'Silakan login terlebih dahulu.');
      return res.redirect('/admin/auth/login');
    }

    const user = await userModel.getUserById(req.session.admin.id);
    if (!user || !user.is_active) {
      return req.session.destroy((destroyErr) => {
        if (destroyErr) return next(destroyErr);
        return res.redirect('/admin/auth/login?notice=invalid_session');
      });
    }

    if (user.role !== 'superadmin') {
      return res.status(403).render('errors/403', {
        title: 'Akses ditolak',
        admin: req.session.admin || null
      });
    }

    req.staffUser = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  requireAdmin,
  requireSuperAdmin
};
