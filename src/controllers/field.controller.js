'use strict';

const Field = require('../models/Field');
const { sendSuccess, sendPaginated } = require('../utils/response');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const audit = require('../utils/audit');

exports.getAll = catchAsync(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(200, parseInt(req.query.limit) || 50);
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.type) filter.type = req.query.type;
  if (req.query.search) {
    filter.$or = [
      { label: { $regex: req.query.search, $options: 'i' } },
      { key: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  const [fields, total] = await Promise.all([
    Field.find(filter).sort({ label: 1 }).skip(skip).limit(limit).lean(),
    Field.countDocuments(filter),
  ]);

  sendPaginated(res, fields, total, page, limit);
});

exports.getOne = catchAsync(async (req, res, next) => {
  const field = await Field.findById(req.params.id).lean();
  if (!field) return next(new AppError('Field not found.', 404));
  sendSuccess(res, { field });
});

exports.create = catchAsync(async (req, res) => {
  const field = await Field.create({ ...req.body, createdBy: req.user._id });
  await audit({ user: req.user, action: 'CREATE', resource: 'Field', resourceId: field._id, changes: req.body, req });
  sendSuccess(res, { field }, 201);
});

exports.update = catchAsync(async (req, res, next) => {
  const field = await Field.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!field) return next(new AppError('Field not found.', 404));
  await audit({ user: req.user, action: 'UPDATE', resource: 'Field', resourceId: field._id, changes: req.body, req });
  sendSuccess(res, { field });
});

exports.delete = catchAsync(async (req, res, next) => {
  const Campaign = require('../models/Campaign');
  const usedIn = await Campaign.countDocuments({ 'fields.field': req.params.id, isActive: true });
  if (usedIn > 0) {
    return next(new AppError(`Field is used in ${usedIn} active campaign(s). Remove it from campaigns first.`, 400));
  }

  const field = await Field.findByIdAndDelete(req.params.id);
  if (!field) return next(new AppError('Field not found.', 404));

  await audit({ user: req.user, action: 'DELETE', resource: 'Field', resourceId: field._id, req });
  sendSuccess(res, { message: 'Field deleted.' });
});
