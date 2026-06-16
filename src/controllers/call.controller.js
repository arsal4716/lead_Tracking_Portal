'use strict';

const mongoose   = require('mongoose');
const Call       = require('../models/Call');
const { CALL_STATUS } = require('../models/Call');
const { ROLES }  = require('../models/User');
const { cleanPhone } = require('../services/ringba.service');
const { sendSuccess, sendPaginated } = require('../utils/response');
const catchAsync = require('../utils/catchAsync');
const AppError   = require('../utils/AppError');
const audit      = require('../utils/audit');
const { buildDateFilter } = require('../utils/estDate');
const { enqueueCall } = require('../queue/callQueue');

// ── Public: incoming call event from the call-tracking provider ─────────────────
// GET/POST /api/v1/public/call?callTimeStamp=..&publisherName=..&callerId=..
// (also reached via the path-style webhook handler in server.js)
// The event is queued (Redis, 5 concurrent workers) or processed inline.
exports.ingestCall = catchAsync(async (req, res) => {
  // `rawCallParams` is set when the provider fires a path-style webhook with no
  // query separator (e.g. /callTimeStamp=..&publisherName=..&callerId=..).
  const q = req.rawCallParams || { ...req.query, ...req.body };

  const out = await enqueueCall({
    params:    q,
    ip:        req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Respond 200 quickly — providers expect a lightweight ack.
  res.status(200).json({ status: 'success', data: { recorded: true, ...out } });
});

// ── Authed scoping helper ───────────────────────────────────────────────────────
const scopeFilter = (req) => {
  const filter = {};
  if (req.user.role === ROLES.AGENT) {
    // Agents don't own calls; scope to their publisher so they see context only.
    filter.publisher = req.publisherId;
  } else if (req.user.role === ROLES.ADMIN) {
    filter.publisher = req.publisherId;
  } else if (req.query.publisher) {
    filter.publisher = req.query.publisher;
  }
  return filter;
};

// ── GET /calls ──────────────────────────────────────────────────────────────────
exports.getAll = catchAsync(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;

  const filter = scopeFilter(req);
  if (req.query.campaign)  filter.campaign = req.query.campaign;
  if (req.query.status)    filter.status   = req.query.status;
  if (req.query.fraud === 'true')  filter.isFraud = true;
  if (req.query.fraud === 'false') filter.isFraud = false;
  if (req.query.phone) {
    const normalized = cleanPhone(req.query.phone);
    if (normalized) filter.callerIdNormalized = { $regex: normalized, $options: 'i' };
  }
  const dateFilter = buildDateFilter(req.query.from, req.query.to);
  if (dateFilter) filter.callTimeStamp = dateFilter;

  const [calls, total] = await Promise.all([
    Call.find(filter)
      .populate('publisher', 'name')
      .populate('campaign',  'name destination')
      .populate('matchedLead', 'phone createdAt')
      .sort({ callTimeStamp: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Call.countDocuments(filter),
  ]);

  sendPaginated(res, calls, total, page, limit);
});

// ── GET /calls/stats ──────────────────────────────────────────────────────────
// Totals + per-publisher fraud breakdown.
exports.getStats = catchAsync(async (req, res) => {
  const match = scopeFilter(req);
  if (match.publisher) match.publisher = mongoose.Types.ObjectId.createFromHexString(String(match.publisher));

  const dateFilter = buildDateFilter(req.query.from, req.query.to);
  if (dateFilter) match.callTimeStamp = dateFilter;

  const [totals, byStatus, perPublisher] = await Promise.all([
    Call.countDocuments(match),
    Call.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Call.aggregate([
      { $match: match },
      {
        $group: {
          _id:     '$publisher',
          total:   { $sum: 1 },
          invalid: { $sum: { $cond: ['$isFraud', 1, 0] } },
        },
      },
      { $lookup: { from: 'publishers', localField: '_id', foreignField: '_id', as: 'publisher' } },
      { $unwind: { path: '$publisher', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          publisherName: { $ifNull: ['$publisher.name', 'Unknown'] },
          total:    1,
          invalid:  1,
          fraudRate: {
            $cond: [{ $gt: ['$total', 0] }, { $divide: ['$invalid', '$total'] }, 0],
          },
        },
      },
      { $sort: { invalid: -1 } },
    ]),
  ]);

  const invalidCalls = byStatus
    .filter((s) => s._id !== CALL_STATUS.VALID)
    .reduce((acc, s) => acc + s.count, 0);

  sendSuccess(res, {
    totalCalls:   totals,
    invalidCalls,
    validCalls:   totals - invalidCalls,
    fraudRate:    totals > 0 ? invalidCalls / totals : 0,
    byStatus,
    perPublisher,
  });
});

// ── DELETE /calls/:id — super_admin only ──────────────────────────────────────
exports.deleteOne = catchAsync(async (req, res, next) => {
  const call = await Call.findByIdAndDelete(req.params.id);
  if (!call) return next(new AppError('Call not found.', 404));

  await audit({
    user: req.user, publisher: call.publisher,
    action: 'DELETE_CALL', resource: 'Call', resourceId: call._id, req,
  });

  sendSuccess(res, { message: 'Call deleted.' });
});
