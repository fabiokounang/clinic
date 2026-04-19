require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const csrf = require('csurf');
const helmet = require('helmet');

const { testConnection } = require('./utils/db');
const { clinicalMultipartBeforeCsrf } = require('./utils/multerClinical');
const siteRoutes = require('./routes/site');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Render / Fly / Heroku: Node di belakang reverse proxy (HTTPS di edge, proxy ke app).
 * Tanpa ini: req.secure salah, cookie sesi sering tidak ikut / redirect login terasa "mati".
 * Set TRUST_PROXY=0 jika app benar-benar langsung ke internet tanpa proxy.
 */
const trustProxyEnv = String(process.env.TRUST_PROXY || '').toLowerCase();
const useTrustProxy =
  trustProxyEnv === '0' || trustProxyEnv === 'false' || trustProxyEnv === 'no'
    ? false
    : isProduction || trustProxyEnv === '1' || trustProxyEnv === 'true';

if (useTrustProxy) {
  const n = Number(process.env.TRUST_PROXY_HOPS);
  app.set('trust proxy', Number.isFinite(n) && n > 0 ? n : 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'supersecretkeyclinic',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

app.use(flash());

app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.old = req.session.oldForm || {};
  res.locals.admin = req.session.admin || null;
  res.locals.isSuperAdmin = req.session.admin?.role === 'superadmin';
  res.locals.appName = process.env.APP_NAME || 'Klinik Digital';
  res.locals.adminPath = req.path || '';

  delete req.session.oldForm;
  next();
});

/** Parse multipart pasien sebelum csurf agar _csrf terbaca dari req.body */
app.use(clinicalMultipartBeforeCsrf);

const csrfProtection = csrf();
app.use(csrfProtection);

app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});

app.use('/', siteRoutes);
app.use('/admin/auth', authRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  return res.status(404).render('errors/404', {
    title: 'Page Not Found'
  });
});

app.use((error, req, res, next) => {
  if (error.code === 'EBADCSRFTOKEN') {
    req.flash('error_msg', 'Session form tidak valid atau sudah expired. Silakan coba lagi.');

    const fallback = req.originalUrl && req.originalUrl.startsWith('/admin')
      ? '/admin/auth/login'
      : '/';

    const referer = req.get('referer');
    return res.redirect(referer || fallback);
  }

  const isProd = process.env.NODE_ENV === 'production';
  const sqlHint =
    error.sqlMessage || error.code === 'ER_ACCESS_DENIED_ERROR' || error.code === 'ECONNREFUSED'
      ? ' Periksa .env (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME) dan pastikan MySQL jalan. TiDB Cloud: set NODE_ENV=production atau DB_SSL=true agar koneksi memakai TLS.'
      : '';

  console.error('Unhandled error:', error.message || error);
  if (!isProd && (error.sqlMessage || error.sql)) {
    console.error('SQL:', error.sql);
    console.error('sqlMessage:', error.sqlMessage);
  }
  if (!isProd && error.code) {
    console.error('code:', error.code);
  }

  if (!res.headersSent) {
    return res.status(500).render('errors/500', {
      title: 'Server Error',
      showDevHint: !isProd,
      devHint: !isProd ? `${error.message || ''}${sqlHint}`.trim() : ''
    });
  }

  next(error);
});

(async () => {
  try {
    await testConnection();
    console.log('✅ Database connected');

    app.listen(PORT, () => {
      console.log(`✅ App running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start app:', error.message);
    if (process.env.NODE_ENV !== 'production' && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
})();