'use strict';

const { processSubmission } = require('../services/submission.service');
const { loadCampaign } = require('../services/submission.service');
const { sendSuccess } = require('../utils/response');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// ── Public-facing response sanitizer ────────────────────────────────────────────
// External publishers / call centers must NEVER see the vendor endpoint, the
// final URL, the params we send, or our keys — only success + the vendor's own
// response. (Super admins see everything in the authenticated internal UI.)
const buildPublicResponse = (result) => {
  const dests = result.destinationResults || {};
  const keys = Object.keys(dests);

  let response;
  if (keys.length === 1) {
    response = dests[keys[0]]?.response ?? null;
  } else if (keys.length > 1) {
    response = {};
    for (const k of keys) response[k] = dests[k]?.response ?? null;
  } else {
    response = null;
  }

  const a = result.availability || {};

  return {
    success:        result.status === 'sent',
    // Call-routing decision (CallGrid code 1000 = agent available; Ringba = accepted)
    agentAvailable: a.agentAvailable ?? false,
    sendCall:       a.agentAvailable ?? false,
    code:           a.code ?? null,
    phoneNumber:    a.phoneNumber ?? null,
    message:        a.message || (result.status === 'sent' ? 'Accepted.' : 'Not accepted.'),
    instructions:   'If sendCall is true, route the call to phoneNumber. For CallGrid, response.code 1000 = agent available; any other code = no agent (retry). Ringba returns status: ok with no code.',
    response,
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
