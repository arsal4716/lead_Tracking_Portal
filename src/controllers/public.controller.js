'use strict';

const { processSubmission } = require('../services/submission.service');
const { loadCampaign } = require('../services/submission.service');
const { sendSuccess } = require('../utils/response');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

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

  sendSuccess(res, result, 201);
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

  res.status(200).json({ status: 'success', ...result });
});
