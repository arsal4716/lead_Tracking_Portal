'use strict';

const Campaign = require('../models/Campaign');
const { ROLES } = require('../models/User');
const { sendSuccess, sendPaginated } = require('../utils/response');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const audit = require('../utils/audit');

const buildEnrichUrl = (publisherId, campaignId) =>
  `${process.env.FRONTEND_URL}/api/v1/public/enrich/${publisherId}/${campaignId}`;

// GET /campaigns
exports.getAll = catchAsync(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;

  const filter = {};
  if (req.user.role !== ROLES.SUPER_ADMIN) {
    filter.publisher = req.publisherId;
  } else if (req.query.publisher) {
    filter.publisher = req.query.publisher;
  }
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
  if (req.query.search) filter.name = { $regex: req.query.search, $options: 'i' };

  const [campaigns, total] = await Promise.all([
    Campaign.find(filter)
      .populate('publisher', 'name slug _id')
      .populate('fields.field', 'key label type ringbaParamKey staticValue')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Campaign.countDocuments(filter),
  ]);

  // Guard: filter out campaigns whose publisher was deleted (populate returns null)
  const enriched = campaigns
    .filter((c) => c.publisher != null)
    .map((c) => ({
      ...c,
      enrichUrl: buildEnrichUrl(c.publisher._id, c._id),
    }));

  sendPaginated(res, enriched, total, page, limit);
});

// GET /campaigns/:id
exports.getOne = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };
  if (req.user.role !== ROLES.SUPER_ADMIN) filter.publisher = req.publisherId;

  const campaign = await Campaign.findOne(filter)
    .populate('publisher', 'name slug _id')
    .populate('fields.field')
    .populate('apiIntegration', 'name endpoint lookupField')
    .lean();

  if (!campaign) return next(new AppError('Campaign not found.', 404));
  if (!campaign.publisher) return next(new AppError('Campaign publisher not found.', 404));

  campaign.enrichUrl = buildEnrichUrl(campaign.publisher._id, campaign._id);
  sendSuccess(res, { campaign });
});

// POST /campaigns
exports.create = catchAsync(async (req, res) => {
  if (req.user.role !== ROLES.SUPER_ADMIN) {
    req.body.publisher = req.publisherId;
  }

  const campaign = await Campaign.create({ ...req.body, createdBy: req.user._id });

  await audit({
    user: req.user, publisher: campaign.publisher,
    action: 'CREATE', resource: 'Campaign', resourceId: campaign._id, changes: req.body, req,
  });

  const populated = await Campaign.findById(campaign._id)
    .populate('publisher', 'name slug _id')
    .populate('fields.field')
    .lean();

  populated.enrichUrl = populated.publisher
    ? buildEnrichUrl(populated.publisher._id, populated._id)
    : null;

  sendSuccess(res, { campaign: populated }, 201);
});

// PATCH /campaigns/:id
exports.update = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };
  if (req.user.role !== ROLES.SUPER_ADMIN) filter.publisher = req.publisherId;

  delete req.body.publisher; // prevent reassignment

  const campaign = await Campaign.findOneAndUpdate(filter, req.body, {
    new: true, runValidators: true,
  })
    .populate('publisher', 'name slug _id')
    .populate('fields.field')
    .lean();

  if (!campaign) return next(new AppError('Campaign not found.', 404));
  if (!campaign.publisher) return next(new AppError('Campaign publisher not found.', 404));

  campaign.enrichUrl = buildEnrichUrl(campaign.publisher._id, campaign._id);

  await audit({
    user: req.user, publisher: campaign.publisher._id,
    action: 'UPDATE', resource: 'Campaign', resourceId: campaign._id, changes: req.body, req,
  });

  sendSuccess(res, { campaign });
});

// PATCH /campaigns/:id/toggle  — flip active/inactive, does NOT delete
exports.toggleActive = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };
  if (req.user.role !== ROLES.SUPER_ADMIN) filter.publisher = req.publisherId;

  const campaign = await Campaign.findOne(filter);
  if (!campaign) return next(new AppError('Campaign not found.', 404));

  campaign.isActive = !campaign.isActive;
  await campaign.save({ validateBeforeSave: false });

  await audit({
    user: req.user, publisher: campaign.publisher,
    action: campaign.isActive ? 'ACTIVATE' : 'DEACTIVATE',
    resource: 'Campaign', resourceId: campaign._id, req,
  });

  sendSuccess(res, { campaign, isActive: campaign.isActive });
});

// DELETE /campaigns/:id  — permanent hard delete, super_admin only
exports.delete = catchAsync(async (req, res, next) => {
  const campaign = await Campaign.findByIdAndDelete(req.params.id);
  if (!campaign) return next(new AppError('Campaign not found.', 404));

  await audit({
    user: req.user, publisher: campaign.publisher,
    action: 'DELETE', resource: 'Campaign', resourceId: campaign._id, req,
  });

  sendSuccess(res, { message: 'Campaign permanently deleted.' });
});

// GET /campaigns/:id/enrich-url
exports.getEnrichUrl = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };
  if (req.user.role !== ROLES.SUPER_ADMIN) filter.publisher = req.publisherId;

  const campaign = await Campaign.findOne(filter)
    .populate('publisher', '_id name')
    .lean();

  if (!campaign) return next(new AppError('Campaign not found.', 404));
  if (!campaign.publisher) return next(new AppError('Campaign publisher not found.', 404));

  const enrichUrl = buildEnrichUrl(campaign.publisher._id, campaign._id);
  sendSuccess(res, { enrichUrl, publisherId: campaign.publisher._id, campaignId: campaign._id });
});