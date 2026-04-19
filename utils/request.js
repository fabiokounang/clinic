function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];

  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || null;
}

/**
 * Base URL absolut untuk tautan in-app (WhatsApp, salin, dll.).
 * Prefer PUBLIC_BASE_URL / APP_URL di production.
 */
function getSiteBaseUrl(req) {
  const fromEnv = process.env.PUBLIC_BASE_URL || process.env.APP_URL;
  if (fromEnv && /^https?:\/\//i.test(String(fromEnv).trim())) {
    return String(fromEnv).trim().replace(/\/$/, '');
  }

  const host = req.get('host') || '';
  let proto = req.protocol || 'http';
  const xfProto = req.get('x-forwarded-proto');
  if (xfProto) {
    proto = String(xfProto).split(',')[0].trim();
  }

  if (!host) {
    return `${proto}://localhost`;
  }

  return `${proto}://${host}`;
}

module.exports = {
  getClientIp,
  getSiteBaseUrl
};