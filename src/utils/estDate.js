'use strict';

/**
 * Eastern-Time date helpers.
 *
 * The DB stores timestamps in UTC, but the business operates in Eastern Time.
 * These helpers convert an EST/EDT calendar date (YYYY-MM-DD) into the exact
 * UTC instants that bound that Eastern day, honouring daylight saving.
 */

const EST_TZ = 'America/New_York';

// Is the given UTC instant in EDT (daylight, UTC-4) rather than EST (UTC-5)?
const easternOffsetHours = (utcDate) => {
  const tzName = new Intl.DateTimeFormat('en-US', {
    timeZone: EST_TZ,
    timeZoneName: 'short',
  })
    .formatToParts(utcDate)
    .find((p) => p.type === 'timeZoneName')?.value;
  return tzName === 'EDT' ? 4 : 5;
};

// Today's Eastern calendar date as 'YYYY-MM-DD'.
const easternTodayStr = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: EST_TZ }).format(new Date());

/**
 * Start/end UTC instants for an Eastern calendar day.
 * @param {string} dateStr 'YYYY-MM-DD' (Eastern). Defaults to Eastern today.
 */
const estDayBounds = (dateStr) => {
  const str = dateStr || easternTodayStr();
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) return null;

  // Estimate the offset using noon UTC of that date (safe from DST edges).
  const noon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const offset = easternOffsetHours(noon);

  // Eastern midnight == UTC midnight + offset hours.
  const start = new Date(Date.UTC(y, m - 1, d, offset, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d + 1, offset, 0, 0, 0) - 1);
  return { start, end };
};

/**
 * Build a Mongo date-range filter ({$gte,$lte}) from `from`/`to` query values.
 * Accepts either 'YYYY-MM-DD' Eastern dates or full ISO timestamps.
 * Returns null when neither is provided.
 */
const buildDateFilter = (from, to) => {
  if (!from && !to) return null;
  const range = {};

  if (from) {
    range.$gte = /^\d{4}-\d{2}-\d{2}$/.test(from)
      ? estDayBounds(from).start
      : new Date(from);
  }
  if (to) {
    range.$lte = /^\d{4}-\d{2}-\d{2}$/.test(to)
      ? estDayBounds(to).end
      : new Date(to);
  }
  return range;
};

module.exports = { EST_TZ, easternTodayStr, estDayBounds, buildDateFilter };
