'use strict';

const { processSubmission } = require('../services/submission.service');
const { loadCampaign } = require('../services/submission.service');
const { sendSuccess } = require('../utils/response');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// ── Public-facing response ──────────────────────────────────────────────────────
// External API posters get the EXACT vendor response (CallGrid / Ringba). We hide
// only OUR request internals (final URL / params / keys) which would otherwise
// expose the vendor endpoint and our keys.
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

  return {
    success: result.status === 'sent',
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
