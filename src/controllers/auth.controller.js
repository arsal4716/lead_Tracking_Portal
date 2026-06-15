'use strict';

const User = require('../models/User');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { sendSuccess } = require('../utils/response');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const audit = require('../utils/audit');

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
};

const attachTokens = async (user, res) => {
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  user.refreshToken = refreshToken;
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  res.cookie('accessToken', accessToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });

  return { accessToken, refreshToken };
};

exports.register = catchAsync(async (req, res, next) => {
  const { name, email, password, publisherName } = req.body;
  const { ROLES, APPROVAL_STATUS } = require('../models/User');
  const Publisher = require('../models/Publisher');

  // SECURITY: role is ALWAYS agent on self-registration, no exceptions.
  // Client cannot supply or override this. Only super_admin can change roles.
  const role = ROLES.AGENT;

  // Publisher name is typed in manually by the signup form (no dropdown).
  // Resolve by case-insensitive exact match against active publishers.
  const publisher = await Publisher.findOne({
    name: { $regex: `^${publisherName.trim()}$`, $options: 'i' },
    isActive: true,
  });

  if (!publisher) {
    return next(
      new AppError(
        'Publisher not found. Please check the publisher name provided by your admin.',
        404
      )
    );
  }

  // Self-registered accounts are inactive + pending until a super_admin approves.
  // No tokens are issued — the user cannot log in yet.
  const user = await User.create({
    name,
    email,
    password,
    role,
    publisher: publisher._id,
    isActive: false,
    approvalStatus: APPROVAL_STATUS.PENDING,
  });

  await audit({
    user,
    publisher: publisher._id,
    action: 'REGISTER',
    resource: 'User',
    resourceId: user._id,
    req,
  });

  sendSuccess(
    res,
    {
      message: 'Registration received. Your account is pending super admin approval.',
      pendingApproval: true,
    },
    201
  );
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password +refreshToken').populate('publisher', 'name _id isActive');
  if (!user || !(await user.comparePassword(password))) {
    return next(new AppError('Invalid credentials.', 401));
  }

  const { APPROVAL_STATUS } = require('../models/User');
  if (user.approvalStatus === APPROVAL_STATUS.PENDING) {
    return next(new AppError('Your account is pending super admin approval.', 403));
  }
  if (user.approvalStatus === APPROVAL_STATUS.REJECTED) {
    return next(new AppError('Your account request was rejected. Contact your admin.', 403));
  }
  if (!user.isActive) return next(new AppError('Account disabled. Contact support.', 403));
  if (user.publisher && !user.publisher.isActive) return next(new AppError('Publisher account disabled.', 403));

  const tokens = await attachTokens(user, res);

  await audit({ user, publisher: user.publisher?._id, action: 'LOGIN', resource: 'User', resourceId: user._id, req });

  const userObj = user.toObject();
  delete userObj.password;
  delete userObj.refreshToken;

  sendSuccess(res, { user: userObj, ...tokens });
});

exports.refreshToken = catchAsync(async (req, res, next) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) return next(new AppError('Refresh token missing.', 401));

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    return next(new AppError('Invalid refresh token.', 401));
  }

  const user = await User.findById(decoded.id).select('+refreshToken');
  if (!user || user.refreshToken !== token) return next(new AppError('Refresh token invalid or reused.', 401));

  const tokens = await attachTokens(user, res);
  sendSuccess(res, tokens);
});

exports.logout = catchAsync(async (req, res) => {
  if (req.user) {
    await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
  }
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  sendSuccess(res, { message: 'Logged out.' });
});

exports.me = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).populate('publisher', 'name _id slug');
  sendSuccess(res, { user });
});
