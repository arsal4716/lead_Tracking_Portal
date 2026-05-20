'use strict';

const Publisher = require('../models/Publisher');
const { sendSuccess, sendPaginated } = require('../utils/response');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const audit = require('../utils/audit');

// GET /publishers
exports.getAll = catchAsync(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;

  const filter = {};
  if (req.query.search)               filter.name     = { $regex: req.query.search, $options: 'i' };
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';

  const [publishers, total] = await Promise.all([
    Publisher.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Publisher.countDocuments(filter),
  ]);

  sendPaginated(res, publishers, total, page, limit);
});

// GET /publishers/:id
exports.getOne = catchAsync(async (req, res, next) => {
  const publisher = await Publisher.findById(req.params.id).lean();
  if (!publisher) return next(new AppError('Publisher not found.', 404));
  sendSuccess(res, { publisher });
});

// POST /publishers
exports.create = catchAsync(async (req, res) => {
  const publisher = await Publisher.create(req.body);

  await audit({
    user: req.user, publisher: publisher._id,
    action: 'CREATE', resource: 'Publisher', resourceId: publisher._id, changes: req.body, req,
  });

  sendSuccess(res, { publisher }, 201);
});

// PATCH /publishers/:id
exports.update = catchAsync(async (req, res, next) => {
  delete req.body.slug;   // slug is immutable after creation
  delete req.body.apiKey; // API key only changes via rotate-key

  const publisher = await Publisher.findByIdAndUpdate(req.params.id, req.body, {
    new: true, runValidators: true,
  });

  if (!publisher) return next(new AppError('Publisher not found.', 404));

  await audit({
    user: req.user, publisher: publisher._id,
    action: 'UPDATE', resource: 'Publisher', resourceId: publisher._id, changes: req.body, req,
  });

  sendSuccess(res, { publisher });
});

// PATCH /publishers/:id/toggle  — active/inactive toggle (separate from delete)
exports.toggleActive = catchAsync(async (req, res, next) => {
  const publisher = await Publisher.findById(req.params.id);
  if (!publisher) return next(new AppError('Publisher not found.', 404));

  publisher.isActive = !publisher.isActive;
  await publisher.save({ validateBeforeSave: false });

  await audit({
    user: req.user, publisher: publisher._id,
    action: publisher.isActive ? 'ACTIVATE' : 'DEACTIVATE',
    resource: 'Publisher', resourceId: publisher._id, req,
  });

  sendSuccess(res, { publisher, isActive: publisher.isActive });
});

// POST /publishers/:id/rotate-key
exports.rotateApiKey = catchAsync(async (req, res, next) => {
  const { v4: uuidv4 } = require('uuid');
  const publisher = await Publisher.findByIdAndUpdate(
    req.params.id,
    { apiKey: `ak_${uuidv4().replace(/-/g, '')}` },
    { new: true }
  );

  if (!publisher) return next(new AppError('Publisher not found.', 404));

  await audit({
    user: req.user, publisher: publisher._id,
    action: 'ROTATE_API_KEY', resource: 'Publisher', resourceId: publisher._id, req,
  });

  sendSuccess(res, { publisher });
});

// PATCH /publishers/:id/ip-whitelist
exports.updateIpWhitelist = catchAsync(async (req, res, next) => {
  const { ipWhitelist } = req.body;

  const publisher = await Publisher.findByIdAndUpdate(
    req.params.id,
    { ipWhitelist },
    { new: true, runValidators: true }
  );

  if (!publisher) return next(new AppError('Publisher not found.', 404));

  await audit({
    user: req.user, publisher: publisher._id,
    action: 'UPDATE_IP_WHITELIST', resource: 'Publisher', resourceId: publisher._id,
    changes: { ipWhitelist }, req,
  });

  sendSuccess(res, { publisher });
});

// DELETE /publishers/:id  — hard delete, super_admin only
exports.delete = catchAsync(async (req, res, next) => {
  const publisher = await Publisher.findByIdAndDelete(req.params.id);
  if (!publisher) return next(new AppError('Publisher not found.', 404));

  await audit({
    user: req.user, publisher: publisher._id,
    action: 'DELETE', resource: 'Publisher', resourceId: publisher._id, req,
  });

  sendSuccess(res, { message: 'Publisher permanently deleted.' });
});