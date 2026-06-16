'use strict';

const mongoose   = require('mongoose');
const Call       = require('../models/Call');
const { CALL_STATUS } = require('../models/Call');
const Publisher  = require('../models/Publisher');
const Submission = require('../models/Submission');
const { cleanPhone } = require('./ringba.service');

// ── Lenient timestamp parsing ───────────────────────────────────────────────────
// Accepts epoch milliseconds (13 digits, UTC — CallGrid's default), epoch seconds
// (10 digits), or ISO strings. Falls back to "now".
const parseTimestamp = (raw) => {
  if (!raw) return new Date();
  const str = String(raw).trim();
  if (/^\d{13}$/.test(str)) return new Date(Number(str));        // epoch ms (UTC)
  if (/^\d{10}$/.test(str)) return new Date(Number(str) * 1000); // epoch s
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date() : d;
};

/**
 * Core call-event processing: resolve publisher, match the lead, apply the
 * CALL_BEFORE_LEAD fraud rule, persist the Call, and retro-flag the lead.
 *
 * Pure of HTTP — safe to run inline or inside a BullMQ worker.
 *
 * @param {Object} job
 * @param {Object} job.params    raw inbound params (callTimeStamp, publisherName, callerId, ...)
 * @param {string} [job.ip]
 * @param {string} [job.userAgent]
 * @returns {Promise<{callId:string, callStatus:string}>}
 */
const processCallEvent = async ({ params = {}, ip, userAgent } = {}) => {
  const q = params || {};

  const publisherName = q.publisherName || q.VendorName || q.vendorName || null;
  const callerId      = q.callerId || q.CallerId || q.caller_id || q.callerid || null;
  const callTimeStamp = parseTimestamp(q.callTimeStamp || q.BidToCallTime || q.timestamp);
  const callerIdNormalized = cleanPhone(callerId);

  // Resolve publisher by name (never merge across publishers).
  let publisher = null;
  if (publisherName) {
    publisher = await Publisher.findOne({
      name: { $regex: `^${String(publisherName).trim()}$`, $options: 'i' },
    }).select('_id').lean();
  }

  let campaignId = null;
  if (q.campaignId && mongoose.isValidObjectId(q.campaignId)) campaignId = q.campaignId;

  // Find the lead this call corresponds to — strictly within the same publisher.
  let matchedLead = null;
  if (publisher && callerIdNormalized) {
    const leadFilter = { publisher: publisher._id, phoneNormalized: callerIdNormalized };
    if (campaignId) leadFilter.campaign = campaignId;
    matchedLead = await Submission.findOne(leadFilter).sort({ createdAt: 1 }).lean();
  }

  // FRAUD RULE: legitimate only if a matching lead was submitted at/before the call.
  let status = CALL_STATUS.UNMATCHED;
  let isFraud = true;
  if (matchedLead) {
    const leadAt = new Date(matchedLead.createdAt).getTime();
    if (leadAt <= callTimeStamp.getTime()) {
      status = CALL_STATUS.VALID;
      isFraud = false;
    } else {
      status = CALL_STATUS.CALL_BEFORE_LEAD;
      isFraud = true;
    }
  }

  const call = await Call.create({
    publisher:          publisher?._id || null,
    publisherName:      publisherName || null,
    campaign:           campaignId || (matchedLead ? matchedLead.campaign : null),
    callerId:           callerId || null,
    callerIdNormalized: callerIdNormalized || null,
    callTimeStamp,
    raw:                q,
    matchedLead:        matchedLead?._id || null,
    status,
    isFraud,
    ipAddress:          ip,
    userAgent,
  });

  // If fraud, retro-flag the matched lead so it shows RED in the UI.
  if (matchedLead && status === CALL_STATUS.CALL_BEFORE_LEAD) {
    await Submission.findByIdAndUpdate(matchedLead._id, { callBeforeLead: true });
  }

  return { callId: String(call._id), callStatus: status };
};

module.exports = { processCallEvent, parseTimestamp };
