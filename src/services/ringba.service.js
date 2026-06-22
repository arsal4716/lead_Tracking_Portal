'use strict';

const axios = require('axios');
const http  = require('http');
const https = require('https');

// Keep-alive agents so high-volume vendor calls reuse TCP/TLS connections
// instead of re-handshaking on every lead (big win at 100+ concurrent).
const httpAgent  = new http.Agent({ keepAlive: true, maxSockets: 200 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 200 });
const httpClient = axios.create({ timeout: 10000, httpAgent, httpsAgent });

// ── Phone cleaning ─────────────────────────────────────────────────────────────
const cleanPhone = (raw) => {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length > 10) return digits.slice(-10);
  return digits || null;
};

// ── Parse a pasted example URL ─────────────────────────────────────────────────
// Extracts base URL and any existing query params from a pasted example like:
//   https://bid.callgrid.com/api/bid/cmp5yu7uu04qk07js2y9fbxkn?CallerId=5551234567&InboundStateCode=CA
// Params in the pasted URL become static defaults; campaign field params override them.
const parseApiUrl = (rawUrl) => {
  if (!rawUrl) return { base: null, staticParams: {} };
  try {
    const u = new URL(rawUrl.trim());
    const base = `${u.origin}${u.pathname}`;
    const staticParams = {};
    u.searchParams.forEach((val, key) => { staticParams[key] = val; });
    return { base, staticParams };
  } catch {
    return { base: rawUrl.trim(), staticParams: {} };
  }
};

// ── Build the exact final URL that gets sent (for logging / super-admin view) ───
const buildFullUrl = (base, params) => {
  if (!base) return null;
  try {
    const u = new URL(base);
    Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, String(v)));
    return u.toString();
  } catch {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params || {}).map(([k, v]) => [k, String(v)]))
    ).toString();
    return qs ? `${base}?${qs}` : base;
  }
};

// ── Resolve a destination base URL from EITHER a bare key OR a full URL ──────────
// Users now paste just the provider key (e.g. 32c482e… / cmph33fv…). For backward
// compatibility a full pasted URL still works (its sample params become defaults).
const resolveRtbBase = (value) => {
  const v = String(value || '').trim();
  if (!v) return { base: null, staticParams: {} };
  if (/^https?:\/\//i.test(v)) return parseApiUrl(v);
  return { base: `https://rtb.ringba.com/v1/production/${v}.json`, staticParams: {} };
};

const resolveCallgridBase = (value) => {
  const v = String(value || '').trim();
  if (!v) return { base: null, staticParams: {} };
  if (/^https?:\/\//i.test(v)) return parseApiUrl(v);
  return { base: `https://bid.callgrid.com/api/bid/${v}`, staticParams: {} };
};

// ── Extract the CallGrid unique key from a pasted URL (or a bare key) ────────────
// e.g. https://bid.callgrid.com/api/bid/cmp5yu7uu04qi07js0iz5mtml?... → cmp5yu...
const extractCallgridKey = (rawUrl) => {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl.trim());
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || null;
  } catch {
    const noQuery = String(rawUrl).split('?')[0];
    const parts = noQuery.split('/').filter(Boolean);
    return parts[parts.length - 1] || null;
  }
};

// ── Build params for a specific destination ────────────────────────────────────
// dest: 'ringba' | 'rtb' | 'callgrid'
// For each campaign field:
//   1. Check destinationParams[dest] for a per-campaign per-destination override key
//   2. Fall back to field.ringbaParamKey (global default)
//   3. Fall back to field.key
// static_value fields always inject their fixed value.
const buildParams = (campaign, submissionData, dest, agentName) => {
  const params = {};

  for (const campaignField of campaign.fields) {
    if (!campaignField.includeInRingba) continue;

    const field = campaignField.field;
    if (!field) continue;

    // static_value: always send fixed value
    if (field.type === 'static_value') {
      if (field.staticValue !== undefined && field.staticValue !== null && field.staticValue !== '') {
        // Param key: per-dest override → global ringbaParamKey → field.key
        const paramKey = campaignField.destinationParams?.[dest]
          || field.ringbaParamKey
          || field.key;
        params[paramKey] = String(field.staticValue);
        console.log(`[${dest}] STATIC [${field.key}] → "${paramKey}" = "${field.staticValue}"`);
      }
      continue;
    }

    // Per-destination param key: campaign-level override > field default > field key
    const paramKey = campaignField.destinationParams?.[dest]
      || field.ringbaParamKey
      || field.key;

    const rawVal = submissionData[field.key];
    if (rawVal === undefined || rawVal === null || rawVal === '') continue;

    // Auto-clean phone values
    const isPhoneKey = ['callerid','caller_id','cid','phone_number','phone','callid'].includes(paramKey.toLowerCase());
    const finalVal   = (field.type === 'phone' || isPhoneKey)
      ? (cleanPhone(String(rawVal)) || String(rawVal))
      : String(rawVal);

    params[paramKey] = finalVal;
    console.log(`[${dest}] FIELD [${field.key}] → "${paramKey}" = "${finalVal}"`);
  }

  // Compliance: forward token_valid=yes/no ONLY when Jornaya is enabled on the
  // campaign. When disabled, the tag is never added.
  if (campaign.jornayaEnabled) {
    const tv = submissionData.token_valid;
    if (tv !== undefined && tv !== null && tv !== '') {
      params['token_valid'] = String(tv);
    }
  }

  // Inject logged-in agent's name into every API call
  if (agentName) {
    params['agent_name'] = agentName;
  }

  return params;
};

