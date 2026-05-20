'use strict';

const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema(
  {
    publisher: { type: mongoose.Schema.Types.ObjectId, ref: 'Publisher', required: true },
    campaign:  { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign',  required: true },
    agent:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    source:    { type: String, enum: ['form', 'api', 'repost'], required: true },
    repostOf:  { type: mongoose.Schema.Types.ObjectId, ref: 'Submission' },

    data: { type: Map, of: mongoose.Schema.Types.Mixed, required: true },

    phone: { type: String, index: true },

    jornaya: {
      enabled: { type: Boolean, default: false },
      valid:   { type: Boolean },
      transId: { type: String },
      message: { type: String },
      raw:     { type: mongoose.Schema.Types.Mixed },
    },

    trustedForm: {
      enabled: { type: Boolean, default: false },
      valid:   { type: Boolean },
      certId:  { type: String },
      reason:  { type: String },
      raw:     { type: mongoose.Schema.Types.Mixed },
    },

    // Primary ringba result (backwards compat)
    ringba: {
      sent:     { type: Boolean, default: false },
      sentAt:   { type: Date },
      response: { type: mongoose.Schema.Types.Mixed },
      error:    { type: String },
    },

    // All destination results (ringba_regular, ringba_rtb, callgrid)
    destinationResults: { type: mongoose.Schema.Types.Mixed, default: {} },

    apiAutofill: {
      used:   { type: Boolean, default: false },
      source: { type: String },
    },

    isDuplicate: { type: Boolean, default: false },

    ipAddress: { type: String },
    userAgent: { type: String },

    status: {
      type:    String,
      enum:    ['pending', 'valid', 'invalid', 'sent', 'failed'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

submissionSchema.index({ publisher: 1, campaign: 1, createdAt: -1 });
submissionSchema.index({ agent: 1, createdAt: -1 });
submissionSchema.index({ phone: 1, publisher: 1 });
submissionSchema.index({ status: 1 });
submissionSchema.index({ source: 1 });

module.exports = mongoose.model('Submission', submissionSchema);
