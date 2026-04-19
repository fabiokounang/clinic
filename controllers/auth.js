const bcrypt = require('bcryptjs');
const { getUserByEmail } = require('../models/user');

async function showLogin(req, res) {
  let noticeError = '';
  const q = String(req.query.notice || '');
  if (q === 'invalid_session') {
    noticeError = 'Sesi tidak valid atau akun tidak aktif. Silakan masuk kembali.';
  } else if (q === 'session_save_failed') {
    noticeError =
      'Sesi tidak bisa disimpan (sering terjadi jika cookie diblokir atau pengaturan server salah). Coba lagi atau hubungi admin.';
  }
  return res.render('auth/login', {
    title: 'Admin Login',
    noticeError
  });
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Store form data in session for repopulation on error
    req.session.oldForm = { email };

    // Validate input
    if (!email || !password) {
      req.flash('error_msg', 'Email dan password harus diisi.');
      return res.redirect('/admin/auth/login');
    }

    // Get user from database
    const user = await getUserByEmail(email);
    if (!user) {
      req.flash('error_msg', 'Email atau password salah.');
      return res.redirect('/admin/auth/login');
    }

    // Check if user is active
    if (!user.is_active) {
      req.flash('error_msg', 'Akun Anda tidak aktif.');
      return res.redirect('/admin/auth/login');
    }

    // Staf panel: admin atau superadmin
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      req.flash('error_msg', 'Akses ditolak. Hanya akun staf yang dapat login.');
      return res.redirect('/admin/auth/login');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      req.flash('error_msg', 'Email atau password salah.');
      return res.redirect('/admin/auth/login');
    }

    // Set session
    req.session.admin = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    // Clear old form data
    delete req.session.oldForm;

    // Pastikan sesi tersimpan sebelum redirect (penting di belakang proxy / hosting seperti Render).
    return req.session.save((saveErr) => {
      if (saveErr) {
        console.error('Session save error after login:', saveErr);
        return res.redirect('/admin/auth/login?notice=session_save_failed');
      }
      req.flash('success_msg', `Selamat datang, ${user.name}!`);
      return res.redirect('/admin');
    });
  } catch (error) {
    console.error('Login error:', error);
    req.flash('error_msg', 'Terjadi kesalahan saat login. Silakan coba lagi.');
    return res.redirect('/admin/auth/login');
  }
}

async function logout(req, res) {
  try {
    // Destroy session
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout session destroy error:', err);
      }
      // Clear cookie
      res.clearCookie('connect.sid');
      return res.redirect('/admin/auth/login');
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.redirect('/admin/auth/login');
  }
}

module.exports = {
  showLogin,
  login,
  logout
};