'use strict';

const mongoose   = require('mongoose');
const Call       = require('../models/Call');
const { CALL_STATUS } = require('../models/Call');
const Publisher  = require('../models/Publisher');
const Submission = require('../models/Submission');
const Campaign   = require('../models/Campaign');
const { ROLES }  = require('../models/User');
const { cleanPhone } = require('../services/ringba.service');
const { sendSuccess, sendPaginated } = require('../utils/response');
const catchAsync = require('../utils/catchAsync');

// ── Lenient timestamp parsing ───────────────────────────────────────────────────
// Accepts epoch seconds, epoch millis, or ISO strings. Falls back to "now".
const parseTimestamp = (raw) => {
  if (!raw) return new Date();
  const str = String(raw).trim();
  if (/^\d{13}$/.test(str)) return new Date(Number(str));        // epoch ms
  if (/^\d{10}$/.test(str)) return new Date(Number(str) * 1000); // epoch s
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date() : d;
};

// ── Public: incoming call event from the call-tracking provider ─────────────────
// GET/POST /api/v1/public/call?callTimeStamp=..&publisherName=..&callerId=..
exports.ingestCall = catchAsync(async (req, res) => {
  const q = { ...req.query, ...req.body };

  const publisherName = q.publisherName || q.VendorName || q.vendorName || null;
  const callerId      = q.callerId || q.CallerId || q.caller_id || q.callerid || null;
  const callTimeStamp = parseTimestamp(q.callTimeStamp || q.BidToCallTime || q.timestamp);
  const callerIdNormalized = cleanPhone(callerId);

  // Resolve publisher by name (never merge across publishers).
  let publisher = null;
  if (publisherName) {
    publisher = await Publisher.findOne({
      name: { $regex: `^${String(publisherName).trim()}$`, $options: 'i' },
    }).select('_id').lean();
  }

  // Optional campaign hint
  let campaignId = null;
  if (q.campaignId && mongoose.isValidObjectId(q.campaignId)) campaignId = q.campaignId;

  // Find the lead this call corresponds to — strictly within the same publisher.
  let matchedLead = null;
  if (publisher && callerIdNormalized) {
    const leadFilter = { publisher: publisher._id, phoneNormalized: callerIdNormalized };
    if (campaignId) leadFilter.campaign = campaignId;
    matchedLead = await Submission.findOne(leadFilter).sort({ createdAt: 1 }).lean();
  }

  // FRAUD RULE: the call is legitimate only if a matching lead was submitted
  // at or before the call time. Otherwise it's CALL_BEFORE_LEAD (or unmatched).
  let status = CALL_STATUS.UNMATCHED;
  let isFraud = true;

  if (matchedLead) {
    const leadAt = new Date(matchedLead.createdAt).getTime();
    if (leadAt <= callTimeStamp.getTime()) {
      status = CALL_STATUS.VALID;
      isFraud = false;
    } else {
      status = CALL_STATUS.CALL_BEFORE_LEAD;
      isFraud = true;
    }
  }

  const call = await Call.create({
    publisher:          publisher?._id || null,
    publisherName:      publisherName || null,
    campaign:           campaignId || (matchedLead ? matchedLead.campaign : null),
    callerId:           callerId || null,
    callerIdNormalized: callerIdNormalized || null,
    callTimeStamp,
    raw:                q,
    matchedLead:        matchedLead?._id || null,
    status,
    isFraud,
    ipAddress:          req.ip,
    userAgent:          req.headers['user-agent'],
  });

  // If fraud, retro-flag the matched lead so it shows RED in the UI.
  if (matchedLead && status === CALL_STATUS.CALL_BEFORE_LEAD) {
    await Submission.findByIdAndUpdate(matchedLead._id, { callBeforeLead: true });
  }

  // Respond 200 quickly — providers expect a lightweight ack.
  res.status(200).json({ status: 'success', data: { recorded: true, callId: call._id, callStatus: status } });
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
  if (req.query.from || req.query.to) {
    filter.callTimeStamp = {};
    if (req.query.from) filter.callTimeStamp.$gte = new Date(req.query.from);
    if (req.query.to) {
      const toDate = new Date(req.query.to);
      toDate.setHours(23, 59, 59, 999);
      filter.callTimeStamp.$lte = toDate;
    }
  }

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

  if (req.query.from || req.query.to) {
    match.callTimeStamp = {};
    if (req.query.from) match.callTimeStamp.$gte = new Date(req.query.from);
    if (req.query.to) {
      const toDate = new Date(req.query.to);
      toDate.setHours(23, 59, 59, 999);
      match.callTimeStamp.$lte = toDate;
    }
  }

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
