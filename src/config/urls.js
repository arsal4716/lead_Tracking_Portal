'use strict';

/**
 * Public-facing base URL used when generating links that are copied/shared
 * with external clients (enrich URLs, call-tracking pixel, etc.).
 *
 * IMPORTANT: this must NEVER fall back to an internal IP or the bind address.
 * The server may be hosted behind an internal IP (e.g. http://10.x.x.x:7001),
 * but copied links must always point at the production domain.
 *
 * Override in production via PUBLIC_BASE_URL.
 */
const getPublicBaseUrl = () => {
  const raw = process.env.PUBLIC_BASE_URL || 'https://hlgleadtrack.com';
  return String(raw).replace(/\/+$/, '');
};

const buildEnrichUrl = (publisherId, campaignId) =>
  `${getPublicBaseUrl()}/api/v1/public/enrich/${publisherId}/${campaignId}`;

const buildCallTrackingUrl = (publisherName) => {
  const base = getPublicBaseUrl();
  // Token placeholders match the call-tracking provider's macro syntax.
  const params =
    'callTimeStamp=[[tag:BidToCallTime]]' +
    `&publisherName=${encodeURIComponent(publisherName || '[[tag:VendorName]]')}` +
    '&callerId=[[tag:CallerId]]';
  return `${base}/api/v1/public/call?${params}`;
};

module.exports = { getPublicBaseUrl, buildEnrichUrl, buildCallTrackingUrl };
