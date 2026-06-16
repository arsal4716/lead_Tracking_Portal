'use strict';

const Submission = require('../models/Submission');
const { ROLES }  = require('../models/User');
const { processSubmission, repostSubmission } = require('../services/submission.service');
const { sendSuccess, sendPaginated } = require('../utils/response');
const AppError   = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const audit      = require('../utils/audit');
const { buildDateFilter } = require('../utils/estDate');

// POST /submissions
exports.submit = catchAsync(async (req, res) => {
  const { campaignId, data } = req.body;

  const result = await processSubmission({
    campaignId,
    publisherId: req.publisherId,
    agentId:     req.user._id,
    data,
    source:      'form',
    userRole:    req.user.role,
    ipAddress:   req.ip,
    userAgent:   req.headers['user-agent'],
  });

  sendSuccess(res, result, 201);
});

// GET /submissions
exports.getAll = catchAsync(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;

  const filter = {};

  // Role-based scoping:
  // - agent: only their own submissions
  // - admin: all submissions from their publisher (all agents under them)
  // - super_admin: all submissions, optionally filtered by publisher
  if (req.user.role === ROLES.AGENT) {
    filter.agent = req.user._id;
  } else if (req.user.role === ROLES.ADMIN) {
    filter.publisher = req.publisherId;
  } else {
    // super_admin — optional publisher filter
    if (req.query.publisher) filter.publisher = req.query.publisher;
  }

  if (req.query.campaign) filter.campaign = req.query.campaign;
  if (req.query.source)   filter.source   = req.query.source;
  if (req.query.status)   filter.status   = req.query.status;
  if (req.query.fraud === 'true')  filter.callBeforeLead = true;
  if (req.query.fraud === 'false') filter.callBeforeLead = { $ne: true };

  // Phone search — format-agnostic. Normalises the query to digits and matches
  // the normalised column; falls back to the raw column for legacy records.
  if (req.query.phone) {
    const digits = String(req.query.phone).replace(/\D/g, '');
    const last10 = digits.length > 10 ? digits.slice(-10) : digits;
    if (last10) {
      filter.$or = [
        { phoneNormalized: { $regex: last10, $options: 'i' } },
        { phone:           { $regex: digits, $options: 'i' } },
      ];
    }
  }

  // Date range filtering — from/to are Eastern (YYYY-MM-DD) or ISO; resolved to UTC.
  const dateFilter = buildDateFilter(req.query.from, req.query.to);
  if (dateFilter) filter.createdAt = dateFilter;

  const [submissions, total] = await Promise.all([
    Submission.find(filter)
      .populate('campaign',  'name ringbaId destination')
      .populate('publisher', 'name')
      .populate('agent',     'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Submission.countDocuments(filter),
  ]);

  sendPaginated(res, submissions, total, page, limit);
});

// GET /submissions/:id
exports.getOne = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };

  if (req.user.role === ROLES.AGENT)  filter.agent     = req.user._id;
  else if (req.user.role === ROLES.ADMIN) filter.publisher = req.publisherId;

  const submission = await Submission.findOne(filter)
    .populate('campaign',  'name ringbaId fields destination')
    .populate('publisher', 'name')
    .populate('agent',     'name email')
    .lean();

  if (!submission) return next(new AppError('Submission not found.', 404));
  sendSuccess(res, { submission });
});

// POST /submissions/:id/repost
exports.repost = catchAsync(async (req, res, next) => {
  const { targetCampaignId } = req.body;

  const result = await repostSubmission({
    originalSubmissionId: req.params.id,
    targetCampaignId,
    userId:      req.user._id,
    userRole:    req.user.role,
    publisherId: req.publisherId,
  });

  sendSuccess(res, result, 201);
});

// GET /submissions/stats
exports.getStats = catchAsync(async (req, res) => {
  const matchStage = {};

  if (req.user.role === ROLES.AGENT) {
    matchStage.agent = req.user._id;
  } else if (req.user.role === ROLES.ADMIN) {
    matchStage.publisher = require('mongoose').Types.ObjectId.createFromHexString(req.publisherId);
  } else if (req.query.publisher) {
    matchStage.publisher = require('mongoose').Types.ObjectId.createFromHexString(req.query.publisher);
  }

  if (req.query.campaign) {
    matchStage.campaign = require('mongoose').Types.ObjectId.createFromHexString(req.query.campaign);
  }

  // Date range — dashboard defaults to "today" (Eastern) but range is honoured.
  const dateFilter = buildDateFilter(req.query.from, req.query.to);
  if (dateFilter) matchStage.createdAt = dateFilter;

  const [totals, invalidLeads, bySource, byStatus, byCampaign, perPublisher] = await Promise.all([
    Submission.countDocuments(matchStage),
    Submission.countDocuments({ ...matchStage, callBeforeLead: true }),
    Submission.aggregate([{ $match: matchStage }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
    Submission.aggregate([{ $match: matchStage }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Submission.aggregate([
      { $match: matchStage },
      { $group: { _id: '$campaign', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'campaigns', localField: '_id', foreignField: '_id', as: 'campaign' } },
      { $unwind: '$campaign' },
      { $project: { campaignName: '$campaign.name', count: 1 } },
    ]),
    Submission.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id:     '$publisher',
          total:   { $sum: 1 },
          invalid: { $sum: { $cond: ['$callBeforeLead', 1, 0] } },
        },
      },
      { $lookup: { from: 'publishers', localField: '_id', foreignField: '_id', as: 'publisher' } },
      { $unwind: { path: '$publisher', preserveNullAndEmptyArrays: true } },
      { $project: { publisherName: { $ifNull: ['$publisher.name', 'Unknown'] }, total: 1, invalid: 1, valid: { $subtract: ['$total', '$invalid'] } } },
      { $sort: { total: -1 } },
    ]),
  ]);

  sendSuccess(res, {
    totals,
    validLeads:   totals - invalidLeads,
    invalidLeads, // CALL_BEFORE_LEAD
    bySource,
    byStatus,
    byCampaign,
    perPublisher,
  });
});

// DELETE /submissions/reset  — super_admin only, clears ALL submissions
// This endpoint is protected by restrictTo(ROLES.SUPER_ADMIN) in routes
exports.reset = catchAsync(async (req, res) => {
  const { confirm } = req.body;
  if (confirm !== 'RESET_ALL_SUBMISSIONS') {
    return res.status(400).json({
      status: 'fail',
      message: 'Send { "confirm": "RESET_ALL_SUBMISSIONS" } in request body to confirm.',
    });
  }

  const result = await Submission.deleteMany({});
  sendSuccess(res, { message: `Deleted ${result.deletedCount} submissions. CRM is now fresh.` });
});

// DELETE /submissions/:id  — delete a single submission (super_admin only)
exports.deleteOne = catchAsync(async (req, res, next) => {
  const submission = await Submission.findByIdAndDelete(req.params.id);
  if (!submission) return next(new AppError('Submission not found.', 404));

  await audit({
    user: req.user, publisher: submission.publisher,
    action: 'DELETE_SUBMISSION', resource: 'Submission', resourceId: submission._id, req,
  });

  sendSuccess(res, { message: 'Submission deleted.' });
});