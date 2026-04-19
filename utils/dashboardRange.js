/**
 * Parse ?from=&to= (YYYY-MM-DD) for dashboard with safe defaults and max span.
 */

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toYMD(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseYMD(s) {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const d = new Date(y, mo - 1, da, 12, 0, 0, 0);
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) return null;
  return toYMD(d);
}

function resolveDashboardRange(query) {
  const today = new Date();
  const todayStr = toYMD(today);

  let to = parseYMD(query && query.to) || todayStr;
  let from = parseYMD(query && query.from);

  if (!from) {
    const d = new Date(today);
    d.setDate(d.getDate() - 29);
    from = toYMD(d);
  }

  if (from > to) {
    const t = from;
    from = to;
    to = t;
  }

  const fromD = new Date(from + 'T12:00:00');
  const toD = new Date(to + 'T12:00:00');
  let daysInRange = Math.floor((toD - fromD) / 864e5) + 1;

  if (daysInRange > 366) {
    const fd = new Date(toD);
    fd.setDate(fd.getDate() - 365);
    from = toYMD(fd);
    daysInRange = 366;
  }

  return { from, to, daysInRange };
}

function enumerateDays(fromStr, toStr) {
  const out = [];
  const cur = new Date(fromStr + 'T12:00:00');
  const end = new Date(toStr + 'T12:00:00');
  while (cur <= end) {
    out.push(toYMD(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function normalizeDbDay(d) {
  if (d == null) return '';
  if (d instanceof Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  return String(d).slice(0, 10);
}

function mergeDailySeries(fromStr, toStr, rows) {
  const map = {};
  (rows || []).forEach((r) => {
    const key = normalizeDbDay(r.d);
    if (key) map[key] = Number(r.c) || 0;
  });
  const days = enumerateDays(fromStr, toStr);
  const labels = [];
  const values = [];
  days.forEach((day) => {
    const [y, m, d] = day.split('-').map(Number);
    const short = `${pad2(d)}/${pad2(m)}`;
    labels.push(short);
    values.push(map[day] != null ? map[day] : 0);
  });
  return { labels, values, dayKeys: days };
}

function buildPresetQueryStrings() {
  const today = new Date();
  const to = toYMD(today);

  const d7 = new Date(today);
  d7.setDate(d7.getDate() - 6);

  const d30 = new Date(today);
  d30.setDate(d30.getDate() - 29);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const yearStart = new Date(today.getFullYear(), 0, 1);

  const q = (from, t) => `?from=${from}&to=${t}`;

  return {
    last7: q(toYMD(d7), to),
    last30: q(toYMD(d30), to),
    thisMonth: q(toYMD(monthStart), to),
    thisYear: q(toYMD(yearStart), to)
  };
}

/**
 * Which preset (if any) matches the resolved from/to — same boundaries as preset links.
 * Manual dates that do not match a preset return null (no chip active).
 */
function getActiveDashboardPreset(fromStr, toStr) {
  if (typeof fromStr !== 'string' || typeof toStr !== 'string') {
    return null;
  }
  const today = new Date();
  const todayStr = toYMD(today);

  const d7 = new Date(today);
  d7.setDate(d7.getDate() - 6);
  if (fromStr === toYMD(d7) && toStr === todayStr) {
    return 'last7';
  }

  const d30 = new Date(today);
  d30.setDate(d30.getDate() - 29);
  if (fromStr === toYMD(d30) && toStr === todayStr) {
    return 'last30';
  }

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  if (fromStr === toYMD(monthStart) && toStr === todayStr) {
    return 'thisMonth';
  }

  const yearStart = new Date(today.getFullYear(), 0, 1);
  if (fromStr === toYMD(yearStart) && toStr === todayStr) {
    return 'thisYear';
  }

  return null;
}

/**
 * Optional ?from=&to= (YYYY-MM-DD) untuk daftar pasien & ekspor — filter DATE(created_at).
 * Kosong = tanpa batas di sisi itu. String tidak valid diabaikan.
 */
function parsePatientListDateRange(query) {
  const q = query || {};
  const rawFrom = q.from != null ? String(q.from).trim() : '';
  const rawTo = q.to != null ? String(q.to).trim() : '';
  let dateFrom = rawFrom ? parseYMD(rawFrom) : null;
  let dateTo = rawTo ? parseYMD(rawTo) : null;
  if (dateFrom && dateTo && dateFrom > dateTo) {
    const t = dateFrom;
    dateFrom = dateTo;
    dateTo = t;
  }
  return { dateFrom, dateTo };
}

module.exports = {
  resolveDashboardRange,
  mergeDailySeries,
  toYMD,
  parseYMD,
  buildPresetQueryStrings,
  getActiveDashboardPreset,
  normalizeDbDay,
  parsePatientListDateRange
};
