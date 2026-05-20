'use strict';

const Submission = require('../models/Submission');
const { ROLES } = require('../models/User');
const { processSubmission, repostSubmission } = require('../services/submission.service');
const { sendSuccess, sendPaginated } = require('../utils/response');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

exports.submit = catchAsync(async (req, res) => {
  const { campaignId, data } = req.body;

  const result = await processSubmission({
    campaignId,
    publisherId: req.publisherId,
    agentId: req.user._id,
    data,
    source: 'form',
    userRole: req.user.role,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  sendSuccess(res, result, 201);
});

exports.getAll = catchAsync(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip = (page - 1) * limit;

  const filter = {};

  if (req.user.role === ROLES.AGENT) {
    filter.agent = req.user._id;
  } else if (req.user.role === ROLES.ADMIN) {
    filter.publisher = req.publisherId;
  } else {
    if (req.query.publisher) filter.publisher = req.query.publisher;
  }

  if (req.query.campaign) filter.campaign = req.query.campaign;
  if (req.query.source) filter.source = req.query.source;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.phone) filter.phone = { $regex: req.query.phone, $options: 'i' };

  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }

  const [submissions, total] = await Promise.all([
    Submission.find(filter)
      .populate('campaign', 'name ringbaId')
      .populate('publisher', 'name')
      .populate('agent', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Submission.countDocuments(filter),
  ]);

  sendPaginated(res, submissions, total, page, limit);
});

exports.getOne = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };

  if (req.user.role === ROLES.AGENT) filter.agent = req.user._id;
  else if (req.user.role === ROLES.ADMIN) filter.publisher = req.publisherId;

  const submission = await Submission.findOne(filter)
    .populate('campaign', 'name ringbaId fields')
    .populate('publisher', 'name')
    .populate('agent', 'name email')
    .lean();

  if (!submission) return next(new AppError('Submission not found.', 404));
  sendSuccess(res, { submission });
});

exports.repost = catchAsync(async (req, res, next) => {
  const { targetCampaignId } = req.body;

  const result = await repostSubmission({
    originalSubmissionId: req.params.id,
    targetCampaignId,
    userId: req.user._id,
    userRole: req.user.role,
    publisherId: req.publisherId,
  });

  sendSuccess(res, result, 201);
});

exports.getStats = catchAsync(async (req, res) => {
  const matchStage = {};

  if (req.user.role === ROLES.AGENT) matchStage.agent = req.user._id;
  else if (req.user.role === ROLES.ADMIN) matchStage.publisher = require('mongoose').Types.ObjectId.createFromHexString(req.publisherId);
  else if (req.query.publisher) matchStage.publisher = require('mongoose').Types.ObjectId.createFromHexString(req.query.publisher);

  const [totals, bySource, byStatus, byCampaign] = await Promise.all([
    Submission.countDocuments(matchStage),
    Submission.aggregate([
      { $match: matchStage },
      { $group: { _id: '$source', count: { $sum: 1 } } },
    ]),
    Submission.aggregate([
      { $match: matchStage },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Submission.aggregate([
      { $match: matchStage },
      { $group: { _id: '$campaign', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'campaigns', localField: '_id', foreignField: '_id', as: 'campaign' } },
      { $unwind: '$campaign' },
      { $project: { campaignName: '$campaign.name', count: 1 } },
    ]),
  ]);

  sendSuccess(res, { totals, bySource, byStatus, byCampaign });
});
