'use strict';

const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

const protect = catchAsync(async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) throw new AppError('Not authenticated. Please log in.', 401);

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    throw new AppError('Invalid or expired token.', 401);
  }

  const user = await User.findById(decoded.id).select('+password').populate('publisher');
  if (!user) throw new AppError('User no longer exists.', 401);
  if (!user.isActive) throw new AppError('Account disabled.', 403);
  if (user.changedPasswordAfter(decoded.iat)) throw new AppError('Password changed. Please log in again.', 401);

  req.user = user;
  next();
});

const restrictTo = (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action.', 403));
    }
    next();
  };

const tenantIsolation = (req, res, next) => {
  const { ROLES } = require('../models/User');

  if (req.user.role === ROLES.SUPER_ADMIN) return next();

  const publisherId = req.user.publisher?._id?.toString() || req.user.publisher?.toString();
  if (!publisherId) return next(new AppError('Publisher context missing.', 403));

  req.publisherId = publisherId;

  if (req.params.publisherId && req.params.publisherId !== publisherId) {
    return next(new AppError('Access denied to this resource.', 403));
  }

  next();
};

const apiKeyAuth = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return next(new AppError('API key required.', 401));

    const Publisher = require('../models/Publisher');
    const publisher = await Publisher.findOne({ apiKey, isActive: true });
    if (!publisher) return next(new AppError('Invalid or inactive API key.', 401));

    if (publisher.ipWhitelist?.length > 0) {
      const clientIp = req.ip;
      if (!publisher.ipWhitelist.includes(clientIp)) {
        return next(new AppError('IP not whitelisted.', 403));
      }
    }

    req.publisher = publisher;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { protect, restrictTo, tenantIsolation, apiKeyAuth };
