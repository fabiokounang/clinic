/**
 * Format tanggal tampilan Indonesia: "28 Mei 2026"
 * Dengan jam: "28 Mei 2026 21:00:00"
 * Semua tampilan memakai zona waktu klinik (default Asia/Jakarta, UTC+7).
 */

const EMPTY = '—';

function displayTimeZone() {
  return process.env.CLINIC_TIMEZONE || 'Asia/Jakarta';
}

function toValidDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    /* Tengah hari UTC agar tanggal lahir / DATE tidak bergeser zona */
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getClockPartsInTz(d, tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(d);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const second = parseInt(parts.find((p) => p.type === 'second')?.value ?? '0', 10);
  return { hour, minute, second };
}

/** Tanggal saja: 28 Mei 2026 (zona Jakarta) */
function formatDateId(value) {
  const d = toValidDate(value);
  if (!d) return EMPTY;
  const tz = displayTimeZone();
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: tz,
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(d);
}

/** Opsional: Rabu, 28 Mei 2026 */
function formatDateWeekdayId(value) {
  const d = toValidDate(value);
  if (!d) return EMPTY;
  const tz = displayTimeZone();
  const weekday = new Intl.DateTimeFormat('id-ID', {
    timeZone: tz,
    weekday: 'long'
  }).format(d);
  const rest = new Intl.DateTimeFormat('id-ID', {
    timeZone: tz,
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(d);
  return `${weekday}, ${rest}`;
}

/** Tanggal + waktu: 28 Mei 2026 21:00:00 (WIB / zona klinik) */
function formatDateTimeId(value) {
  const d = toValidDate(value);
  if (!d) return EMPTY;
  const tz = displayTimeZone();
  const datePart = new Intl.DateTimeFormat('id-ID', {
    timeZone: tz,
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(d);
  const { hour, minute, second } = getClockPartsInTz(d, tz);
  const pad = (n) => String(n).padStart(2, '0');
  return `${datePart} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

/**
 * Kunjungan: jika jam di zona klinik 00:00:00 → tanpa jam; selain itu format lengkap.
 */
function formatVisitDateId(value) {
  const d = toValidDate(value);
  if (!d) return EMPTY;
  const tz = displayTimeZone();
  const { hour, minute, second } = getClockPartsInTz(d, tz);
  if (hour === 0 && minute === 0 && second === 0) {
    return formatDateId(d);
  }
  return formatDateTimeId(d);
}

module.exports = {
  displayTimeZone,
  formatDateId,
  formatDateWeekdayId,
  formatDateTimeId,
  formatVisitDateId,
  toValidDate,
  EMPTY
};
