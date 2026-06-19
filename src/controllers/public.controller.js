'use strict';

const { processSubmission } = require('../services/submission.service');
const { loadCampaign } = require('../services/submission.service');
const { sendSuccess } = require('../utils/response');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// ── Public-facing response sanitizer ────────────────────────────────────────────
// External publishers / call centers must NEVER see vendor internals (which
// vendor, the endpoint, the URL, our keys, the raw vendor body, or Ringba's
// "status: ok"). They only get the call-routing decision.
//
// If CallGrid is integrated: agentAvailable is driven by code 1000. Any other
// code → retry. (Ringba-only campaigns: accepted → send, no retry, nothing leaked.)
const MAX_RETRIES = 8;

const buildPublicResponse = (result) => {
  const a = result.availability || {};
  const available = !!a.agentAvailable;

  return {
    success:        result.status === 'sent',
    agentAvailable: available,
    sendCall:       available,
    retry:          !available,
    maxRetries:     MAX_RETRIES,
    phoneNumber:    available ? (a.phoneNumber || null) : null,
    message: available
      ? `Agent available — send the call${a.phoneNumber ? ` to ${a.phoneNumber}` : ''}.`
      : `No agents available at the moment. Please retry (up to ${MAX_RETRIES} attempts); if still unavailable, call back later.`,
    instructions: 'If sendCall is true, route the call to phoneNumber. If retry is true, re-send this request to check again — up to maxRetries per lead; if still unavailable, stop and try later.',
  };
};

exports.ingestLead = catchAsync(async (req, res, next) => {
  const { campaignId, data } = req.body;
  const publisher = req.publisher;

  const campaign = await loadCampaign(campaignId, publisher._id.toString(), 'admin');
  if (campaign.publisher._id.toString() !== publisher._id.toString() &&
      campaign.publisher.toString() !== publisher._id.toString()) {
    return next(new AppError('Campaign does not belong to this publisher.', 403));
  }

  const result = await processSubmission({
    campaignId,
    publisherId: publisher._id.toString(),
    agentId: null,
    data,
    source: 'api',
    userRole: 'admin',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json(buildPublicResponse(result));
});

exports.enrichEndpoint = catchAsync(async (req, res, next) => {
  const { publisherId, campaignId } = req.params;
  const data = { ...req.query, ...req.body };

  const result = await processSubmission({
    campaignId,
    publisherId,
    agentId: null,
    data,
    source: 'api',
    userRole: 'super_admin',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json(buildPublicResponse(result));
});
