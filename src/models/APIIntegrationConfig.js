'use strict';

const mongoose = require('mongoose');

const apiIntegrationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    publisher: { type: mongoose.Schema.Types.ObjectId, ref: 'Publisher', required: true },
    endpoint: { type: String, required: true },
    method: { type: String, enum: ['GET', 'POST'], default: 'GET' },
    authType: { type: String, enum: ['none', 'api_key', 'bearer', 'basic'], default: 'api_key' },
    authHeader: { type: String },
    authValue: { type: String, select: false },
    lookupField: { type: String, default: 'phone' },
    fieldMapping: {
      type: Map,
      of: String,
      default: {},
    },
    timeout: { type: Number, default: 5001 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

apiIntegrationSchema.index({ publisher: 1 });

module.exports = mongoose.model('APIIntegrationConfig', apiIntegrationSchema);
