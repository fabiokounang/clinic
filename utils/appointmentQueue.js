/**
 * Antrian janji dari appointments_json (kunjungan / pasien).
 * Tanggal janji dibandingkan dengan string YYYY-MM-DD (zona waktu klinik untuk "hari ini").
 */

const { safeParseJson } = require('./clinicalForm');

function ymdInTimeZone(date, timeZone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = fmt.formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) {
      return `${y}-${m}-${d}`;
    }
  } catch (e) {
    /* fall through */
  }
  const x = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

function parseYmdParam(raw) {
  const s = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return null;
  }
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return s;
}

function extractYmdFromAppointmentDatetime(raw) {
  const s = String(raw || '').trim();
  if (!s) {
    return null;
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function timeSortMinutes(raw) {
  const s = String(raw || '').trim();
  let m = s.match(/T(\d{1,2}):(\d{2})/);
  if (!m) {
    m = s.match(/\s(\d{1,2}):(\d{2})/);
  }
  if (!m) {
    return 24 * 60;
  }
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return hh * 60 + mm;
}

function formatTimeLabel(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) {
    return '';
  }
  const hh = String(Math.min(23, Math.max(0, parseInt(m[1], 10)))).padStart(2, '0');
  const mm = String(Math.min(59, Math.max(0, parseInt(m[2], 10)))).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * @param {Array<object>} rows — hasil dari fetchRowsWithAppointmentJson (+ pasien tanpa kunjungan)
 * @param {string} targetYmd — YYYY-MM-DD
 */
function buildVisitQueueItems(rows, targetYmd) {
  if (!targetYmd || !Array.isArray(rows)) {
    return [];
  }

  const seen = new Map();
  const out = [];

  for (const row of rows) {
    const arr = safeParseJson(row.appointments_json);
    if (!Array.isArray(arr)) {
      continue;
    }

    const patientId = Number(row.patient_id);
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || '—';

    for (const a of arr) {
      if (!a || typeof a !== 'object') {
        continue;
      }
      const dt = a.datetime;
      const ymd = extractYmdFromAppointmentDatetime(dt);
      if (ymd !== targetYmd) {
        continue;
      }

      const note = typeof a.note === 'string' ? a.note.trim().slice(0, 500) : '';
      const key = `${patientId}|${String(dt).trim()}|${note}`;
      if (seen.has(key)) {
        continue;
      }
      seen.set(key, true);

      const timeLabel = formatTimeLabel(dt);
      out.push({
        patient_id: patientId,
        patient_code: row.patient_code || '',
        fullName,
        phone: row.phone || '',
        form_type: row.form_type || '',
        visit_id: row.visit_id != null ? Number(row.visit_id) : null,
        visit_number: row.visit_number != null ? Number(row.visit_number) : null,
        note,
        datetimeRaw: typeof dt === 'string' ? dt : String(dt || ''),
        timeSortMinutes: timeSortMinutes(dt),
        timeLabel: timeLabel || '—'
      });
    }
  }

  out.sort((a, b) => {
    if (a.timeSortMinutes !== b.timeSortMinutes) {
      return a.timeSortMinutes - b.timeSortMinutes;
    }
    return a.fullName.localeCompare(b.fullName, 'id');
  });

  return out;
}

/** Geser tanggal kalender YYYY-MM-DD (UTC) untuk link hari sebelumnya/sesudahnya. */
function shiftYmd(ymd, deltaDays) {
  const parts = String(ymd || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return null;
  }
  const [y, m, d] = parts;
  const x = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}

module.exports = {
  ymdInTimeZone,
  parseYmdParam,
  extractYmdFromAppointmentDatetime,
  buildVisitQueueItems,
  shiftYmd
};
