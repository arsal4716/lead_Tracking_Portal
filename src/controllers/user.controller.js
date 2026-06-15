'use strict';

const User       = require('../models/User');
const { ROLES, APPROVAL_STATUS } = require('../models/User');
const { sendSuccess, sendPaginated } = require('../utils/response');
const AppError   = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const audit      = require('../utils/audit');

// GET /users
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

  if (req.query.role)           filter.role = req.query.role;
  if (req.query.approvalStatus) filter.approvalStatus = req.query.approvalStatus;
  if (req.query.search)         filter.name = { $regex: req.query.search, $options: 'i' };

  const [users, total] = await Promise.all([
    User.find(filter).populate('publisher', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  sendPaginated(res, users, total, page, limit);
});

// GET /users/:id
exports.getOne = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };
  if (req.user.role !== ROLES.SUPER_ADMIN) filter.publisher = req.publisherId;

  const user = await User.findOne(filter).populate('publisher', 'name').lean();
  if (!user) return next(new AppError('User not found.', 404));
  sendSuccess(res, { user });
});

// POST /users
exports.create = catchAsync(async (req, res, next) => {
  if (req.user.role !== ROLES.SUPER_ADMIN) {
    req.body.publisher = req.publisherId;
    if (req.body.role === ROLES.SUPER_ADMIN) {
      return next(new AppError('Cannot create super admin.', 403));
    }
  }

  const user = await User.create(req.body);

  await audit({
    user: req.user, publisher: user.publisher,
    action: 'CREATE_USER', resource: 'User', resourceId: user._id, req,
  });

  const populated = await User.findById(user._id).populate('publisher', 'name').lean();
  sendSuccess(res, { user: populated }, 201);
});

// PATCH /users/:id
exports.update = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };
  if (req.user.role !== ROLES.SUPER_ADMIN) filter.publisher = req.publisherId;

  // Only super_admin can change role or publisher
  if (req.user.role !== ROLES.SUPER_ADMIN) {
    ['password', 'role', 'publisher', 'refreshToken'].forEach((f) => delete req.body[f]);
  } else {
    if (req.body.role === ROLES.SUPER_ADMIN) delete req.body.role; // cannot promote to super_admin via API
    ['password', 'refreshToken'].forEach((f) => delete req.body[f]);
  }

  const user = await User.findOneAndUpdate(filter, req.body, {
    new: true, runValidators: true,
  }).populate('publisher', 'name');

  if (!user) return next(new AppError('User not found.', 404));

  await audit({
    user: req.user, publisher: user.publisher,
    action: 'UPDATE_USER', resource: 'User', resourceId: user._id, req,
  });

  sendSuccess(res, { user });
});

// PATCH /users/:id/toggle-active  — active/inactive toggle (separate from delete)
exports.toggleActive = catchAsync(async (req, res, next) => {
  if (req.params.id === req.user._id.toString()) {
    return next(new AppError('Cannot change your own active status.', 400));
  }

  const filter = { _id: req.params.id };
  if (req.user.role !== ROLES.SUPER_ADMIN) filter.publisher = req.publisherId;

  const user = await User.findOne(filter);
  if (!user) return next(new AppError('User not found.', 404));

  user.isActive = !user.isActive;
  await user.save({ validateBeforeSave: false });

  await audit({
    user: req.user,
    action: user.isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
    resource: 'User', resourceId: user._id, req,
  });

  sendSuccess(res, { user, isActive: user.isActive });
});

// PATCH /users/:id/approve  — super_admin approves a pending signup (activates it)
exports.approve = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) return next(new AppError('User not found.', 404));

  user.approvalStatus = APPROVAL_STATUS.APPROVED;
  user.isActive       = true;
  user.approvedBy     = req.user._id;
  user.approvedAt     = new Date();
  await user.save({ validateBeforeSave: false });

  await audit({
    user: req.user, publisher: user.publisher,
    action: 'APPROVE_USER', resource: 'User', resourceId: user._id, req,
  });

  sendSuccess(res, { user, approvalStatus: user.approvalStatus });
});

// PATCH /users/:id/reject  — super_admin rejects a pending signup
exports.reject = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) return next(new AppError('User not found.', 404));

  user.approvalStatus = APPROVAL_STATUS.REJECTED;
  user.isActive       = false;
  await user.save({ validateBeforeSave: false });

  await audit({
    user: req.user, publisher: user.publisher,
    action: 'REJECT_USER', resource: 'User', resourceId: user._id, req,
  });

  sendSuccess(res, { user, approvalStatus: user.approvalStatus });
});

// DELETE /users/:id  — hard delete, super_admin only
exports.delete = catchAsync(async (req, res, next) => {
  if (req.params.id === req.user._id.toString()) {
    return next(new AppError('Cannot delete your own account.', 400));
  }

  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return next(new AppError('User not found.', 404));

  await audit({
    user: req.user, publisher: user.publisher,
    action: 'DELETE_USER', resource: 'User', resourceId: user._id, req,
  });

  sendSuccess(res, { message: 'User permanently deleted.' });
});