// ── Send to Ringba Regular ─────────────────────────────────────────────────────
const sendToRingba = async (ringbaId, params) => {
  const url = ringbaId?.startsWith('http')
    ? ringbaId
    : `https://display.ringba.com/enrich/${ringbaId}`;

  const request = { provider: 'ringba_regular', url, params, fullUrl: buildFullUrl(url, params) };

  try {
    console.log('[Ringba Regular] →', request.fullUrl);
    const response = await httpClient.get(url, { params });
    console.log('[Ringba Regular] ←', response.data);
    return { sent: true, sentAt: new Date(), provider: 'ringba_regular', request, response: response.data, error: null };
  } catch (err) {
    console.error('[Ringba Regular] ERROR', err.response?.status, JSON.stringify(err.response?.data));
    return { sent: false, sentAt: new Date(), provider: 'ringba_regular', request, response: err.response?.data || null, error: err.message };
  }
};

// ── Send to Ringba RTB ─────────────────────────────────────────────────────────
// Paste the full example URL with params:
//   https://rtb.ringba.com/v1/production/32c482e139a74caebb21f5145683e72b.json?CID=xxx&zip_code=xxx
// Params from the pasted URL are static defaults; campaign field mapping overrides them.
const sendToRingbaRtb = async (campaign, submissionData, agentName) => {
  const rawUrl = campaign.ringbaRtbKey || campaign.ringbaRtbUrl;
  if (!rawUrl) return { sent: false, sentAt: new Date(), provider: 'ringba_rtb', request: null, response: null, error: 'Ringba RTB key/URL not configured' };

  const { base, staticParams } = resolveRtbBase(rawUrl);
  const fieldParams  = buildParams(campaign, submissionData, 'rtb', agentName);
  const finalParams  = { ...staticParams, ...fieldParams };
  const request = { provider: 'ringba_rtb', url: base, params: finalParams, fullUrl: buildFullUrl(base, finalParams) };

  try {
    console.log('[Ringba RTB] →', request.fullUrl);
    const response = await httpClient.get(base, { params: finalParams });
    console.log('[Ringba RTB] ←', response.data);
    return { sent: true, sentAt: new Date(), provider: 'ringba_rtb', request, response: response.data, error: null };
  } catch (err) {
    console.error('[Ringba RTB] ERROR', err.response?.data || err.message);
    return { sent: false, sentAt: new Date(), provider: 'ringba_rtb', request, response: err.response?.data || null, error: err.message };
  }
};

// ── Send to CallGrid ───────────────────────────────────────────────────────────
// Paste the full example URL:
//   https://bid.callgrid.com/api/bid/cmp5yu7uu04qk07js2y9fbxkn?CallerId=5551234567&InboundStateCode=CA&InboundZipCode=90210
// All campaign fields map via their per-destination callgrid param key override.
const sendToCallGrid = async (campaign, submissionData, agentName) => {
  const rawUrl = campaign.callgridKey || campaign.callgridUrl;
  if (!rawUrl) return { sent: false, sentAt: new Date(), provider: 'callgrid', request: null, response: null, error: 'CallGrid key/URL not configured' };

  const { base, staticParams } = resolveCallgridBase(rawUrl);
  const fieldParams  = buildParams(campaign, submissionData, 'callgrid', agentName);
  const finalParams  = { ...staticParams, ...fieldParams };
  const request = {
    provider:   'callgrid',
    url:        base,
    uniqueKey:  extractCallgridKey(rawUrl),
    params:     finalParams,
    fullUrl:    buildFullUrl(base, finalParams),
  };

  try {
    console.log('[CallGrid] →', request.fullUrl);
    const response = await httpClient.get(base, { params: finalParams });
    console.log('[CallGrid] ←', response.data);
    return { sent: true, sentAt: new Date(), provider: 'callgrid', request, response: response.data, error: null };
  } catch (err) {
    console.error('[CallGrid] ERROR', err.response?.data || err.message);
    return { sent: false, sentAt: new Date(), provider: 'callgrid', request, response: err.response?.data || null, error: err.message };
  }
};

// ── Route to all configured destinations ──────────────────────────────────────
const sendToDestinations = async (campaign, submissionData, agentName) => {
  const dest    = campaign.destination || 'ringba_regular';
  const results = {};

  if (['ringba_regular','ringba_regular_and_callgrid'].includes(dest)) {
    if (campaign.ringbaId) {
      const params = buildParams(campaign, submissionData, 'ringba', agentName);
      results.ringba = await sendToRingba(campaign.ringbaId, params);
    } else {
      results.ringba = { sent: false, error: 'ringbaId not configured' };
    }
  }

  if (['ringba_rtb','ringba_rtb_and_callgrid'].includes(dest)) {
    results.ringbaRtb = await sendToRingbaRtb(campaign, submissionData, agentName);
  }

  if (['callgrid','ringba_regular_and_callgrid','ringba_rtb_and_callgrid'].includes(dest)) {
    results.callgrid = await sendToCallGrid(campaign, submissionData, agentName);
  }

  const sent = Object.values(results).some((r) => r.sent);
  return { sent, results };
};

module.exports = { sendToRingba, sendToRingbaRtb, sendToCallGrid, sendToDestinations, buildParams, cleanPhone, parseApiUrl, buildFullUrl, extractCallgridKey };
