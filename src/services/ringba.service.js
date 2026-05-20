'use strict';

const axios = require('axios');

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

  try {
    console.log('[Ringba Regular] →', url, params);
    const response = await axios.get(url, { params, timeout: 10000 });
    console.log('[Ringba Regular] ←', response.data);
    return { sent: true, sentAt: new Date(), response: response.data, error: null };
  } catch (err) {
    console.error('[Ringba Regular] ERROR', err.response?.status, JSON.stringify(err.response?.data));
    return { sent: false, sentAt: new Date(), response: err.response?.data || null, error: err.message };
  }
};

// ── Send to Ringba RTB ─────────────────────────────────────────────────────────
// Paste the full example URL with params:
//   https://rtb.ringba.com/v1/production/32c482e139a74caebb21f5145683e72b.json?CID=xxx&zip_code=xxx
// Params from the pasted URL are static defaults; campaign field mapping overrides them.
const sendToRingbaRtb = async (campaign, submissionData, agentName) => {
  const rawUrl = campaign.ringbaRtbUrl;
  if (!rawUrl) return { sent: false, sentAt: new Date(), response: null, error: 'Ringba RTB URL not configured' };

  try {
    const { base, staticParams } = parseApiUrl(rawUrl);
    const fieldParams  = buildParams(campaign, submissionData, 'rtb', agentName);
    const finalParams  = { ...staticParams, ...fieldParams };

    console.log('[Ringba RTB] →', base, finalParams);
    const response = await axios.get(base, { params: finalParams, timeout: 10000 });
    console.log('[Ringba RTB] ←', response.data);
    return { sent: true, sentAt: new Date(), response: response.data, error: null };
  } catch (err) {
    console.error('[Ringba RTB] ERROR', err.response?.data || err.message);
    return { sent: false, sentAt: new Date(), response: err.response?.data || null, error: err.message };
  }
};

// ── Send to CallGrid ───────────────────────────────────────────────────────────
// Paste the full example URL:
//   https://bid.callgrid.com/api/bid/cmp5yu7uu04qk07js2y9fbxkn?CallerId=5551234567&InboundStateCode=CA&InboundZipCode=90210
// All campaign fields map via their per-destination callgrid param key override.
const sendToCallGrid = async (campaign, submissionData, agentName) => {
  const rawUrl = campaign.callgridUrl;
  if (!rawUrl) return { sent: false, sentAt: new Date(), response: null, error: 'CallGrid URL not configured' };

  try {
    const { base, staticParams } = parseApiUrl(rawUrl);
    const fieldParams  = buildParams(campaign, submissionData, 'callgrid', agentName);
    const finalParams  = { ...staticParams, ...fieldParams };

    console.log('[CallGrid] →', base, finalParams);
    const response = await axios.get(base, { params: finalParams, timeout: 10000 });
    console.log('[CallGrid] ←', response.data);
    return { sent: true, sentAt: new Date(), response: response.data, error: null };
  } catch (err) {
    console.error('[CallGrid] ERROR', err.response?.data || err.message);
    return { sent: false, sentAt: new Date(), response: err.response?.data || null, error: err.message };
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

module.exports = { sendToRingba, sendToRingbaRtb, sendToCallGrid, sendToDestinations, buildParams, cleanPhone, parseApiUrl };
