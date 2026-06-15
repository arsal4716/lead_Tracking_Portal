'use strict';

const mongoose = require('mongoose');

const CALL_STATUS = {
  VALID:            'valid',            // a matching lead existed before the call
  CALL_BEFORE_LEAD: 'call_before_lead', // fraud — call arrived before any lead
  UNMATCHED:        'unmatched',        // no lead at all for this caller (still flagged)
};

const callSchema = new mongoose.Schema(
  {
    // Calls are stored SEPARATELY from leads and are NEVER merged across publishers,
    // even when the callerId is identical.
    publisher:     { type: mongoose.Schema.Types.ObjectId, ref: 'Publisher' },
    publisherName: { type: String, trim: true }, // raw value as received (VendorName)

    campaign:      { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },

    callerId:           { type: String, index: true },
    callerIdNormalized: { type: String, index: true }, // digits-only, last 10

    callTimeStamp: { type: Date },        // when the call hit the tracker
    raw:           { type: mongoose.Schema.Types.Mixed }, // full inbound query/body

    // Lead this call was matched to (if any)
    matchedLead: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission' },

    status: {
      type:    String,
      enum:    Object.values(CALL_STATUS),
      default: CALL_STATUS.UNMATCHED,
    },

    // Convenience flag — true for CALL_BEFORE_LEAD / UNMATCHED
    isFraud: { type: Boolean, default: false },

    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

callSchema.index({ publisher: 1, callerIdNormalized: 1, callTimeStamp: 1 });
callSchema.index({ publisher: 1, createdAt: -1 });
callSchema.index({ status: 1 });
callSchema.index({ isFraud: 1 });

module.exports = mongoose.model('Call', callSchema);
module.exports.CALL_STATUS = CALL_STATUS;
