'use strict';

/**
 * Parse a date-of-birth string into a JS Date, supporting the common
 * call-center formats. Returns null if it cannot be parsed.
 *
 * Supported:
 *   MM/DD/YYYY   (US, default)
 *   DD/MM/YYYY   (EU — only when day > 12 disambiguates, otherwise US wins)
 *   MM-DD-YYYY
 *   YYYY-MM-DD   (ISO)
 *   YYYY/MM/DD
 */
const parseDob = (raw) => {
  if (raw === undefined || raw === null || raw === '') return null;

  // Already a Date or ISO-ish timestamp
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;

  const str = String(raw).trim();
  if (!str) return null;

  // ISO: YYYY-MM-DD or YYYY/MM/DD
  let m = str.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return buildDate(+y, +mo, +d);
  }

  // X/X/YYYY or X-X-YYYY  → assume MM/DD/YYYY, fall back to DD/MM when first > 12
  m = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    let [, a, b, y] = m;
    a = +a; b = +b;
    let month = a;
    let day = b;
    // If first component can't be a month but second can, treat as DD/MM/YYYY
    if (a > 12 && b <= 12) {
      month = b;
      day = a;
    }
    return buildDate(+y, month, day);
  }

  // Last resort: let the engine try (handles e.g. "Jan 5 1990")
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const buildDate = (year, month, day) => {
  if (!year || !month || !day) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Guard against rollover (e.g. 02/31)
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
};

/**
 * Whole-number age in years from a DOB value (any supported format).
 * Returns null when the DOB can't be parsed or is in the future.
 */
const calculateAge = (raw, now = new Date()) => {
  const dob = parseDob(raw);
  if (!dob) return null;

  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }

  if (age < 0 || age > 130) return null;
  return age;
};

module.exports = { parseDob, calculateAge };
